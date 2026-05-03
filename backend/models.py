from sqlalchemy import Column, Integer, String, Enum, ForeignKey, LargeBinary, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from database import Base

class UserRole(str, enum.Enum):
    admin = "admin"
    student = "student"
    pending_student = "pending_student"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)  # nullable for migration
    hashed_password = Column(String, nullable=True) # Nullable for Supabase managed auth
    role = Column(Enum(UserRole), default=UserRole.student, nullable=False)
    supabase_id = Column(String, unique=True, index=True, nullable=True)
    otp_code = Column(String, nullable=True)
    otp_expiry = Column(DateTime, nullable=True)

class StudentProfile(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    name = Column(String, nullable=False)
    roll_number = Column(String, unique=True, index=True, nullable=False)

    user = relationship("User", backref="student_profile")
    face_encoding = relationship("FaceEncoding", back_populates="student", uselist=False)
    attendance = relationship("AttendanceRecord", back_populates="student")

class FaceEncoding(Base):
    __tablename__ = "face_encodings"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), unique=True)
    # Storing the 128-d numpy array as binary data
    encoding = Column(LargeBinary, nullable=False)
    image_url = Column(String, nullable=True)

    student = relationship("StudentProfile", back_populates="face_encoding")

class AttendanceRecord(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, default="Present")

    student = relationship("StudentProfile", back_populates="attendance")
