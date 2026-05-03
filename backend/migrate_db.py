import sqlite3
import os

db_path = 'attendance.db'

def migrate():
    if not os.path.exists(db_path):
        print(f"{db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check columns in users table
    cursor.execute("PRAGMA table_info(users)")
    columns = [row[1] for row in cursor.fetchall()]
    print(f"Current columns in 'users': {columns}")

    # Add missing columns
    migrations = [
        ("email", "TEXT"),
        ("supabase_id", "TEXT"),
        ("otp_code", "TEXT"),
        ("otp_expiry", "DATETIME")
    ]

    for col_name, col_type in migrations:
        if col_name not in columns:
            print(f"Adding column {col_name}...")
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
                conn.commit()
            except sqlite3.OperationalError as e:
                print(f"Error adding {col_name}: {e}")
        else:
            print(f"Column {col_name} already exists.")

    # Also check if supabase_id should be unique and indexed
    # Adding index if not exists
    try:
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_supabase_id ON users (supabase_id)")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)")
        conn.commit()
    except Exception as e:
        print(f"Error creating indexes: {e}")

    conn.close()
    print("Migration finished.")

if __name__ == "__main__":
    migrate()
