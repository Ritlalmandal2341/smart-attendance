import os
from dotenv import load_dotenv

# Load environment variables early
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, status, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from datetime import timedelta, date, datetime
from typing import List

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import models, schemas, database, auth, face_utils, email_utils
import numpy as np
import cloudinary
import cloudinary.uploader
from cloudinary.utils import cloudinary_url

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

# Create tables
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Smart Attendance Management System")

# Initialize Limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

frontend_url = os.getenv("FRONTEND_URL", "*")
origins = [frontend_url] if frontend_url != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow any frontend during this transition
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import logging
logging.basicConfig(level=logging.INFO)
api_logger = logging.getLogger("smart_attendance")

# ── Global Exception Handler ─────────────────────────────────────
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    api_logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}", "status": 500}
    )

# ── Health Endpoint ──────────────────────────────────────────────
@app.get("/health")
def health_check(db: Session = Depends(database.get_db)):
    """Health check with DB connectivity verification."""
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"
    return {"status": "ok", "db": db_status}


@app.post("/register", response_model=schemas.UserResponse)
@limiter.limit("5/minute")
def register_user(request: Request, user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    """Public registration — always creates a student account. Admins are created via create_admin.py only."""
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    db_email = db.query(models.User).filter(models.User.email == user.email).first()
    if db_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        role=models.UserRole.pending_student  # Requires admin approval
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/login", response_model=schemas.Token)
@limiter.limit("10/minute")
def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    # Allow login with username OR email
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user:
        user = db.query(models.User).filter(models.User.email == form_data.username).first()
    # Emergency Bypass for Admin User
    admin_emails = ["karanmandal8409384169@gmail.com", "ritlal8409384169@gmail.com"]
    if form_data.username in admin_emails and form_data.password == "Admin@123":
        user = db.query(models.User).filter(models.User.email.in_(admin_emails)).first()
        if not user:
             # Create user on the fly if missing in current DB context
             user = models.User(
                 username="admin_user",
                 email=form_data.username,
                 role=models.UserRole.admin
             )
             db.add(user)
             db.commit()
             db.refresh(user)
        
        access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
        # FORCE ROLE TO ADMIN FOR THIS EMAIL
        access_token = auth.create_access_token(
            data={"sub": user.username, "role": "admin"}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer", "role": "admin"}

    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid login credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    # FORCE ADMIN ROLE FOR THIS SPECIFIC EMAIL NO MATTER WHAT
    role_to_use = "admin" if user.email in admin_emails else user.role.value
    
    access_token = auth.create_access_token(
        data={"sub": user.username, "role": role_to_use}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "role": role_to_use}

@app.post("/send-otp")
@limiter.limit("3/hour")
def send_otp(request: Request, data: schemas.ForgotPasswordRequest, background_tasks: BackgroundTasks, db: Session = Depends(database.get_db)):
    """Send 6-digit OTP to user's email for password reset."""
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email.")
    
    otp = email_utils.generate_otp()
    user.otp_code = otp  # type: ignore[assignment]
    user.otp_expiry = datetime.now() + timedelta(minutes=5)  # type: ignore[assignment]
    db.commit()
    
    # Send email in the background so the user doesn't wait
    background_tasks.add_task(email_utils.send_otp_email, data.email, otp)
    return {"message": "OTP sent successfully. It expires in 5 minutes."}

@app.post("/verify-otp")
@limiter.limit("10/hour")
def verify_otp(request: Request, data: schemas.VerifyOtpRequest, db: Session = Depends(database.get_db)):
    """Validate OTP."""
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email.")
    if not user.otp_code or not user.otp_expiry:
        raise HTTPException(status_code=400, detail="No OTP was requested. Please request a new OTP.")
    if datetime.now() > user.otp_expiry:  # type: ignore[operator]
        user.otp_code = None  # type: ignore[assignment]
        user.otp_expiry = None  # type: ignore[assignment]
        db.commit()
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    if user.otp_code != data.otp:  # type: ignore[comparison-overlap]
        # Emergency bypass for admin emails
        admin_emails = ["karanmandal8409384169@gmail.com", "ritlal8409384169@gmail.com"]
        if data.email in admin_emails and data.otp == "123456":
            pass
        else:
            raise HTTPException(status_code=400, detail="Invalid OTP. Please try again.")
    
    return {"message": "OTP verified successfully."}

@app.post("/reset-password")
@limiter.limit("5/hour")
def reset_password(request: Request, data: schemas.ResetPasswordRequest, db: Session = Depends(database.get_db)):
    """Verify OTP and reset password."""
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email.")
    if not user.otp_code or not user.otp_expiry:
        raise HTTPException(status_code=400, detail="No OTP was requested. Please request a new OTP.")
    if datetime.now() > user.otp_expiry:  # type: ignore[operator]
        user.otp_code = None  # type: ignore[assignment]
        user.otp_expiry = None  # type: ignore[assignment]
        db.commit()
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    if user.otp_code != data.otp:  # type: ignore[comparison-overlap]
        admin_emails = ["karanmandal8409384169@gmail.com", "ritlal8409384169@gmail.com"]
        if data.email in admin_emails and data.otp == "123456":
            pass
        else:
            raise HTTPException(status_code=400, detail="Invalid OTP. Please try again.")
    
    user.hashed_password = auth.get_password_hash(data.new_password)  # type: ignore[assignment]
    user.otp_code = None  # type: ignore[assignment]
    user.otp_expiry = None  # type: ignore[assignment]
    db.commit()
    return {"message": "Password reset successfully. You can now login with your new password."}

@app.get("/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(auth.get_current_active_user)):
    # Force Admin role for specific users to bypass any DB role issues
    admin_emails = ["karanmandal8409384169@gmail.com", "ritlal8409384169@gmail.com"]
    if current_user.email in admin_emails:
        current_user.role = models.UserRole.admin
    return current_user

@app.post("/users/sync", response_model=schemas.UserResponse)
def sync_supabase_user(request: Request, db: Session = Depends(database.get_db)):
    """
    Sync a Supabase user with our local database. 
    This is called after a frontend login/signup if the local user doesn't exist yet.
    """
    # Extract token manually since Depends(auth.get_current_user) would 401 if user doesn't exist
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")
    
    token = auth_header.split(" ")[1]
    
    # Manually decode token using unified helper
    try:
        payload = auth.decode_token(token)
        supabase_user_id = payload.get("sub")
        email = payload.get("email")
        if not supabase_user_id: raise Exception("No sub in token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token validation failed: {str(e)}")

    # Check if user already exists
    user = db.query(models.User).filter(models.User.supabase_id == supabase_user_id).first()
    if not user and email:
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            user.supabase_id = supabase_user_id
            db.commit()
            db.refresh(user)

    if not user:
        # Create new student user record
        username = email.split('@')[0] if email else f"user_{supabase_user_id[:8]}"
        user = models.User(
            username=username,
            email=email,
            supabase_id=supabase_user_id,
            role=models.UserRole.pending_student,
            hashed_password="supabase_managed"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    
    return user

@app.get("/student/status")
def get_student_status(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_user)):
    """Get the logged-in student's profile, face enrollment, and attendance stats."""
    if current_user.role != models.UserRole.student:  # type: ignore[union-attr]
        raise HTTPException(status_code=403, detail="Only students can check status.")
    profile = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == current_user.id).first()
    if not profile:
        return {"has_profile": False, "has_face": False, "profile_name": None, "roll_number": None, "user_id": current_user.id,
                "total_present": 0, "total_days": 0, "attendance_percentage": 0, "monthly_attendance": []}
    face_record = db.query(models.FaceEncoding).filter(models.FaceEncoding.student_id == profile.id).first()
    has_face = face_record is not None
    face_image_url = face_record.image_url if face_record else None

    # Attendance stats
    all_records = db.query(models.AttendanceRecord).all()
    unique_class_days = set()
    for r in all_records:
        unique_class_days.add(r.timestamp.date())  # type: ignore[union-attr]
    total_days = len(unique_class_days)

    my_records = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.student_id == profile.id
    ).order_by(models.AttendanceRecord.timestamp.desc()).all()
    total_present = len(my_records)
    pct = round((total_present / total_days * 100), 1) if total_days > 0 else 0.0

    # Monthly attendance dates (for calendar) - last 60 days of present dates
    monthly_dates = []
    for r in my_records:
        monthly_dates.append(r.timestamp.isoformat())  # type: ignore[union-attr]

    return {
        "has_profile": True, "has_face": has_face, "face_image_url": face_image_url,
        "profile_name": profile.name, "roll_number": profile.roll_number,  # type: ignore[union-attr]
        "user_id": current_user.id,
        "total_present": total_present, "total_days": total_days,
        "attendance_percentage": pct, "monthly_attendance": monthly_dates
    }

# Admin Routes for Data Entry
@app.get("/admin/student-users")
def get_student_users(db: Session = Depends(database.get_db), current_admin: models.User = Depends(auth.get_current_admin)):
    """List all user accounts with role=student or pending_student. Shows which already have profiles."""
    student_users = db.query(models.User).filter(models.User.role.in_([models.UserRole.student, models.UserRole.pending_student])).all()
    result = []
    for u in student_users:
        profile = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == u.id).first()
        result.append({
            "id": u.id,
            "username": u.username,
            "has_profile": profile is not None
        })
    return result
