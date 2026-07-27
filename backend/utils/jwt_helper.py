from datetime import timedelta

import jwt

from config.settings import settings
from utils.date_helper import now_utc


def generate_token(user_id, email, role="user"):
    if not user_id or not email:
        raise ValueError("User ID and email are required to generate token.")

    issued_at = now_utc()
    expires_at = issued_at + timedelta(hours=settings.JWT_EXPIRES_IN_HOURS)

    payload = {
        "user_id": str(user_id),
        "email": email,
        "role": role,
        "iat": issued_at,
        "exp": expires_at
    }

    token = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm="HS256"
    )

    return token


def verify_token(token):
    if not token:
        return {
            "valid": False,
            "message": "Token is required.",
            "data": None
        }

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=["HS256"]
        )

        return {
            "valid": True,
            "message": "Token is valid.",
            "data": payload
        }

    except jwt.ExpiredSignatureError:
        return {
            "valid": False,
            "message": "Token has expired.",
            "data": None
        }

    except jwt.InvalidTokenError:
        return {
            "valid": False,
            "message": "Invalid token.",
            "data": None
        }