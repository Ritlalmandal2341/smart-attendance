import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm import declarative_base

# Use environment variable for database URL or default to SQLite
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./attendance.db")
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

def create_db_engine():
    try:
        # Test connection first without crashing
        test_engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
        test_engine.connect().close()
        return test_engine
    except Exception as e:
        print(f"Postgres connection failed: {e}. Falling back to SQLite.")
        sqlite_url = "sqlite:///./attendance.db"
        return create_engine(sqlite_url, connect_args={"check_same_thread": False})

engine = create_db_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
