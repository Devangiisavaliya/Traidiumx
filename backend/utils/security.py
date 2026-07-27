import re


def sanitize_text(value):
    if value is None:
        return ""

    value = str(value).strip()

    # Remove basic script tags
    value = re.sub(r"<script.*?>.*?</script>", "", value, flags=re.IGNORECASE)

    # Remove angle brackets
    value = value.replace("<", "").replace(">", "")

    return value


def get_bearer_token(request):
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header.replace("Bearer ", "", 1).strip()

    return token if token else None