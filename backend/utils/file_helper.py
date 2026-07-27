import os
import uuid

from werkzeug.utils import secure_filename

from config.settings import settings


ALLOWED_KYC_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "pdf"}


def allowed_kyc_file(filename):
    if "." not in filename:
        return False

    extension = filename.rsplit(".", 1)[1].lower()

    return extension in ALLOWED_KYC_EXTENSIONS


def save_kyc_file(file, user_id, label):
    if not file or file.filename == "":
        return {
            "success": False,
            "path": None,
            "error": f"{label} file is required."
        }

    if not allowed_kyc_file(file.filename):
        return {
            "success": False,
            "path": None,
            "error": f"{label} must be JPG, JPEG, PNG, WEBP or PDF."
        }

    upload_folder = settings.KYC_UPLOAD_FOLDER
    user_folder = os.path.join(upload_folder, str(user_id))

    os.makedirs(user_folder, exist_ok=True)

    original_filename = secure_filename(file.filename)
    extension = original_filename.rsplit(".", 1)[1].lower()
    new_filename = f"{label}_{uuid.uuid4().hex}.{extension}"

    file_path = os.path.join(user_folder, new_filename)

    file.save(file_path)

    return {
        "success": True,
        "path": file_path.replace("\\", "/"),
        "error": ""
    }