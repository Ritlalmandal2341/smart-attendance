# Smart Attendance Management System — Project Memory

## Overview
A full-stack **Smart Attendance Management System** with facial recognition. Students can mark attendance via webcam face verification, and an auto-attendance kiosk mode supports multi-face 1-to-N recognition with liveness detection.

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19 + Vite 7, React Router v7, Lucide icons, react-webcam |
| **Backend** | FastAPI (Python), SQLAlchemy ORM, SQLite (default, Postgres fallback) |
| **Auth** | Supabase Auth (JWT) — frontend login/signup via `@supabase/supabase-js`, backend validates JWTs via JWKS |
| **Face Recognition** | OpenCV DNN — YuNet (detection) + SFace (recognition) via `.onnx` models |
| **Image Storage** | Cloudinary (face enrollment photos) |
| **Rate Limiting** | slowapi |

## Project Structure

```
Internal hackathon2/
├── backend/
│   ├── main.py            # FastAPI app — all API routes (723 lines)
│   ├── models.py           # SQLAlchemy models: User, StudentProfile, FaceEncoding, AttendanceRecord
│   ├── schemas.py          # Pydantic request/response schemas
│   ├── auth.py             # JWT decode (Supabase JWKS + legacy HS256), password hashing, role guards
│   ├── database.py         # SQLAlchemy engine + session (SQLite/Postgres)
│   ├── face_utils.py       # YuNet face detection, SFace feature extraction, matching, liveness
│   ├── email_utils.py      # OTP email sending for forgot-password
│   ├── create_admin.py     # CLI script to create admin users
│   ├── attendance.db       # SQLite database file
│   ├── yunet.onnx          # Face detection model
│   ├── sface.onnx          # Face recognition model (38MB)
│   └── .env                # SECRET_KEY, SUPABASE_URL, CLOUDINARY creds, SMTP creds
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                    # React entry point
│   │   ├── App.jsx                     # Router + routes + PrivateRoute + Header
│   │   ├── supabaseClient.js           # Supabase client init from env vars
│   │   ├── context/AuthContext.jsx     # Auth provider — Supabase session + backend /users/me sync
│   │   ├── components/
│   │   │   ├── Login.jsx               # Login page (email/password via Supabase)
│   │   │   ├── Register.jsx            # Registration page
│   │   │   ├── ForgotPassword.jsx      # OTP-based password reset
│   │   │   ├── ThemeToggle.jsx         # Dark/light mode toggle
│   │   │   ├── AutoAttendance.jsx      # Kiosk mode — multi-face auto-recognition
│   │   │   ├── Admin/AdminDashboard.jsx  # Admin panel (students, faces, attendance, stats)
│   │   │   └── Student/StudentDashboard.jsx  # Student view (status, webcam attendance, history)
│   │   ├── index.css                   # Global styles + theme variables
│   │   └── App.css
│   ├── .env                            # VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
│   └── package.json
```

## Key Routes

### Frontend Routes (React Router)
| Path | Component | Access |
|---|---|---|
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/forgot-password` | ForgotPassword | Public |
| `/admin/*` | AdminDashboard | Admin only (PrivateRoute) |
| `/attendance/*` | StudentDashboard | Student only (PrivateRoute) |
| `/auto-attendance` | AutoAttendance | Public (kiosk) |
| `/` | RootRedirect | Redirects based on role |
| `*` | Catch-all → `/` | Redirects unknown routes |

### Backend API Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | `/register` | Register new student user |
| POST | `/login` | Login (username/email + password) |
| POST | `/forgot-password` | Send OTP email |
| POST | `/reset-password` | Reset password with OTP |
| GET | `/users/me` | Current user profile |
| POST | `/users/sync` | Sync Supabase user to local DB |
| GET | `/student/status` | Student profile + attendance stats |
| POST | `/attendance/mark` | Mark attendance (1-to-1 face verify) |
| POST | `/attendance/mark-auto` | Kiosk multi-face auto-attendance |
| GET | `/attendance/history` | Student's attendance history |
| GET | `/admin/students` | List all student profiles |
| GET | `/admin/student-users` | List student user accounts |
| POST | `/admin/student` | Create student profile |
| PUT | `/admin/student/{id}` | Update student profile |
| DELETE | `/admin/student/{id}` | Delete student + data |
| DELETE | `/admin/user/{id}` | Delete user + all data |
| POST | `/admin/face` | Register student face |
| GET | `/admin/dashboard-stats` | Dashboard statistics |
| GET | `/admin/attendance/date` | Attendance by date |
| GET | `/admin/attendance/summary` | Per-student summary (N days) |
| GET | `/admin/attendance/export` | Export CSV |

## Database Models
- **User** — id, username, email, hashed_password, role (admin/student), supabase_id, otp_code, otp_expiry
- **StudentProfile** — id, user_id (FK→User), name, roll_number
- **FaceEncoding** — id, student_id (FK→StudentProfile), encoding (binary 128-d float32), image_url
- **AttendanceRecord** — id, student_id (FK→StudentProfile), timestamp, status

## Auth Flow
1. Frontend uses **Supabase Auth** (`signInWithPassword` / `signUp`)
2. On session, frontend calls backend `/users/me` with Supabase JWT
3. If 401, tries `/users/sync` to auto-create local user record
4. Backend `auth.py` decodes JWT using Supabase JWKS (RS256) or falls back to local SECRET_KEY (HS256)

## Face Recognition Flow
- **Enrollment**: Admin captures face → `face_utils.extract_face_feature()` → 128-d vector stored as binary + image uploaded to Cloudinary
- **Verification (1:1)**: Student captures face → compare with stored encoding → `cosine_similarity > 0.363`
- **Auto-attendance (1:N)**: Kiosk captures frame → detect all faces → match each against all stored encodings → best match wins
- **Liveness**: Two-frame landmark delta check (< 1.5px = static/spoof) + blur detection

## Running the App
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev   # → http://localhost:5173
```

## Environment Variables

### Backend `.env`
- `SECRET_KEY` — JWT signing key (legacy)
- `SUPABASE_URL` — Supabase project URL
- `DATABASE_URL` — (optional, defaults to SQLite)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `FROM_EMAIL`

### Frontend `.env`
- `VITE_API_URL` — Backend URL (default: `http://127.0.0.1:8000`)
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key

## Known Issues & Notes
- Supabase project URL must be valid/reachable or auth initialization will hang, causing blank screen
- Admin users can only be created via `create_admin.py` CLI script
- Face recognition uses OpenCV DNN with YuNet + SFace ONNX models (must be in backend root)
- Duplicate attendance is prevented per-student per-day using timestamp range check
