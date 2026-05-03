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
    # Force Postgres/Supabase connection - NO SQLITE FALLBACK
    print(f"Connecting to: {SQLALCHEMY_DATABASE_URL.split('@')[-1]}") # Log only host for security
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        pool_pre_ping=True,
        connect_args={"sslmode": "require"} if "postgresql" in SQLALCHEMY_DATABASE_URL else {}
    )
    # Test connection immediately
    with engine.connect() as conn:
        print("Successfully connected to Supabase PostgreSQL!")
    return engine

engine = create_db_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