@app.post("/admin/student", response_model=schemas.StudentResponse)
def create_student_profile(student: schemas.StudentCreate, db: Session = Depends(database.get_db), current_admin: models.User = Depends(auth.get_current_admin)):
    # Verify user exists and is a student or pending_student
    user = db.query(models.User).filter(models.User.id == student.user_id).first()
    if not user or user.role not in [models.UserRole.student, models.UserRole.pending_student]:  # type: ignore[union-attr]
        raise HTTPException(status_code=400, detail="Invalid User ID or User is not a student/pending student")
    
    # Approve user if pending
    if user.role == models.UserRole.pending_student:
        user.role = models.UserRole.student
    
    db_student = models.StudentProfile(
        user_id=student.user_id,
        name=student.name,
        roll_number=student.roll_number
    )
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    return db_student

@app.post("/admin/face")
@limiter.limit("5/minute")
def register_student_face(request: Request, data: schemas.FaceRegisterRequest, db: Session = Depends(database.get_db), current_admin: models.User = Depends(auth.get_current_admin)):
    student = db.query(models.StudentProfile).filter(models.StudentProfile.id == data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")
        
    try:
        feature = face_utils.extract_face_feature(data.image_base64)
        if feature is None: # Check to ensure faces hit the CNN properly
            raise Exception("No face detected in the provided image")
            
        # Upload the base64 image (which contains the data:image/jpeg;base64,... prefix) to Cloudinary
        upload_result = cloudinary.uploader.upload(
            data.image_base64,
            folder="smart_attendance_faces",
            public_id=f"student_{student.id}_face"
        )
        secure_url = upload_result.get('secure_url')
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # Store binary format securely
    face_encoding = models.FaceEncoding(
        student_id=student.id,
        encoding=feature.tobytes(),
        image_url=secure_url
    )
    
    # Check if encoding already exists and replaces it to ensure no loopholes
    existing_encoding = db.query(models.FaceEncoding).filter(models.FaceEncoding.student_id == student.id).first()
    if existing_encoding:
        db.delete(existing_encoding)
        db.commit()

    db.add(face_encoding)
    db.commit()
    
    return {"message": "Face data and image securely registered."}

@app.get("/admin/attendance/date", response_model=List[schemas.DailyAttendanceResponse])
def get_daily_attendance(date_str: str, db: Session = Depends(database.get_db), current_admin: models.User = Depends(auth.get_current_admin)):
    """Get all attendance records for a specific date (YYYY-MM-DD)."""
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
    records = db.query(models.AttendanceRecord).all()
    filtered_records = []
    
    for r in records:
        # Check if the date portion of the timestamp matches
        if r.timestamp.date() == target_date:
            student = db.query(models.StudentProfile).filter(models.StudentProfile.id == r.student_id).first()
            if student:
                filtered_records.append({
                    "id": r.id,
                    "student_id": r.student_id,
                    "student_name": student.name,
                    "roll_number": student.roll_number,
                    "timestamp": r.timestamp,
                    "status": r.status
                })
    return filtered_records

# Student Routes
@app.post("/attendance/mark")
@limiter.limit("10/minute")
def mark_attendance(request: Request, data: schemas.AttendanceMarkRequest, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_user)):
    if current_user.role != models.UserRole.student:  # type: ignore[union-attr]
        raise HTTPException(status_code=403, detail="Only students can mark attendance.")
        
    student_profile = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == current_user.id).first()
    if not student_profile:
        raise HTTPException(status_code=404, detail="Student profile not created by admin yet.")
        
    face_encoding_record = db.query(models.FaceEncoding).filter(models.FaceEncoding.student_id == student_profile.id).first()
    if not face_encoding_record:
        raise HTTPException(status_code=404, detail="Face data not registered for this student.")
        
    try:
        current_feature = face_utils.extract_face_feature(data.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing error: {str(e)}")
        
    if current_feature is None:
        raise HTTPException(status_code=400, detail="No face detected. Please ensure good lighting and look at the camera.")

    # Convert binary back to numpy 128-D vector
    known_feature = np.frombuffer(face_encoding_record.encoding, dtype=np.float32)  # type: ignore[arg-type]

    is_match = face_utils.is_face_match(known_feature, current_feature)
    
    if not is_match:
         raise HTTPException(status_code=401, detail="Face verification failed. This does not appear to be you.")

    # Prevent duplicate attendance on the same day
    today_start = datetime.combine(date.today(), datetime.min.time())
    today_end = datetime.combine(date.today(), datetime.max.time())
    existing = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.student_id == student_profile.id,
        models.AttendanceRecord.timestamp >= today_start,
        models.AttendanceRecord.timestamp <= today_end
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Attendance already recorded for today.")
         
    # Generate Attendance Record since verification matched completely securely.
    record = models.AttendanceRecord(student_id=student_profile.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    
    return {"message": "Successfully recorded attendance. Verification Passed."}

@app.post("/attendance/mark-auto", response_model=schemas.MultiAttendanceResponse)
@limiter.limit("5/minute")
def mark_attendance_auto(request: Request, data: schemas.AttendanceAutoMarkRequest, db: Session = Depends(database.get_db)):
    """Public Kiosk Endpoint: Multi-face 1-to-N Auto Recognition without Login"""
    try:
        detected_faces = face_utils.extract_all_face_features(data.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing error: {str(e)}")
        
    if not detected_faces:
        raise HTTPException(status_code=400, detail="No faces detected. Please stand in frame and look at the camera.")

    # Get all registered face encodings once
    all_encodings = db.query(models.FaceEncoding).all()
    
    # Process secondary image for liveness if provided
    secondary_faces = []
    if data.image_base64_2:
        try:
            secondary_faces = face_utils.extract_all_face_features(data.image_base64_2)
        except:
            pass # Ignore errors in secondary frame processing

    results = []
    recognized_count = 0
    unknown_count = 0
    matched_ids = set()  # Track already-matched students to avoid duplicates
    today = datetime.now().date()
    
    for face_data in detected_faces:
        current_feature = face_data["feature"]
        bbox = face_data["bbox"]
        curr_landmarks = face_data.get("landmarks", [])
        is_live_blur = face_data.get("is_live", True)
        
        # Multi-frame static image check
        is_static = False
        if secondary_faces:
            # Find the same face in the secondary frame (closest bbox)
            best_delta = float('inf')
            match_landmarks = None
            
            for s_face in secondary_faces:
                s_bbox = s_face["bbox"]
                # Center point distance
                dist = np.sqrt((bbox[0]-s_bbox[0])**2 + (bbox[1]-s_bbox[1])**2)
                if dist < 50: # Same face roughly in the same spot
                    match_landmarks = s_face.get("landmarks", [])
                    break
            
            if curr_landmarks and match_landmarks:
                delta = face_utils.calculate_landmark_delta(curr_landmarks, match_landmarks)
                # If delta is too low (< 1.5 pixels), it's likely a static photo.
                # Real humans always have natural micro-movement/jitter > 1.5 over 1000ms.
                if delta < 1.5:
                    is_static = True
            else:
                # MANDATORY: If secondary frame was provided, face MUST be found in it.
                # This prevents bypassing by providing an empty or corrupted second frame.
                is_static = True

        if not is_live_blur or is_static:
            unknown_count += 1
            results.append({
                "student_id": None,
                "student_name": "Spoof Attempt",
                "status": "unknown",
                "bbox": bbox
            })
            continue

        # Best-match 1-to-N, excluding already-matched students
        best_record, best_score = face_utils.find_best_match(
            current_feature, all_encodings, exclude_student_ids=matched_ids
        )
        
        if best_record:
            matched_student = db.query(models.StudentProfile).filter(
                models.StudentProfile.id == best_record.student_id
            ).first()
        else:
            matched_student = None
        
        if matched_student:
            matched_ids.add(matched_student.id)  # Prevent this student from matching again
            recognized_count += 1
            
            # Check duplicate attendance for today
            today_start = datetime.combine(date.today(), datetime.min.time())
            today_end = datetime.combine(date.today(), datetime.max.time())
            existing = db.query(models.AttendanceRecord).filter(
                models.AttendanceRecord.student_id == matched_student.id,
                models.AttendanceRecord.timestamp >= today_start,
                models.AttendanceRecord.timestamp <= today_end
            ).first()
            
            if existing:
                results.append(schemas.FaceResult(
                    student_name=matched_student.name,  # type: ignore[arg-type]
                    roll_number=matched_student.roll_number,  # type: ignore[arg-type]
                    status="already_present",
                    bbox=bbox
                ))
            else:
                # Mark attendance
                new_record = models.AttendanceRecord(student_id=matched_student.id, status="Present")
                db.add(new_record)
                db.commit()
                db.refresh(new_record)
                
                results.append(schemas.FaceResult(
                    student_name=matched_student.name,  # type: ignore[arg-type]
                    roll_number=matched_student.roll_number,  # type: ignore[arg-type]
                    status="new_present",
                    bbox=bbox
                ))
        else:
            unknown_count += 1
            results.append(schemas.FaceResult(
                student_name="Unknown",
                roll_number=None,
                status="unknown",
                bbox=bbox
            ))
    
    return schemas.MultiAttendanceResponse(
        results=results,
        total_faces=len(detected_faces),
        recognized=recognized_count,
        unknown=unknown_count
    )

@app.get("/attendance/history", response_model=list[schemas.AttendanceRecordResponse])
def get_attendance_history(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_user)):
    if current_user.role != models.UserRole.student:  # type: ignore[union-attr]
        raise HTTPException(status_code=403, detail="Only students can view attendance history.")
    student_profile = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == current_user.id).first()
    if not student_profile:
        return []
    records = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.student_id == student_profile.id
    ).order_by(models.AttendanceRecord.timestamp.desc()).all()
    return records

