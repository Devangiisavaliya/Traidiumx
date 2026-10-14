from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

from config.settings import settings


client = None
db = None


def connect_database():
    global client, db

    if not settings.MONGO_URI:
        raise ValueError("MONGO_URI is missing in .env file.")

    client = MongoClient(
        settings.MONGO_URI,
        serverSelectionTimeoutMS=20000,
        connectTimeoutMS=20000,
        socketTimeoutMS=30000,
        maxPoolSize=50,
        minPoolSize=0,
        maxIdleTimeMS=45000,
        retryWrites=True,
    )

    db = client[settings.MONGO_DB_NAME]

    client.admin.command("ping")

    return db


def get_database():
    global db

    if db is None:
        return connect_database()

    return db


def ping_database():
    try:
        database = get_database()

        return {
            "connected": True,
            "database": settings.MONGO_DB_NAME,
            "message": "MongoDB Atlas connected successfully."
        }

    except (ConnectionFailure, ServerSelectionTimeoutError) as error:
        return {
            "connected": False,
            "database": settings.MONGO_DB_NAME,
            "message": "MongoDB Atlas connection failed.",
            "error": str(error)
        }

    except Exception as error:
        return {
            "connected": False,
            "database": settings.MONGO_DB_NAME,
            "message": "MongoDB Atlas connection error.",
            "error": str(error)
        }