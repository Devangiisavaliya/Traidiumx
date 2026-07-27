import os
import base64
import requests
import uuid
from config.settings import settings

def is_mock_enabled():
    print(f"[DEBUG MOCK] settings.DIGIO_CLIENT_ID = {repr(settings.DIGIO_CLIENT_ID)}")
    print(f"[DEBUG MOCK] settings.DIGIO_CLIENT_SECRET = {repr(settings.DIGIO_CLIENT_SECRET)}")
    val = not settings.DIGIO_CLIENT_ID or not settings.DIGIO_CLIENT_SECRET or settings.DIGIO_CLIENT_ID.startswith("your_") or settings.DIGIO_CLIENT_ID == ""
    print(f"[DEBUG MOCK] returns: {val}")
    return val

def _get_headers():
    auth_str = f"{settings.DIGIO_CLIENT_ID}:{settings.DIGIO_CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    return {
        "Authorization": f"Basic {b64_auth}",
        "Content-Type": "application/json"
    }

def create_kyc_request(identifier):
    """
    Calls POST /client/kyc/v2/request/with_template
    Creates a new KYC session for a customer using the DigiLocker template.
    """
    if is_mock_enabled():
        # Return mock credentials for sandbox/local development
        mock_id = f"KID{uuid.uuid4().hex[:12].upper()}"
        mock_token_id = f"GWT{uuid.uuid4().hex[:16].upper()}"
        print(f"[Digio Service Mock] Generated Request ID: {mock_id}, Token ID: {mock_token_id}")
        return {
            "success": True,
            "id": mock_id,
            "access_token": {
                "id": mock_token_id
            }
        }

    url = f"{settings.DIGIO_BASE_URL}/client/kyc/v2/request/with_template"
    payload = {
        "customer_identifier": identifier,
        "template_name": settings.DIGIO_TEMPLATE_NAME,
        "notify_customer": False,
        "generate_access_token": True
    }

    try:
        response = requests.post(url, json=payload, headers=_get_headers(), timeout=15)
        print(f"[DEBUG DIGIO] URL: {url}")
        print(f"[DEBUG DIGIO] Status code: {response.status_code}")
        print(f"[DEBUG DIGIO] Response text: {repr(response.text[:500])}")
        if response.status_code in [200, 201]:
            return response.json()
        else:
            print(f"[Digio API Error] Create request failed: {response.status_code} - {response.text}")
            return {"success": False, "error": response.text}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Digio Connection Error] Create request failed: {e}")
        return {"success": False, "error": str(e)}

def get_kyc_details(request_id):
    """
    Calls POST /client/kyc/v2/{id}/response
    Retrieves the response status and verified details from Digio.
    """
    if is_mock_enabled():
        # Return mock verified eKYC response for sandbox/local development
        print(f"[Digio Service Mock] Fetching details for request {request_id}")
        
        # Determine dummy values for Patel Jay / mock user
        return {
            "id": request_id,
            "status": "approved",
            "customer_identifier": "jay37686@gmail.com",
            "actions": [
                {
                    "id": "action_aadhaar",
                    "type": "aadhaar_offline",
                    "status": "approved",
                    "file_id": f"FIL_AADHAAR_{uuid.uuid4().hex[:8].upper()}",
                    "details": {
                        "name": "JAY PATEL",
                        "full_name": "JAY PATEL",
                        "dob": "1994-08-15",
                        "date_of_birth": "1994-08-15",
                        "gender": "M",
                        "aadhaar_number": "XXXX XXXX 9993",
                        "masked_aadhaar": "XXXX XXXX 9993",
                        "reference_id": "9993",
                        "address": {
                            "house": "Flat 402",
                            "street": "Golden Heights",
                            "loc": "Navrangpura",
                            "po": "Navrangpura SO",
                            "dist": "Ahmedabad",
                            "state": "Gujarat",
                            "pc": "380009",
                            "country": "India"
                        }
                    }
                },
                {
                    "id": "action_pan",
                    "type": "pan",
                    "status": "approved",
                    "file_id": f"FIL_PAN_{uuid.uuid4().hex[:8].upper()}",
                    "details": {
                        "pan_number": "GBMPPB059K",
                        "pan_no": "GBMPPB059K",
                        "name": "JAY PATEL",
                        "dob": "1994-08-15"
                    }
                },
                {
                    "id": "action_selfie",
                    "type": "selfie",
                    "status": "approved",
                    "file_id": f"FIL_SELFIE_{uuid.uuid4().hex[:8].upper()}",
                    "details": {
                        "face_match_score": 98.5,
                        "match_score": 98.5,
                        "liveness_status": "success",
                        "liveness": True
                    }
                }
            ]
        }

    url = f"{settings.DIGIO_BASE_URL}/client/kyc/v2/{request_id}/response"
    try:
        response = requests.post(url, headers=_get_headers(), timeout=15)
        if response.status_code == 200:
            res_data = response.json()
            print(f"[DEBUG DIGIO RESPONSE] {res_data}")
            return res_data
        else:
            print(f"[Digio API Error] Fetch status failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"[Digio Connection Error] Fetch status failed: {e}")
        return None

def download_kyc_document(request_id, file_id, save_path, doc_type=None):
    """
    Calls GET /client/kyc/v2/media/{file_id}
    Downloads Aadhaar, PAN, or Selfie from Digio and writes it to the local filesystem.
    """
    if is_mock_enabled():
        # Mock document save: write a dummy text/pdf file
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        with open(save_path, "wb") as f:
            f.write(f"%PDF-1.4 Mock Digio PDF file for file_id {file_id} - doc_type {doc_type}".encode())
        print(f"[Digio Service Mock] Document saved to {save_path}")
        return True

    url = f"{settings.DIGIO_BASE_URL}/client/kyc/v2/media/{file_id}"
    params = {}
    if doc_type:
        params["doc_type"] = doc_type

    try:
        response = requests.get(url, params=params, headers=_get_headers(), stream=True, timeout=30)
        if response.status_code == 200:
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            with open(save_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            return True
        else:
            print(f"[Digio API Error] Download media failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"[Digio Connection Error] Download media failed: {e}")
        return False