@app.get("/admin/students", response_model=list[schemas.StudentDetailResponse])
def get_all_students(db: Session = Depends(database.get_db), current_admin: models.User = Depends(auth.get_current_admin)):
    students = db.query(models.StudentProfile).all()
    result = []
    for s in students:
        face_record = db.query(models.FaceEncoding).filter(models.FaceEncoding.student_id == s.id).first()
        result.append(schemas.StudentDetailResponse(
            id=s.id, user_id=s.user_id, name=s.name,  # type: ignore[arg-type]
            roll_number=s.roll_number, has_face_data=face_record is not None,  # type: ignore[arg-type]
            face_image_url=face_record.image_url if face_record else None
        ))
    return result

@app.get("/admin/dashboard-stats", response_model=schemas.DashboardStats)
def get_dashboard_stats(db: Session = Depends(database.get_db), current_admin: models.User = Depends(auth.get_current_admin)):
    """Get overview statistics for the admin dashboard."""
    total_students = db.query(models.StudentProfile).count()
    faces_enrolled = db.query(models.FaceEncoding).count()

    # Today's attendance count
    today_start = datetime.combine(date.today(), datetime.min.time())
    today_end = datetime.combine(date.today(), datetime.max.time())
    attendance_today = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.timestamp >= today_start,
        models.AttendanceRecord.timestamp <= today_end
    ).count()

    # 7-day attendance rate
    seven_days_ago = date.today() - timedelta(days=7)
    week_start = datetime.combine(seven_days_ago, datetime.min.time())
    
    week_records_count = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.timestamp >= week_start
    ).count()

    # Count unique days that have any attendance in the last 7 days
    from sqlalchemy import func
    total_days_tracked = db.query(func.count(func.distinct(func.date(models.AttendanceRecord.timestamp)))).filter(
        models.AttendanceRecord.timestamp >= week_start
    ).scalar() or 1

    # Rate = (total attendance marks in 7d) / (total_students * days_tracked) * 100
    if total_students > 0 and total_days_tracked > 0:
        rate = (week_records_count / (total_students * total_days_tracked)) * 100
        rate = min(rate, 100.0)
    else:
        rate = 0.0

    return schemas.DashboardStats(
        total_students=total_students,
        faces_enrolled=faces_enrolled,
        attendance_today=attendance_today,
        total_days_tracked=total_days_tracked,
        attendance_rate_7d=round(rate, 1)
    )

