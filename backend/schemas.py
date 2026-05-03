from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum
import html

class UserRoleSchema(str, Enum):
    admin = "admin"
    student = "student"
    pending_student = "pending_student"

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: UserRoleSchema = UserRoleSchema.student

    @field_validator('username')
    @classmethod
    def sanitize_username(cls, v):
        return html.escape(v.strip())

class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    role: UserRoleSchema

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str

class TokenData(BaseModel):
    username: Optional[str] = None

class StudentCreate(BaseModel):
    user_id: int
    name: str
    roll_number: str

    @field_validator('name', 'roll_number')
    @classmethod
    def sanitize_student_fields(cls, v):
        return html.escape(v.strip())

class StudentResponse(BaseModel):
    id: int
    user_id: int
    name: str
    roll_number: str

    class Config:
        from_attributes = True

class StudentDetailResponse(BaseModel):
    id: int
    user_id: int
    name: str
    roll_number: str
    has_face_data: bool
    face_image_url: Optional[str] = None

    class Config:
        from_attributes = True

class FaceRegisterRequest(BaseModel):
    student_id: int
    image_base64: str

class AttendanceMarkRequest(BaseModel):
    image_base64: str  # For student webcam submission

class AttendanceAutoMarkRequest(BaseModel):
    image_base64: str  # Primary image for recognition
    image_base64_2: Optional[str] = None # Secondary image for liveness verification

class FaceResult(BaseModel):
    student_name: str
    roll_number: Optional[str] = None
    status: str  # "new_present", "already_present", "unknown"
    bbox: List[int]  # [x, y, w, h]

class MultiAttendanceResponse(BaseModel):
    results: List[FaceResult]
    total_faces: int
    recognized: int
    unknown: int

class DailyAttendanceResponse(BaseModel):
    id: int
    student_id: int
    student_name: str
    roll_number: str
    timestamp: datetime
    status: str

    class Config:
        from_attributes = True

class AttendanceRecordResponse(BaseModel):
    id: int
    student_id: int
    timestamp: datetime
    status: str

    class Config:
        from_attributes = True

class DashboardStats(BaseModel):
    total_students: int
    faces_enrolled: int
    attendance_today: int
    total_days_tracked: int
    attendance_rate_7d: float  # percentage over last 7 days


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    roll_number: Optional[str] = None

    @field_validator('name', 'roll_number', mode='before')
    @classmethod
    def sanitize_input(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            # Strip whitespace and escape HTML special characters
            return html.escape(v.strip())
        return v

class ForgotPasswordRequest(BaseModel):
    email: str

class VerifyOtpRequest(BaseModel):
    email: str
    otp: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

class AttendanceSummaryItem(BaseModel):
    student_id: int
    student_name: str
    roll_number: str
    present_count: int
    total_days: int
    attendance_percentage: float
