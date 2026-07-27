import time

import requests

from config.settings import settings


def verify_google_id_token(id_token):
    """Verify a Google Identity Services ID token with Google's tokeninfo endpoint.

    This keeps Google sign-up backend controlled. The frontend never decides the
    user identity; it only passes the credential returned by Google.
    """
    token = str(id_token or "").strip()

    if not settings.GOOGLE_AUTH_ENABLED or not settings.GOOGLE_CLIENT_ID:
        return {
            "success": False,
            "message": "Google sign-up is not configured.",
            "errors": {
                "google": "Set GOOGLE_AUTH_ENABLED=true and GOOGLE_CLIENT_ID in backend .env."
            },
            "status_code": 503
        }

    if not token:
        return {
            "success": False,
            "message": "Google credential is required.",
            "errors": {
                "credential": "Google ID token is required."
            },
            "status_code": 422
        }

    try:
        response = requests.get(
            settings.GOOGLE_TOKENINFO_URL,
            params={"id_token": token},
            timeout=settings.GOOGLE_TOKEN_VERIFY_TIMEOUT
        )

        if response.status_code != 200:
            return {
                "success": False,
                "message": "Google credential verification failed.",
                "errors": {
                    "google": "Google returned an invalid credential response."
                },
                "status_code": 401
            }

        payload = response.json()

    except requests.RequestException:
        return {
            "success": False,
            "message": "Google verification service is unavailable.",
            "errors": {
                "google": "Unable to contact Google token verification service."
            },
            "status_code": 503
        }

    audience = payload.get("aud")
    issuer = payload.get("iss")
    email = str(payload.get("email") or "").strip().lower()
    email_verified = str(payload.get("email_verified") or "").lower() == "true"
    expires_at = int(payload.get("exp") or 0)
    subject = str(payload.get("sub") or "").strip()

    if audience != settings.GOOGLE_CLIENT_ID:
        return {
            "success": False,
            "message": "Google credential audience mismatch.",
            "errors": {
                "audience": "The Google credential does not belong to this TraidiumX app."
            },
            "status_code": 401
        }

    if issuer not in ["accounts.google.com", "https://accounts.google.com"]:
        return {
            "success": False,
            "message": "Google credential issuer mismatch.",
            "errors": {
                "issuer": "Google credential issuer is invalid."
            },
            "status_code": 401
        }

    if not subject or not email:
        return {
            "success": False,
            "message": "Google credential is missing account information.",
            "errors": {
                "google": "Google credential is missing subject or email."
            },
            "status_code": 401
        }

    if not email_verified:
        return {
            "success": False,
            "message": "Google email is not verified.",
            "errors": {
                "email": "Please use a verified Google account."
            },
            "status_code": 403
        }

    if expires_at and expires_at < int(time.time()):
        return {
            "success": False,
            "message": "Google credential is expired.",
            "errors": {
                "credential": "Please try Google sign-up again."
            },
            "status_code": 401
        }

    return {
        "success": True,
        "data": {
            "google_sub": subject,
            "email": email,
            "name": str(payload.get("name") or email.split("@")[0]).strip(),
            "picture": payload.get("picture", ""),
            "email_verified": True
        }
    }