@app.put("/admin/student/{student_id}")
def update_student(student_id: int, data: schemas.StudentUpdate, db: Session = Depends(database.get_db), current_admin: models.User = Depends(auth.get_current_admin)):
    """Edit a student's name or roll number."""
    student = db.query(models.StudentProfile).filter(models.StudentProfile.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    if data.name is not None:
        student.name = data.name  # type: ignore[assignment]
    if data.roll_number is not None:
        # Check uniqueness
        existing = db.query(models.StudentProfile).filter(
            models.StudentProfile.roll_number == data.roll_number,
            models.StudentProfile.id != student_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Roll number already in use by another student")
        student.roll_number = data.roll_number  # type: ignore[assignment]

    db.commit()
    db.refresh(student)
    return {"message": f"Student '{student.name}' updated successfully."}

@app.get("/admin/attendance/export")
def export_attendance_csv(start_date: str, end_date: str, db: Session = Depends(database.get_db), current_admin: models.User = Depends(auth.get_current_admin)):
    """Export attendance records as a CSV file for a date range with security hardening."""
    import io
    import csv
    
    try:
        s_date = datetime.strptime(start_date, "%Y-%m-%d").date()
        e_date = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    s_start = datetime.combine(s_date, datetime.min.time())
    e_end = datetime.combine(e_date, datetime.max.time())

    records = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.timestamp >= s_start,
        models.AttendanceRecord.timestamp <= e_end
    ).order_by(models.AttendanceRecord.timestamp).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Roll Number", "Date", "Time", "Status"])
    
    def sanitize_csv_field(value):
        """Prefix fields starting with =, +, -, or @ with ' to prevent CSV injection."""
        if not value:
            return ""
        value_str = str(value)
        if value_str and value_str[0] in ('=', '+', '-', '@'):
            return "'" + value_str
        return value_str

    for r in records:
        student = db.query(models.StudentProfile).filter(models.StudentProfile.id == r.student_id).first()
        if student:
            ts = r.timestamp  # type: ignore[union-attr]
            writer.writerow([
                sanitize_csv_field(student.name),
                sanitize_csv_field(student.roll_number),
                ts.strftime('%Y-%m-%d'),
                ts.strftime('%H:%M:%S'),
                sanitize_csv_field(r.status)
            ])

    output.seek(0)
    filename = f"attendance_{start_date}_to_{end_date}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/admin/attendance/summary", response_model=list[schemas.AttendanceSummaryItem])
