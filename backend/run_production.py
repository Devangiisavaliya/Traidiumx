import os
import sys

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from waitress import serve
from app import app
from config.settings import settings

if __name__ == "__main__":
    host = settings.APP_HOST or "0.0.0.0"
    port = int(settings.APP_PORT or 5000)
    threads = int(os.getenv("SERVER_THREADS", 24))

    print("==================================================")
    print(" [READY] TraidiumX Enterprise Production Server (WSGI)")
    print(f" Environment: {settings.APP_ENV}")
    print(f" Listening on: http://{host}:{port}")
    print(f" Multi-threading: {threads} worker threads enabled")
    print(" Connection Pooling: High Performance & Auto-Recovery")
    print("==================================================")

    serve(
        app,
        host=host,
        port=port,
        threads=threads,
        connection_limit=500,
        channel_timeout=30,
        cleanup_interval=30,
        ident="TraidiumX-WSGI"
    )
