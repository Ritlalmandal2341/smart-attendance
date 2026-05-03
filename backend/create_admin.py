"""
Developer-only script to create admin accounts.
Run: python create_admin.py

This is the ONLY way to create admin users.
Public registration always creates student accounts.
"""
import getpass
import sys
from database import SessionLocal, engine
import models, auth

models.Base.metadata.create_all(bind=engine)

def create_admin():
    db = SessionLocal()
    
    print("\n=== Create Admin Account ===\n")
    
    username = input("Username: ").strip()
    if not username:
        print("Error: Username cannot be empty.")
        sys.exit(1)
    
    email = input("Email: ").strip()
    if not email:
        print("Error: Email cannot be empty.")
        sys.exit(1)
    
    # Check if username or email already exists
    existing_user = db.query(models.User).filter(models.User.username == username).first()
    if existing_user:
        print(f"Error: Username '{username}' already exists.")
        # Offer to promote existing user to admin
        promote = input("Promote this existing user to admin? (y/n): ").strip().lower()
        if promote == 'y':
            existing_user.role = models.UserRole.admin  # type: ignore[assignment]
            if email and existing_user.email != email:
                existing_user.email = email  # type: ignore[assignment]
            db.commit()
            print(f"\n✅ User '{username}' promoted to admin successfully!")
            db.close()
            return
        else:
            db.close()
            sys.exit(1)
    
    existing_email = db.query(models.User).filter(models.User.email == email).first()
    if existing_email:
        print(f"Error: Email '{email}' already registered to user '{existing_email.username}'.")
        db.close()
        sys.exit(1)
    
    password = getpass.getpass("Password: ")
    if len(password) < 4:
        print("Error: Password must be at least 4 characters.")
        sys.exit(1)
    
    confirm = getpass.getpass("Confirm Password: ")
    if password != confirm:
        print("Error: Passwords do not match.")
        sys.exit(1)
    
    hashed_password = auth.get_password_hash(password)
    admin_user = models.User(
        username=username,
        email=email,
        hashed_password=hashed_password,
        role=models.UserRole.admin
    )
    db.add(admin_user)
    db.commit()
    
    print(f"\n✅ Admin account '{username}' created successfully!")
    print(f"   Email: {email}")
    print(f"   Role: admin\n")
    
    db.close()

if __name__ == "__main__":
    create_admin()