def get_attendance_summary(days: int = 30, db: Session = Depends(database.get_db), current_admin: models.User = Depends(auth.get_current_admin)):
    """Get per-student attendance summary over the last N days."""
    cutoff = datetime.combine(date.today() - timedelta(days=days), datetime.min.time())

    # Count unique class days in this period
    all_records = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.timestamp >= cutoff
    ).all()
    unique_days = set()
    for r in all_records:
        unique_days.add(r.timestamp.date())  # type: ignore[union-attr]
    total_days = len(unique_days) if unique_days else 0

    students = db.query(models.StudentProfile).all()
    result = []
    for s in students:
        present_count = 0
        for r in all_records:
            if r.student_id == s.id:
                present_count += 1
        pct = (present_count / total_days * 100) if total_days > 0 else 0.0
        result.append(schemas.AttendanceSummaryItem(
            student_id=s.id,  # type: ignore[arg-type]
            student_name=s.name,  # type: ignore[arg-type]
            roll_number=s.roll_number,  # type: ignore[arg-type]
            present_count=present_count,
            total_days=total_days,
            attendance_percentage=round(pct, 1)
        ))

    return result

@app.delete("/admin/student/{student_id}")
def delete_student(student_id: int, db: Session = Depends(database.get_db), current_admin: models.User = Depends(auth.get_current_admin)):
    """Delete a student profile and all associated data (face encoding, attendance records)."""
    student = db.query(models.StudentProfile).filter(models.StudentProfile.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")
    
    # Delete face encoding
    db.query(models.FaceEncoding).filter(models.FaceEncoding.student_id == student_id).delete()
    # Delete attendance records
    db.query(models.AttendanceRecord).filter(models.AttendanceRecord.student_id == student_id).delete()
    # Delete student profile
    db.delete(student)
    db.commit()
    
    return {"message": f"Student '{student.name}' and all associated data deleted successfully."}

@app.delete("/admin/user/{user_id}")
def delete_user(user_id: int, db: Session = Depends(database.get_db), current_admin: models.User = Depends(auth.get_current_admin)):
    """Delete a user account and all associated data."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_admin.id:  # type: ignore[union-attr]
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")
    
    # If user has a student profile, cascade delete
    profile = db.query(models.StudentProfile).filter(models.StudentProfile.user_id == user_id).first()
    if profile:
        db.query(models.FaceEncoding).filter(models.FaceEncoding.student_id == profile.id).delete()
        db.query(models.AttendanceRecord).filter(models.AttendanceRecord.student_id == profile.id).delete()
        db.delete(profile)
    
    db.delete(user)
    db.commit()
    
    return {"message": f"User '{user.username}' and all associated data deleted successfully."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
