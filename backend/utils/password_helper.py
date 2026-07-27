import bcrypt


def hash_password(password):
    if not password:
        raise ValueError("Password is required.")

    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(password_bytes, salt)

    return hashed_password.decode("utf-8")


def verify_password(plain_password, hashed_password):
    if not plain_password or not hashed_password:
        return False

    try:
        plain_password_bytes = plain_password.encode("utf-8")
        hashed_password_bytes = hashed_password.encode("utf-8")

        return bcrypt.checkpw(plain_password_bytes, hashed_password_bytes)

    except Exception:
        return False