import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm import declarative_base
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Use environment variable for database URL or default to SQLite
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./attendance.db")
SQLALCHEMY_DATABASE_URL_SQLITE = "sqlite:///./attendance.db"
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

def create_db_engine():
    try:
        # We use pool_pre_ping to liveness check the connection
        test_engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
        # Try to connect to verify credentials
        with test_engine.connect() as conn:
            pass
        print("Successfully connected to Supabase PostgreSQL!")
        return test_engine
    except Exception as e:
        print(f"!!! CRITICAL: Supabase connection failed: {str(e)}")
        print("Falling back to temporary SQLite (Warning: Data will be lost on redeploy)")
        return create_engine(
            SQLALCHEMY_DATABASE_URL_SQLITE, connect_args={"check_same_thread": False}
        )

engine = create_db_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
