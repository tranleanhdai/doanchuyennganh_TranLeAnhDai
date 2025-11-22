import os
import ee
from google.oauth2 import service_account

_initialized = False

def init_ee():
    global _initialized
    if _initialized:
        return

    # Lấy biến từ file .env
    project = os.getenv("EE_PROJECT", "").strip()
    sa = os.getenv("EE_SERVICE_ACCOUNT", "").strip()
    key_path = os.getenv("EE_PRIVATE_KEY", "").strip()

    # --- Nếu có service account + key file ---
    if sa and key_path:
        creds = service_account.Credentials.from_service_account_file(
            key_path,
            scopes=[
                "https://www.googleapis.com/auth/earthengine",
                "https://www.googleapis.com/auth/devstorage.read_write",
            ],
            subject=sa,
        )
        ee.Initialize(creds, project=project or None)
    else:
        # --- Nếu đang dùng user authentication (earthengine authenticate) ---
        ee.Initialize(project=project or None)

    _initialized = True
