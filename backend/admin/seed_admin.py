"""
Create the first TraidiumX admin account.

Run from backend folder:
    python -m admin.seed_admin

Optional env values:
    ADMIN_SEED_EMAIL=admin@traidiumx.com
    ADMIN_SEED_PASSWORD=Admin@12345
    ADMIN_SEED_NAME="Super Admin"
"""
import os

from dotenv import load_dotenv

from config.database import connect_database
from utils.password_helper import hash_password
from utils.validators import validate_email_address, validate_password_strength
from .models import seed_admin_if_missing, format_admin


load_dotenv()


def main():
    email = os.getenv("ADMIN_SEED_EMAIL", "admin@traidiumx.com").strip().lower()
    password = os.getenv("ADMIN_SEED_PASSWORD", "Admin@12345")
    name = os.getenv("ADMIN_SEED_NAME", "Super Admin").strip()

    is_valid_email, email_error = validate_email_address(email)
    if not is_valid_email:
        raise ValueError(email_error)

    is_valid_password, password_error = validate_password_strength(password)
    if not is_valid_password:
        raise ValueError(password_error)

    connect_database()
    admin, created = seed_admin_if_missing(
        email=email,
        password_hash=hash_password(password),
        name=name,
        role="super_admin",
    )

    print("========================================")
    print(" TraidiumX Admin Seed")
    print("========================================")
    print(f"Created: {created}")
    print(f"Admin: {format_admin(admin)}")
    if created:
        print("Default login created successfully.")
        print(f"Email: {email}")
        print(f"Password: {password}")
    else:
        print("Admin already exists. Existing password was not changed.")


if __name__ == "__main__":
    main()
