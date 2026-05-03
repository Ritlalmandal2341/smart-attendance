from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import models, schemas, database
import os
import bcrypt
import base64
import requests
import logging
from threading import Lock

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"

_jwks_cache = None
_jwks_lock = Lock()

def get_jwks():
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    with _jwks_lock:
        if _jwks_cache: return _jwks_cache
        try:
            response = requests.get(JWKS_URL, timeout=10)
            response.raise_for_status()
            _jwks_cache = response.json()
            return _jwks_cache
        except Exception as e:
            logger.error(f"Failed to fetch JWKS from {JWKS_URL}: {e}")
            return None

ALGORITHM = "RS256"
SUPPORTED_ALGORITHMS = ["RS256", "ES256", "HS256"]
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 1 day

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def verify_password(plain_password, hashed_password):
    """Legacy: Used for local password verification during transition."""
    if not hashed_password: return False
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    """Legacy: Used for local password hashing."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Legacy: Used for generating local JWTs."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")

def decode_token(token: str):
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        
        # If there's no kid, it might be a local/symmetric token
        if not kid:
            return jwt.decode(token, SECRET_KEY, algorithms=["HS256"], options={"verify_aud": False})
        else:
            jwks = get_jwks()
            if not jwks or 'keys' not in jwks:
                raise Exception("JWKS not available or invalid")
            
            # Find the specific key that matches the 'kid'
            rsa_key = {}
            for key in jwks['keys']:
                if key['kid'] == kid:
                    rsa_key = key
                    break
            
            if not rsa_key:
                raise Exception("Public key not found in JWKS")
                
            return jwt.decode(token, rsa_key, algorithms=SUPPORTED_ALGORITHMS, options={"verify_aud": False})
    except Exception as e:
        logger.error(f"Token decoding failed: {e}")
        raise e

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = decode_token(token)
        username_or_id = payload.get("sub")
        email = payload.get("email")
        
        if username_or_id is None:
            raise credentials_exception
            
        # Try to find by supabase_id first
        user = db.query(models.User).filter(models.User.supabase_id == username_or_id).first()
        
        # Fallback: Find by username or email (for local/bypass users)
        if not user:
            user = db.query(models.User).filter(
                (models.User.username == username_or_id) | 
                (models.User.email == (email or username_or_id))
            ).first()
            
        if user is None:
            raise credentials_exception
            
        # If we logged in via Supabase but the user was found via local lookup, link them
        if not user.supabase_id and username_or_id:
            user.supabase_id = username_or_id
            db.commit()
            db.refresh(user)
    except Exception as e:
        logger.error(f"Error in get_current_user: {e}")
        raise credentials_exception
        
    return user

def get_current_active_user(current_user: models.User = Depends(get_current_user)):
    return current_user

def get_current_admin(current_user: models.User = Depends(get_current_active_user)):
    if current_user.role != models.UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough privileges")
    return current_user
