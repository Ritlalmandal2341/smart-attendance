import database
import models

print("Starting full database reset...")
try:
    models.Base.metadata.drop_all(bind=database.engine)
    print("Dropped all tables successfully.")
    models.Base.metadata.create_all(bind=database.engine)
    print("Recreated all tables successfully.")
except Exception as e:
    print(f"Error resetting database: {e}")
