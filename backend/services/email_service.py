import html
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid, parseaddr

from config.settings import settings


def is_email_delivery_configured():
    return bool(
        getattr(settings, "SMTP_HOST", "")
        and getattr(settings, "SMTP_PORT", 0)
        and _get_sender_email()
    )


def is_password_reset_email_configured():
    return is_email_delivery_configured()


def _get_sender_email():
    """Return the configured sender email address without display-name text."""

    sender_email = str(getattr(settings, "SMTP_FROM_EMAIL", "") or "").strip()
    _parsed_name, parsed_email = parseaddr(sender_email)
    return (parsed_email or sender_email).strip()


def _get_sender_display_name():
    """Use a consistent brand sender name to reduce mail-client suspicion."""

    return str(
        getattr(settings, "SMTP_FROM_NAME", "")
        or getattr(settings, "APP_NAME", "")
        or "TraidiumX"
    ).strip()


def _format_sender_header():
    sender_email = _get_sender_email()
    sender_name = _get_sender_display_name()
    return formataddr((sender_name, sender_email)) if sender_name else sender_email


def _get_message_id_domain():
    configured_domain = str(getattr(settings, "SMTP_MESSAGE_ID_DOMAIN", "") or "").strip()
    if configured_domain:
        return configured_domain

    sender_email = _get_sender_email()
    if "@" in sender_email:
        return sender_email.rsplit("@", 1)[1].strip()
    return "traidiumx.local"


def _apply_transactional_email_headers(message, email_type="transactional"):
    """Apply safe transactional email headers.

    These headers make the OTP/reset email look like a real account-security
    email instead of a raw script-generated message. They cannot guarantee Inbox
    delivery, because SPF/DKIM/DMARC and sender reputation are controlled by the
    sending domain/provider, but they improve formatting and deliverability.
    """

    message["From"] = _format_sender_header()

    reply_to = str(getattr(settings, "SMTP_REPLY_TO_EMAIL", "") or "").strip()
    if reply_to:
        message["Reply-To"] = reply_to

    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain=_get_message_id_domain())
    message["Auto-Submitted"] = "auto-generated"
    message["X-Auto-Response-Suppress"] = "All"
    message["X-TraidiumX-Email-Type"] = email_type


def _send_email_message(message):
    if not is_email_delivery_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    try:
        if settings.SMTP_USE_TLS:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS)

        with server:
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(message)

        return {
            "sent": True,
            "reason": "Email sent."
        }

    except Exception as error:
        return {
            "sent": False,
            "reason": str(error)
        }


def send_google_login_alert_email(to_email, user_name="", client_ip="", user_agent=""):
    """Send an account-security alert after successful Google login/sign-up.

    This is intentionally best-effort: email delivery failure must never block
    the Google login flow.
    """

    if not is_email_delivery_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    safe_name = html.escape(str(user_name or "TraidiumX user").strip() or "TraidiumX user", quote=True)
    safe_ip = html.escape(str(client_ip or "Not available").strip() or "Not available", quote=True)
    safe_user_agent = html.escape(str(user_agent or "Not available").strip() or "Not available", quote=True)
    login_time = datetime.now(timezone.utc).strftime("%d %b %Y, %I:%M %p UTC")
    safe_login_time = html.escape(login_time, quote=True)

    message = EmailMessage()
    message["Subject"] = "New Google login to your TraidiumX account"
    message["To"] = to_email
    _apply_transactional_email_headers(message, "google-login-alert")

    text_body = (
        f"Hello {safe_name},\n\n"
        "Your TraidiumX account was accessed using Continue with Google.\n\n"
        f"Login time: {login_time}\n"
        f"IP address: {client_ip or 'Not available'}\n"
        f"Device / browser: {user_agent or 'Not available'}\n\n"
        "If this was you, no action is needed.\n"
        "If this was not you, change your password and contact TraidiumX support immediately.\n\n"
        "TraidiumX Security Team\n"
        "This is an automated account-security email. No promotions are included."
    )

    html_body = f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Arial,sans-serif;">
        <div style="max-width:640px;margin:0 auto;padding:32px 18px;">
          <div style="border:1px solid rgba(34,211,238,.25);border-radius:22px;background:#0f172a;padding:28px;">
            <p style="margin:0 0 10px;color:#22d3ee;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">TraidiumX Security Alert</p>
            <h1 style="margin:0 0 14px;color:#ffffff;font-size:25px;line-height:1.25;">New Google login detected</h1>
            <p style="margin:0 0 18px;color:#cbd5e1;font-size:15px;line-height:1.7;">Hello <strong style="color:#ffffff;">{safe_name}</strong>, your TraidiumX account was accessed using <strong style="color:#67e8f9;">Continue with Google</strong>.</p>
            <div style="margin:0 0 20px;border-radius:18px;background:#020617;border:1px solid rgba(34,211,238,.18);padding:18px 20px;">
              <p style="margin:0 0 10px;color:#94a3b8;font-size:13px;line-height:1.6;"><strong style="color:#e5e7eb;">Login time:</strong> {safe_login_time}</p>
              <p style="margin:0 0 10px;color:#94a3b8;font-size:13px;line-height:1.6;"><strong style="color:#e5e7eb;">IP address:</strong> {safe_ip}</p>
              <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;word-break:break-word;"><strong style="color:#e5e7eb;">Device / browser:</strong> {safe_user_agent}</p>
            </div>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">If this was you, no action is needed.</p>
            <p style="margin:0 0 12px;color:#fca5a5;font-size:13px;line-height:1.7;">If this was not you, change your password and contact TraidiumX support immediately.</p>
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated account-security email from TraidiumX. No promotions are included.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    result = _send_email_message(message)

    if result.get("sent"):
        result["reason"] = "Google login alert email sent."

    return result


def send_signup_verification_code_email(to_email, code, expires_minutes=None, expires_seconds=None):
    """Send a low-spam transactional security code for email verification."""

    if not is_email_delivery_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    safe_code = html.escape(str(code or "").strip(), quote=True)
    safe_seconds = int(expires_seconds or 0)
    if safe_seconds <= 0:
        safe_seconds = int(expires_minutes or 2) * 60
    safe_minutes = max(1, (safe_seconds + 59) // 60)
    expiry_text = f"{safe_seconds} seconds" if safe_seconds < 120 else f"{safe_minutes} minutes"

    message = EmailMessage()
    # Keep the signup OTP subject close to the forgot-password OTP subject,
    # because that template is already landing in Inbox for this project.
    message["Subject"] = "Your TraidiumX security code"
    message["To"] = to_email
    _apply_transactional_email_headers(message, "account-security-code")

    text_body = (
        "Hello,\n\n"
        "We received a request to verify your TraidiumX account email.\n\n"
        "Enter this security code on the TraidiumX verification page:\n\n"
        f"{safe_code}\n\n"
        f"This code expires in {expiry_text} and can be used only once.\n"
        "If you did not request this, you can safely ignore this email.\n\n"
        "TraidiumX Security Team\n"
        "This is an automated account-security email. No promotions are included."
    )

    html_body = f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Arial,sans-serif;">
        <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
          <div style="border:1px solid rgba(34,211,238,.25);border-radius:22px;background:#0f172a;padding:28px;">
            <p style="margin:0 0 10px;color:#22d3ee;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">TraidiumX Security</p>
            <h1 style="margin:0 0 14px;color:#ffffff;font-size:26px;line-height:1.25;">Your security code</h1>
            <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.7;">Enter this code on the TraidiumX verification page to confirm your email address.</p>
            <div style="margin:0 0 22px;border-radius:18px;background:#020617;border:1px solid rgba(34,211,238,.18);padding:18px 22px;text-align:center;">
              <p style="margin:0;color:#67e8f9;font-size:34px;line-height:1.2;font-weight:900;letter-spacing:.22em;">{safe_code}</p>
            </div>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">This code expires in {expiry_text} and can be used only once.</p>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">If you did not request this, you can safely ignore this email.</p>
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated account-security email from TraidiumX. No promotions are included.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    result = _send_email_message(message)

    if result.get("sent"):
        result["reason"] = "Security code email sent."

    return result


def send_login_2fa_code_email(to_email, code, expires_seconds=None):
    """Send a secure transactional code for login Two-Factor Authentication (2FA)."""

    if not is_email_delivery_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    safe_code = html.escape(str(code or "").strip(), quote=True)
    safe_seconds = int(expires_seconds or 0)
    if safe_seconds <= 0:
        safe_seconds = 120
    safe_minutes = max(1, (safe_seconds + 59) // 60)
    expiry_text = f"{safe_seconds} seconds" if safe_seconds < 120 else f"{safe_minutes} minutes"

    message = EmailMessage()
    message["Subject"] = "Your TraidiumX Two-Factor Authentication (2FA) Code"
    message["To"] = to_email
    _apply_transactional_email_headers(message, "account-login-2fa")

    text_body = (
        "Hello,\n\n"
        "A login attempt was made on your TraidiumX account. "
        "Enter this security code to complete your login:\n\n"
        f"{safe_code}\n\n"
        f"This code expires in {expiry_text} and can be used only once.\n"
        "If you did not initiate this login request, please change your password immediately.\n\n"
        "TraidiumX Security Team\n"
        "This is an automated account-security email. No promotions are included."
    )

    html_body = f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Arial,sans-serif;">
        <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
          <div style="border:1px solid rgba(34,211,238,.25);border-radius:22px;background:#0f172a;padding:28px;">
            <p style="margin:0 0 10px;color:#22d3ee;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">TraidiumX Security</p>
            <h1 style="margin:0 0 14px;color:#ffffff;font-size:26px;line-height:1.25;">Two-Factor Verification</h1>
            <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.7;">A login attempt was made on your TraidiumX account. Enter this code to verify your identity and complete the login.</p>
            <div style="margin:0 0 22px;border-radius:18px;background:#020617;border:1px solid rgba(34,211,238,.18);padding:18px 22px;text-align:center;">
              <p style="margin:0;color:#67e8f9;font-size:34px;line-height:1.2;font-weight:900;letter-spacing:.22em;">{safe_code}</p>
            </div>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">This code expires in {expiry_text} and can be used only once.</p>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">If you did not request this login, please secure your account by changing your password immediately.</p>
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated account-security email from TraidiumX. No promotions are included.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    
    if is_email_delivery_configured():
        import threading
        threading.Thread(target=_send_email_message, args=(message,)).start()
        result = {"sent": True, "reason": "Two-Factor code email sent."}
    else:
        result = {"sent": False, "reason": "SMTP email delivery is not configured."}

    return result


def send_2fa_toggle_code_email(to_email, code, action, expires_seconds=None):
    """Send a secure code to confirm enabling or disabling Two-Factor Authentication (2FA)."""

    if not is_email_delivery_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    safe_code = html.escape(str(code or "").strip(), quote=True)
    safe_seconds = int(expires_seconds or 0)
    if safe_seconds <= 0:
        safe_seconds = 120
    safe_minutes = max(1, (safe_seconds + 59) // 60)
    expiry_text = f"{safe_seconds} seconds" if safe_seconds < 120 else f"{safe_minutes} minutes"

    action_label = "Enable" if action == "enable" else "Disable"
    action_text = "enable" if action == "enable" else "disable"

    message = EmailMessage()
    message["Subject"] = f"Confirm {action_label} Two-Factor Authentication (2FA)"
    message["To"] = to_email
    _apply_transactional_email_headers(message, "account-2fa-toggle")

    text_body = (
        "Hello,\n\n"
        f"We received a request to {action_text} Two-Factor Authentication (2FA) on your TraidiumX account. "
        "Enter this security code to authorize this action:\n\n"
        f"{safe_code}\n\n"
        f"This code expires in {expiry_text} and can be used only once.\n"
        "If you did not request this, you can safely ignore this email.\n\n"
        "TraidiumX Security Team\n"
        "This is an automated account-security email. No promotions are included."
    )

    html_body = f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Arial,sans-serif;">
        <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
          <div style="border:1px solid rgba(34,211,238,.25);border-radius:22px;background:#0f172a;padding:28px;">
            <p style="margin:0 0 10px;color:#22d3ee;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">TraidiumX Security</p>
            <h1 style="margin:0 0 14px;color:#ffffff;font-size:26px;line-height:1.25;">2FA Configuration Change</h1>
            <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.7;">We received a request to {action_text} Two-Factor Authentication (2FA) on your TraidiumX account. Enter this code to authorize this action.</p>
            <div style="margin:0 0 22px;border-radius:18px;background:#020617;border:1px solid rgba(34,211,238,.18);padding:18px 22px;text-align:center;">
              <p style="margin:0;color:#67e8f9;font-size:34px;line-height:1.2;font-weight:900;letter-spacing:.22em;">{safe_code}</p>
            </div>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">This code expires in {expiry_text} and can be used only once.</p>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">If you did not request this change, you can safely ignore this email.</p>
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated account-security email from TraidiumX. No promotions are included.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    
    if is_email_delivery_configured():
        import threading
        threading.Thread(target=_send_email_message, args=(message,)).start()
        result = {"sent": True, "reason": f"Two-Factor {action_text} code email sent."}
    else:
        result = {"sent": False, "reason": "SMTP email delivery is not configured."}

    return result



def send_admin_registration_code_email(to_email, code, expires_seconds=None, expires_minutes=None):
    """Send an admin registration verification code email."""

    if not is_email_delivery_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    safe_code = html.escape(str(code or "").strip(), quote=True)
    safe_seconds = int(expires_seconds or 0)
    if safe_seconds <= 0:
        safe_seconds = int(expires_minutes or 2) * 60
    safe_minutes = max(1, (safe_seconds + 59) // 60)
    expiry_text = f"{safe_seconds} seconds" if safe_seconds < 120 else f"{safe_minutes} minutes"

    message = EmailMessage()
    message["Subject"] = "Your TraidiumX admin verification code"
    message["To"] = to_email
    _apply_transactional_email_headers(message, "admin-registration-code")

    text_body = "\n".join([
        "Hello,",
        "",
        "We received a request to create a TraidiumX admin account.",
        "",
        "Enter this verification code on the TraidiumX admin register page:",
        "",
        str(safe_code),
        "",
        f"This code expires in {expiry_text} and can be used only once.",
        "If you did not request this, you can safely ignore this email.",
        "",
        "TraidiumX Security Team",
        "This is an automated account-security email. No promotions are included.",
    ])

    html_body = f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Arial,sans-serif;">
        <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
          <div style="border:1px solid rgba(34,211,238,.25);border-radius:22px;background:#0f172a;padding:28px;">
            <p style="margin:0 0 10px;color:#22d3ee;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">TraidiumX Admin Security</p>
            <h1 style="margin:0 0 14px;color:#ffffff;font-size:26px;line-height:1.25;">Verify your admin email</h1>
            <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.7;">Enter this code on the TraidiumX admin register page to create your admin account.</p>
            <div style="margin:0 0 22px;border-radius:18px;background:#020617;border:1px solid rgba(34,211,238,.18);padding:18px 22px;text-align:center;">
              <p style="margin:0;color:#67e8f9;font-size:34px;line-height:1.2;font-weight:900;letter-spacing:.22em;">{safe_code}</p>
            </div>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">This code expires in {expiry_text} and can be used only once.</p>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">If you did not request this, you can safely ignore this email.</p>
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated account-security email from TraidiumX. No promotions are included.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    result = _send_email_message(message)

    if result.get("sent"):
        result["reason"] = "Admin verification code email sent."

    return result

def send_password_reset_code_email(to_email, code, expires_minutes):
    """Send a forgot-password reset code email without any reset link."""

    if not is_password_reset_email_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    safe_code = html.escape(str(code or "").strip(), quote=True)
    safe_expiry = int(expires_minutes or 30)

    message = EmailMessage()
    message["Subject"] = "Your TraidiumX password reset code"
    message["To"] = to_email
    _apply_transactional_email_headers(message, "password-reset-code")

    text_body = (
        "Hello,\n\n"
        "We received a request to reset your TraidiumX account password.\n\n"
        "Enter this reset code on the TraidiumX forgot-password page:\n\n"
        f"{safe_code}\n\n"
        f"This code expires in {safe_expiry} minutes and can be used only once.\n"
        "If you did not request this, you can safely ignore this email.\n\n"
        "TraidiumX Security Team\n"
        "This is an automated account-security email. No promotions are included."
    )

    html_body = f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Arial,sans-serif;">
        <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
          <div style="border:1px solid rgba(34,211,238,.25);border-radius:22px;background:#0f172a;padding:28px;">
            <p style="margin:0 0 10px;color:#22d3ee;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">TraidiumX Security</p>
            <h1 style="margin:0 0 14px;color:#ffffff;font-size:26px;line-height:1.25;">Reset your password</h1>
            <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.7;">Enter this code on the TraidiumX forgot-password page to create a new password.</p>
            <div style="margin:0 0 22px;border-radius:18px;background:#020617;border:1px solid rgba(34,211,238,.18);padding:18px 22px;text-align:center;">
              <p style="margin:0;color:#67e8f9;font-size:34px;line-height:1.2;font-weight:900;letter-spacing:.22em;">{safe_code}</p>
            </div>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">This code expires in {safe_expiry} minutes and can be used only once.</p>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">If you did not request this, you can safely ignore this email.</p>
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated account-security email from TraidiumX. No promotions are included.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    result = _send_email_message(message)

    if result.get("sent"):
        result["reason"] = "Password reset code email sent."

    return result


def send_admin_password_reset_code_email(to_email, code, expires_minutes):
    """Send a clean TraidiumX admin password reset security code email."""

    if not is_password_reset_email_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    safe_code = html.escape(str(code or "").strip(), quote=True)
    safe_expiry = int(expires_minutes or 30)

    message = EmailMessage()
    message["Subject"] = "Your TraidiumX admin reset code"
    message["To"] = to_email
    _apply_transactional_email_headers(message, "admin-password-reset-code")

    text_body = (
        "Hello,\n\n"
        "We received a request to reset your TraidiumX admin password.\n\n"
        "Enter this admin reset code on the TraidiumX admin forgot-password page:\n\n"
        f"{safe_code}\n\n"
        f"This code expires in {safe_expiry} minutes and can be used only once.\n"
        "If you did not request this, you can safely ignore this email.\n\n"
        "TraidiumX Security Team\n"
        "This is an automated account-security email. No promotions are included."
    )

    html_body = f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Arial,sans-serif;">
        <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
          <div style="border:1px solid rgba(34,211,238,.25);border-radius:22px;background:#0f172a;padding:28px;">
            <p style="margin:0 0 10px;color:#22d3ee;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">TraidiumX Admin Security</p>
            <h1 style="margin:0 0 14px;color:#ffffff;font-size:26px;line-height:1.25;">Reset your admin password</h1>
            <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.7;">Enter this code on the TraidiumX admin forgot-password page to create a new admin password.</p>
            <div style="margin:0 0 22px;border-radius:18px;background:#020617;border:1px solid rgba(34,211,238,.18);padding:18px 22px;text-align:center;">
              <p style="margin:0;color:#67e8f9;font-size:34px;line-height:1.2;font-weight:900;letter-spacing:.22em;">{safe_code}</p>
            </div>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">This code expires in {safe_expiry} minutes and can be used only once.</p>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">If you did not request this, you can safely ignore this email.</p>
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated account-security email from TraidiumX. No promotions are included.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    result = _send_email_message(message)

    if result.get("sent"):
        result["reason"] = "Admin password reset code email sent."

    return result


def send_password_reset_email(to_email, reset_url, expires_minutes):
    """Send a password reset email with both plain-text and HTML content.

    The function returns a status dict instead of throwing so the public API can
    remain user-enumeration safe while development still receives diagnostics.
    """

    if not is_password_reset_email_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    safe_reset_url = str(reset_url or "").strip()
    safe_expiry = int(expires_minutes or 30)
    escaped_url = html.escape(safe_reset_url, quote=True)

    message = EmailMessage()
    message["Subject"] = "Reset your TraidiumX password"
    message["To"] = to_email
    _apply_transactional_email_headers(message, "password-reset")

    text_body = (
        "Hello,\n\n"
        "We received a request to reset your TraidiumX account password.\n\n"
        "Open this reset link:\n"
        f"{safe_reset_url}\n\n"
        f"This link expires in {safe_expiry} minutes and can be used only once.\n"
        "If you did not request this, you can safely ignore this email.\n\n"
        "TraidiumX Security Team\n"
        "This is an automated account-security email. No promotions are included."
    )

    html_body = f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Arial,sans-serif;">
        <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
          <div style="border:1px solid rgba(34,211,238,.25);border-radius:22px;background:#0f172a;padding:28px;">
            <p style="margin:0 0 10px;color:#22d3ee;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">TraidiumX Security</p>
            <h1 style="margin:0 0 14px;color:#ffffff;font-size:26px;line-height:1.25;">Reset your password</h1>
            <p style="margin:0 0 22px;color:#cbd5e1;font-size:15px;line-height:1.7;">We received a request to reset your TraidiumX account password. Click the button below to create a new password.</p>
            <p style="margin:0 0 24px;">
              <a href="{escaped_url}" style="display:inline-block;border-radius:999px;background:#22d3ee;color:#020617;text-decoration:none;font-weight:800;padding:13px 22px;">Reset Password</a>
            </p>
            <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;line-height:1.7;">This link expires in {safe_expiry} minutes and can be used only once.</p>
            <p style="margin:0 0 10px;color:#94a3b8;font-size:13px;line-height:1.7;">If the button does not work, copy and paste this link into your browser:</p>
            <p style="word-break:break-all;margin:0 0 12px;color:#67e8f9;font-size:13px;line-height:1.6;">{escaped_url}</p>
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated account-security email from TraidiumX. No promotions are included.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    result = _send_email_message(message)

    if result.get("sent"):
        result["reason"] = "Password reset email sent."

    return result


def send_user_account_status_email(to_email, user_name="", title="TraidiumX Account Notice", message_text="", reason=""):
    """Send a branded transactional email when admin changes a user's account status."""

    if not is_email_delivery_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    safe_name = html.escape(str(user_name or "TraidiumX user").strip() or "TraidiumX user", quote=True)
    safe_title = html.escape(str(title or "TraidiumX Account Notice").strip(), quote=True)
    safe_message = html.escape(str(message_text or "Your TraidiumX account status was updated.").strip(), quote=True)
    safe_reason = html.escape(str(reason or "").strip(), quote=True)
    event_time = datetime.now(timezone.utc).strftime("%d %b %Y, %I:%M %p UTC")
    safe_event_time = html.escape(event_time, quote=True)

    title_lower = str(title or "").lower()
    if "block" in title_lower:
        badge_text = "Blocked"
        badge_color = "#fecaca"
        badge_bg = "rgba(248,113,113,.13)"
        accent_color = "#f87171"
        border_color = "rgba(248,113,113,.34)"
    elif "suspend" in title_lower:
        badge_text = "Suspended"
        badge_color = "#fde68a"
        badge_bg = "rgba(251,191,36,.13)"
        accent_color = "#fbbf24"
        border_color = "rgba(251,191,36,.34)"
    elif "active" in title_lower:
        badge_text = "Active"
        badge_color = "#bbf7d0"
        badge_bg = "rgba(52,211,153,.13)"
        accent_color = "#34d399"
        border_color = "rgba(52,211,153,.34)"
    else:
        badge_text = "Updated"
        badge_color = "#a5f3fc"
        badge_bg = "rgba(34,211,238,.13)"
        accent_color = "#22d3ee"
        border_color = "rgba(34,211,238,.34)"

    message = EmailMessage()
    message["Subject"] = f"TraidiumX • {title or 'Account Notice'}"
    message["To"] = to_email
    _apply_transactional_email_headers(message, "user-account-status")

    plain_reason = f"\nReason: {reason}\n" if reason else ""
    text_body = (
        f"Hello {user_name or 'TraidiumX user'},\n\n"
        f"{message_text or 'Your TraidiumX account status was updated.'}\n"
        f"{plain_reason}"
        f"Updated at: {event_time}\n\n"
        "You can also check this notice from the notification bell inside your TraidiumX account.\n"
        "Please contact TraidiumX support if you need help.\n\n"
        "TraidiumX Team\n"
        "This is an automated account notification email."
    )

    reason_html = f"""
                  <tr>
                    <td style="padding:0 0 14px;">
                      <div style="border-radius:18px;border:1px solid rgba(251,191,36,.28);background:rgba(251,191,36,.09);padding:15px 16px;">
                        <p style="margin:0 0 6px;color:#fbbf24;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Reason</p>
                        <p style="margin:0;color:#fef3c7;font-size:14px;line-height:1.7;font-weight:700;">{safe_reason}</p>
                      </div>
                    </td>
                  </tr>
    """ if safe_reason else ""

    html_body = f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#020617;margin:0;padding:0;">
          <tr>
            <td align="center" style="padding:34px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:28px;border:1px solid {border_color};background:#0f172a;box-shadow:0 28px 70px rgba(0,0,0,.34);">
                <tr>
                  <td style="height:5px;background:linear-gradient(90deg,#22d3ee,{accent_color},#34d399);"></td>
                </tr>
                <tr>
                  <td style="padding:28px 28px 20px;background:radial-gradient(circle at top left,rgba(34,211,238,.17),transparent 48%),#0f172a;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="vertical-align:top;">
                          <p style="margin:0 0 8px;color:#22d3ee;font-size:11px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;">TRAIDIUMX EXCHANGE</p>
                          <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.22;font-weight:900;">{safe_title}</h1>
                        </td>
                        <td align="right" style="vertical-align:top;width:130px;">
                          <span style="display:inline-block;border-radius:999px;border:1px solid {border_color};background:{badge_bg};padding:8px 12px;color:{badge_color};font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;">{badge_text}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:0 0 18px;">
                          <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.8;">Hello <strong style="color:#ffffff;">{safe_name}</strong>,</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 14px;">
                          <div style="border-radius:20px;border:1px solid rgba(34,211,238,.18);background:#020617;padding:18px 20px;">
                            <p style="margin:0 0 7px;color:#67e8f9;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;">Account Update</p>
                            <p style="margin:0;color:#e5e7eb;font-size:15px;line-height:1.75;font-weight:700;">{safe_message}</p>
                          </div>
                        </td>
                      </tr>
                      {reason_html}
                      <tr>
                        <td style="padding:0 0 16px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:18px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.66);">
                            <tr>
                              <td style="padding:14px 16px;color:#94a3b8;font-size:13px;line-height:1.7;"><strong style="display:block;color:#e5e7eb;font-size:12px;text-transform:uppercase;letter-spacing:.1em;">Updated at</strong>{safe_event_time}</td>
                              <td style="padding:14px 16px;color:#94a3b8;font-size:13px;line-height:1.7;"><strong style="display:block;color:#e5e7eb;font-size:12px;text-transform:uppercase;letter-spacing:.1em;">Also sent to</strong>Notification bell</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0;">
                          <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.7;">For security, this notice was sent because an admin changed your account status. Please contact TraidiumX support if you did not expect this update.</p>
                          <p style="margin:14px 0 0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated account notification email from TraidiumX.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    result = _send_email_message(message)

    if result.get("sent"):
        result["reason"] = "User account status email sent."

    return result


def send_maintenance_notice_email(to_email, user_name="", maintenance_message=""):
    """Send a branded transactional email when admin enables maintenance mode."""

    if not is_email_delivery_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    safe_name = html.escape(str(user_name or "TraidiumX user").strip() or "TraidiumX user", quote=True)
    safe_message = html.escape(str(maintenance_message or "TraidiumX is under maintenance. Please try again later.").strip(), quote=True)
    event_time = datetime.now(timezone.utc).strftime("%d %b %Y, %I:%M %p UTC")
    safe_event_time = html.escape(event_time, quote=True)

    message = EmailMessage()
    message["Subject"] = "TraidiumX • Maintenance Mode Active"
    message["To"] = to_email
    _apply_transactional_email_headers(message, "maintenance-notice")

    text_body = (
        f"Hello {user_name or 'TraidiumX user'},\n\n"
        "TraidiumX maintenance mode is now active.\n\n"
        f"Message: {maintenance_message or 'TraidiumX is under maintenance. Please try again later.'}\n"
        f"Updated at: {event_time}\n\n"
        "This notice is also available inside your TraidiumX notification bell.\n"
        "You will receive access again after maintenance is completed.\n\n"
        "TraidiumX Team\n"
        "This is an automated platform notification email."
    )

    html_body = f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#020617;margin:0;padding:0;">
          <tr>
            <td align="center" style="padding:34px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:28px;border:1px solid rgba(251,191,36,.34);background:#0f172a;box-shadow:0 28px 70px rgba(0,0,0,.34);">
                <tr>
                  <td style="height:5px;background:linear-gradient(90deg,#22d3ee,#fbbf24,#34d399);"></td>
                </tr>
                <tr>
                  <td style="padding:28px 28px 20px;background:radial-gradient(circle at top left,rgba(251,191,36,.20),transparent 46%),#0f172a;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="vertical-align:top;">
                          <p style="margin:0 0 8px;color:#fbbf24;font-size:11px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;">TRAIDIUMX PLATFORM NOTICE</p>
                          <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.22;font-weight:900;">Maintenance Mode Active</h1>
                        </td>
                        <td align="right" style="vertical-align:top;width:145px;">
                          <span style="display:inline-block;border-radius:999px;border:1px solid rgba(251,191,36,.34);background:rgba(251,191,36,.13);padding:8px 12px;color:#fde68a;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;">Maintenance</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:0 0 18px;">
                          <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.8;">Hello <strong style="color:#ffffff;">{safe_name}</strong>,</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 14px;">
                          <div style="border-radius:20px;border:1px solid rgba(251,191,36,.24);background:#020617;padding:18px 20px;">
                            <p style="margin:0 0 7px;color:#fbbf24;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;">Maintenance Message</p>
                            <p style="margin:0;color:#fef3c7;font-size:15px;line-height:1.75;font-weight:800;">{safe_message}</p>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 16px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:18px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.66);">
                            <tr>
                              <td style="padding:14px 16px;color:#94a3b8;font-size:13px;line-height:1.7;"><strong style="display:block;color:#e5e7eb;font-size:12px;text-transform:uppercase;letter-spacing:.1em;">Started at</strong>{safe_event_time}</td>
                              <td style="padding:14px 16px;color:#94a3b8;font-size:13px;line-height:1.7;"><strong style="display:block;color:#e5e7eb;font-size:12px;text-transform:uppercase;letter-spacing:.1em;">User notice</strong>Notification bell updated</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0;">
                          <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.7;">During maintenance, some account actions may be unavailable. Access will be restored after the admin turns maintenance mode off.</p>
                          <p style="margin:14px 0 0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated platform notification email from TraidiumX.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    result = _send_email_message(message)

    if result.get("sent"):
        result["reason"] = "Maintenance notice email sent."

    return result

def send_admin_broadcast_email(to_email, user_name="", title="TraidiumX Notification", message_text="", severity="info"):
    """Send a branded admin-composed notification email to a user."""

    if not is_email_delivery_configured():
        return {
            "sent": False,
            "reason": "SMTP email delivery is not configured."
        }

    severity_key = str(severity or "info").strip().lower()
    if severity_key in {"danger", "error", "red"}:
        severity_key = "alert"
    if severity_key not in {"info", "success", "warning", "alert"}:
        severity_key = "info"

    severity_styles = {
        "info": {
            "label": "INFORMATION",
            "subject": "Information",
            "main": "#22d3ee",
            "soft": "rgba(34,211,238,.14)",
            "border": "rgba(34,211,238,.30)",
            "text": "#a5f3fc",
            "bg": "#062333",
        },
        "success": {
            "label": "SUCCESS",
            "subject": "Success",
            "main": "#34d399",
            "soft": "rgba(52,211,153,.14)",
            "border": "rgba(52,211,153,.30)",
            "text": "#bbf7d0",
            "bg": "#052e24",
        },
        "warning": {
            "label": "WARNING",
            "subject": "Warning",
            "main": "#fbbf24",
            "soft": "rgba(251,191,36,.14)",
            "border": "rgba(251,191,36,.32)",
            "text": "#fef3c7",
            "bg": "#332508",
        },
        "alert": {
            "label": "ALERT",
            "subject": "Alert",
            "main": "#fb7185",
            "soft": "rgba(251,113,133,.14)",
            "border": "rgba(251,113,133,.34)",
            "text": "#ffe4e6",
            "bg": "#3b0712",
        },
    }
    style = severity_styles[severity_key]

    safe_name = html.escape(str(user_name or "TraidiumX user").strip() or "TraidiumX user", quote=True)
    safe_title = html.escape(str(title or "TraidiumX Notification").strip(), quote=True)
    safe_message = html.escape(str(message_text or "You have a new TraidiumX notification.").strip(), quote=True)
    safe_label = html.escape(style["label"], quote=True)
    safe_subject_label = html.escape(style["subject"], quote=True)
    event_time = datetime.now(timezone.utc).strftime("%d %b %Y, %I:%M %p UTC")
    safe_event_time = html.escape(event_time, quote=True)

    message = EmailMessage()
    message["Subject"] = f"TraidiumX • {style['subject']} • {str(title or 'Notification').strip()}"
    message["To"] = to_email
    _apply_transactional_email_headers(message, f"admin-broadcast-{severity_key}")

    text_body = (
        f"Hello {user_name or 'TraidiumX user'},\n\n"
        f"[{style['label']}] {title or 'TraidiumX Notification'}\n\n"
        f"{message_text or 'You have a new TraidiumX notification.'}\n\n"
        f"Sent at: {event_time}\n\n"
        "This notice is also available inside your TraidiumX notification bell if in-app notification delivery was selected.\n"
        "Please contact TraidiumX support if you need help.\n\n"
        "TraidiumX Team\n"
        "This is an automated platform notification email."
    )

    html_body = f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#020617;color:#e5e7eb;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#020617;margin:0;padding:0;">
          <tr>
            <td align="center" style="padding:34px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:28px;border:1px solid {style['border']};background:#0f172a;box-shadow:0 28px 70px rgba(0,0,0,.34);">
                <tr>
                  <td style="height:5px;background:linear-gradient(90deg,{style['main']},#22d3ee,#60a5fa);"></td>
                </tr>
                <tr>
                  <td style="padding:28px 28px 20px;background:radial-gradient(circle at top left,{style['soft']},transparent 46%),#0f172a;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="vertical-align:top;">
                          <p style="margin:0 0 8px;color:{style['main']};font-size:11px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;">TRAIDIUMX {safe_label}</p>
                          <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.22;font-weight:900;">{safe_title}</h1>
                        </td>
                        <td align="right" style="vertical-align:top;width:148px;">
                          <span style="display:inline-block;border-radius:999px;border:1px solid {style['border']};background:{style['soft']};padding:8px 12px;color:{style['text']};font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;">{safe_label}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:0 0 18px;">
                          <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.8;">Hello <strong style="color:#ffffff;">{safe_name}</strong>,</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 14px;">
                          <div style="border-radius:20px;border:1px solid {style['border']};background:{style['bg']};padding:18px 20px;">
                            <p style="margin:0 0 7px;color:{style['main']};font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;">{safe_subject_label} Message</p>
                            <p style="margin:0;color:{style['text']};font-size:15px;line-height:1.75;font-weight:700;white-space:pre-line;">{safe_message}</p>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 16px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:18px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.66);">
                            <tr>
                              <td style="padding:14px 16px;color:#94a3b8;font-size:13px;line-height:1.7;"><strong style="display:block;color:#e5e7eb;font-size:12px;text-transform:uppercase;letter-spacing:.1em;">Sent at</strong>{safe_event_time}</td>
                              <td style="padding:14px 16px;color:#94a3b8;font-size:13px;line-height:1.7;"><strong style="display:block;color:#e5e7eb;font-size:12px;text-transform:uppercase;letter-spacing:.1em;">Type</strong>{safe_label}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0;">
                          <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.7;">This email was sent by TraidiumX administration for an important platform/account notice.</p>
                          <p style="margin:14px 0 0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated platform notification email from TraidiumX.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    result = _send_email_message(message)

    if result.get("sent"):
        result["reason"] = "Admin broadcast email sent."

    return result


def _send_simple_transactional_email(to_email, subject, title, lines, email_type="account-update", action_url="", action_label="Open TraidiumX", custom_html=None):
    if not to_email:
        return {"sent": False, "reason": "Recipient email is missing."}
    if not is_email_delivery_configured():
        return {"sent": False, "reason": "SMTP email delivery is not configured."}

    safe_title = html.escape(str(title or subject), quote=True)
    safe_lines = [html.escape(str(line), quote=True) for line in (lines or []) if str(line).strip()]
    message = EmailMessage()
    message["Subject"] = subject
    message["To"] = to_email
    _apply_transactional_email_headers(message, email_type)

    text_parts = [title, ""] + [str(line) for line in lines]
    if action_url:
        text_parts += ["", f"{action_label}: {action_url}"]
    text_parts += ["", "TraidiumX"]
    message.set_content("\n".join(text_parts))

    rows = custom_html if custom_html else "".join(f'<p style="margin:0 0 10px;color:#cbd5e1;font-size:14px;line-height:1.65;">{line}</p>' for line in safe_lines)
    button = ""
    if action_url:
        safe_url = html.escape(action_url, quote=True)
        safe_label = html.escape(action_label, quote=True)
        button = f'<p style="margin:22px 0 0;"><a href="{safe_url}" style="display:inline-block;border-radius:14px;background:#22d3ee;color:#020617;padding:12px 18px;text-decoration:none;font-weight:900;">{safe_label}</a></p>'
    message.add_alternative(f'''<!doctype html><html><body style="margin:0;background:#020617;font-family:Arial,sans-serif;"><div style="max-width:620px;margin:0 auto;padding:30px 18px;"><div style="border:1px solid rgba(34,211,238,.24);border-radius:22px;background:#0f172a;padding:28px;"><p style="margin:0 0 10px;color:#22d3ee;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">TraidiumX Account</p><h1 style="margin:0 0 18px;color:#fff;font-size:25px;">{safe_title}</h1>{rows}{button}<p style="margin:24px 0 0;color:#64748b;font-size:12px;">Automated transactional message from TraidiumX.</p></div></div></body></html>''', subtype="html")
    return _send_email_message(message)


def send_trading_plan_changed_email(to_email, previous_plan, active_plan, spread_value, balance, minimum_balance=0, spread_type="fixed"):
    spread_str = f"{float(spread_value):g}%" if spread_type == "percentage" else f"{float(spread_value):g} USDT"
    return _send_simple_transactional_email(
        to_email=to_email,
        subject="Your TraidiumX trading plan has changed",
        title="Trading plan updated",
        lines=[
            f"Previous plan: {previous_plan}",
            f"Current active plan: {active_plan}",
            f"Current spread: {spread_str}",
            f"Trading balance: {float(balance):,.2f} USDT",
            f"Current plan minimum: {float(minimum_balance):,.2f} USDT",
        ],
        email_type="trading-plan-change",
    )


def send_mt5_account_ready_email(to_email, login_id, server, plan, spread_value, setup_token="", spread_type="fixed"):
    spread_str = f"{float(spread_value):g}%" if spread_type == "percentage" else f"{float(spread_value):g} USDT"
    base = str(getattr(settings, "APP_PUBLIC_URL", "") or getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
    setup_url = f"{base}/src/pages/trading-account.html?mt5_setup={setup_token}" if base and setup_token else ""
    return _send_simple_transactional_email(
        to_email=to_email,
        subject="Your TraidiumX MT5 account is ready",
        title="MetaTrader 5 account created",
        lines=[
            f"MT5 Login ID: {login_id}",
            f"Server: {server}",
            f"Plan: {plan}",
            f"Spread: {spread_str}",
            "Your TraidiumX account password and MT5 trading password are separate.",
        ],
        email_type="mt5-account-ready",
        action_url=setup_url,
        action_label="Set MT5 trading password",
    )


def send_trading_platform_selected_email(to_email, platform_name):
    return _send_simple_transactional_email(
        to_email=to_email,
        subject=f"{platform_name} selected for your TraidiumX account",
        title="Trading platform selected",
        lines=[
            f"Selected platform: {platform_name}",
            "You can change the platform later from Trading Account settings when there are no open positions or pending orders.",
            "KYC approval is required before you can deposit, trade, or withdraw.",
        ],
        email_type="trading-platform-selected",
    )


def send_trading_plan_selected_email(to_email, preferred_plan, active_plan, spread_value, balance, preferred_minimum, spread_type="fixed"):
    spread_str = f"{float(spread_value):g}%" if spread_type == "percentage" else f"{float(spread_value):g} USDT"
    return _send_simple_transactional_email(
        to_email=to_email,
        subject=f"{preferred_plan} plan selected for your TraidiumX account",
        title="Trading account plan selected",
        lines=[
            f"Preferred plan: {preferred_plan}",
            f"Current active plan: {active_plan}",
            f"Current active spread: {spread_str}",
            f"Settled trading balance: {float(balance):,.2f} USDT",
            f"Preferred plan minimum: {float(preferred_minimum):,.2f} USDT",
            "If the balance is below the preferred plan minimum, the highest eligible lower plan is applied automatically.",
        ],
        email_type="trading-plan-selected",
    )

def send_mt5_funding_completed_email(to_email, amount, login_id, server, balance, reference_id=""):
    masked_login = f"******{str(login_id or '')[-4:]}" if login_id else "--"
    return _send_simple_transactional_email(
        to_email=to_email,
        subject="Your MetaTrader 5 account has been funded",
        title="MT5 funding completed",
        lines=[
            f"Amount transferred: {float(amount):,.2f} USDT",
            f"MT5 Login: {masked_login}",
            f"Server: {server}",
            f"MT5 balance: {float(balance):,.2f}",
            f"Reference: {reference_id or '--'}",
            "KYC approval is required for all deposits and withdrawals.",
        ],
        email_type="mt5-funding-completed",
    )


def send_mt5_credentials_assigned_email(to_email, user_name, login_id, password, server):
    lines = [
        f"Hello {user_name or 'Trader'},",
        "Your MetaTrader 5 account has been configured by the admin.",
        "Below are your MT5 login credentials:",
        f"MT5 Login ID / Account ID: {login_id}",
        f"Password: {password}",
        f"Server Name: {server}",
        "",
        "Please go to your TraidiumX Profile page and enter these details to connect and complete your MetaTrader 5 platform setup.",
    ]

    custom_html = f'''
        <p style="margin:0 0 10px;color:#cbd5e1;font-size:14px;line-height:1.65;">Hello {html.escape(user_name or 'Trader', quote=True)},</p>
        <p style="margin:0 0 10px;color:#cbd5e1;font-size:14px;line-height:1.65;">Your MetaTrader 5 account has been configured by the admin.</p>
        <p style="margin:0 0 10px;color:#cbd5e1;font-size:14px;line-height:1.65;">Below are your MT5 login credentials:</p>
        
        <div style="background: rgba(34,211,238,0.06); border: 1px solid rgba(34,211,238,0.2); border-radius: 12px; padding: 18px; margin: 15px 0;">
            <div style="margin-bottom: 12px;">
                <span style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em; display: block;">MT5 Login ID / Account ID</span>
                <strong style="color: #22d3ee; font-size: 18px; font-family: monospace; letter-spacing: 0.02em;">{html.escape(str(login_id), quote=True)}</strong>
            </div>
            <div style="margin-bottom: 12px;">
                <span style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em; display: block;">Password</span>
                <strong style="color: #ffffff; font-size: 18px; font-family: monospace; letter-spacing: 0.02em;">{html.escape(str(password), quote=True)}</strong>
            </div>
            <div>
                <span style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em; display: block;">Server Name</span>
                <strong style="color: #ffffff; font-size: 16px; font-family: monospace; letter-spacing: 0.02em;">{html.escape(str(server), quote=True)}</strong>
            </div>
        </div>
        
        <p style="margin:15px 0 10px;color:#cbd5e1;font-size:14px;line-height:1.65;">Please go to your TraidiumX Profile page and enter these details to connect and complete your MetaTrader 5 platform setup.</p>
    '''

    return _send_simple_transactional_email(
        to_email=to_email,
        subject="Your MetaTrader 5 Account Credentials",
        title="MetaTrader 5 Credentials",
        lines=lines,
        email_type="mt5-credentials-assigned",
        custom_html=custom_html
    )


def send_mt5_account_auto_provisioned_email(to_email, user_name, account_name, plan_name, login_id, master_password, investor_password, server, is_demo=False):
    mode_label = "Demo" if is_demo else "Live"
    subject = f"Your MetaTrader 5 ({mode_label}) Account is Ready - TraidiumX"
    title = f"MT5 {mode_label} Account Created"

    lines = [
        f"Hello {user_name or 'Trader'},",
        f"Your new MetaTrader 5 ({mode_label}) account '{account_name}' has been created successfully.",
        f"Plan: {plan_name}",
        f"Broker Server: {server}",
        f"Login ID / Account ID: {login_id}",
        f"Master Trading Password: {master_password}",
        f"Investor Read-Only Password: {investor_password}",
        "",
        "Use these credentials inside the official MetaTrader 5 terminal on PC, Android, iOS, or WebTrader."
    ]

    custom_html = f'''
        <p style="margin:0 0 12px;color:#cbd5e1;font-size:14px;line-height:1.65;">Hello <strong style="color:#ffffff;">{html.escape(user_name or 'Trader', quote=True)}</strong>,</p>
        <p style="margin:0 0 16px;color:#cbd5e1;font-size:14px;line-height:1.65;">Your new <strong>MetaTrader 5 ({html.escape(mode_label, quote=True)})</strong> account <strong style="color:#22d3ee;">{html.escape(account_name, quote=True)}</strong> ({html.escape(plan_name, quote=True)} Plan) has been successfully created and configured.</p>
        
        <div style="background:#090e1c;border:1px solid #1e293b;border-radius:16px;padding:20px;margin:18px 0;">
            <div style="margin-bottom:14px;border-bottom:1px solid #1e293b;padding-bottom:12px;">
                <span style="color:#94a3b8;font-size:11px;text-transform:uppercase;font-weight:bold;letter-spacing:0.06em;display:block;margin-bottom:4px;">Broker Server</span>
                <strong style="color:#34d399;font-size:16px;font-family:monospace;">{html.escape(str(server), quote=True)}</strong>
            </div>
            <div style="margin-bottom:14px;border-bottom:1px solid #1e293b;padding-bottom:12px;">
                <span style="color:#94a3b8;font-size:11px;text-transform:uppercase;font-weight:bold;letter-spacing:0.06em;display:block;margin-bottom:4px;">Login ID / Account Number</span>
                <strong style="color:#22d3ee;font-size:18px;font-family:monospace;letter-spacing:0.03em;">{html.escape(str(login_id), quote=True)}</strong>
            </div>
            <div style="margin-bottom:14px;border-bottom:1px solid #1e293b;padding-bottom:12px;">
                <span style="color:#94a3b8;font-size:11px;text-transform:uppercase;font-weight:bold;letter-spacing:0.06em;display:block;margin-bottom:4px;">Master Trading Password (Trade Access)</span>
                <strong style="color:#ffffff;font-size:16px;font-family:monospace;">{html.escape(str(master_password), quote=True)}</strong>
            </div>
            <div>
                <span style="color:#94a3b8;font-size:11px;text-transform:uppercase;font-weight:bold;letter-spacing:0.06em;display:block;margin-bottom:4px;">Investor Password (Read-Only)</span>
                <strong style="color:#d8b4fe;font-size:16px;font-family:monospace;">{html.escape(str(investor_password), quote=True)}</strong>
            </div>
        </div>

        <p style="margin:16px 0 10px;color:#94a3b8;font-size:13px;line-height:1.65;">
            You can enter these credentials directly into the <strong>MetaTrader 5 terminal</strong> on PC, mobile apps (Android/iOS), or use <strong>MetaTrader 5 WebTrader</strong>.
        </p>
    '''

    return _send_simple_transactional_email(
        to_email=to_email,
        subject=subject,
        title=title,
        lines=lines,
        email_type="mt5-account-provisioned",
        action_url="https://trade.mql5.com/trade",
        action_label="Open MT5 WebTrader",
        custom_html=custom_html
    )



def send_welcome_email(to_email, user_name=""):
    """Send a premium welcome email to a newly registered user."""
    if not is_email_delivery_configured():
        return {"sent": False, "reason": "SMTP email delivery is not configured."}
        
    safe_name = html.escape(str(user_name or "TraidiumX member").strip() or "TraidiumX member", quote=True)
    base = str(getattr(settings, "APP_PUBLIC_URL", "") or getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
    action_url = f"{base}/src/pages/profile.html#kyc" if base else ""
    
    return _send_simple_transactional_email(
        to_email=to_email,
        subject="Welcome to TraidiumX!",
        title="Welcome to TraidiumX",
        lines=[
            f"Hello {safe_name},",
            "We are thrilled to welcome you to TraidiumX—your advanced platform for trading, futures, and secure options.",
            "To get started and unlock full trading capabilities including deposits and withdrawals, please complete your profile identity verification (KYC).",
            "KYC verification is fast, secure, and requires only your mobile OTP and DigiLocker / Aadhaar verification details.",
        ],
        email_type="welcome-email",
        action_url=action_url,
        action_label="Start KYC Verification"
    )


def send_kyc_required_email(to_email, user_name=""):
    """Send a transactional email requesting the user to complete KYC."""
    if not is_email_delivery_configured():
        return {"sent": False, "reason": "SMTP email delivery is not configured."}
        
    safe_name = html.escape(str(user_name or "TraidiumX member").strip() or "TraidiumX member", quote=True)
    base = str(getattr(settings, "APP_PUBLIC_URL", "") or getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
    action_url = f"{base}/src/pages/profile.html#kyc" if base else ""

    return _send_simple_transactional_email(
        to_email=to_email,
        subject="Action Required: Complete your TraidiumX KYC Verification",
        title="Complete KYC Verification",
        lines=[
            f"Hello {safe_name},",
            "To comply with financial regulations and secure your account, you must verify your identity.",
            "KYC verification is mandatory before you can perform deposits or withdrawals.",
            "It only takes a few minutes using your Aadhaar card and mobile OTP.",
        ],
        email_type="kyc-required",
        action_url=action_url,
        action_label="Start Verification"
    )


def send_first_deposit_email(to_email, user_name=""):
    """Send a transactional email encouraging the user to make their first deposit."""
    if not is_email_delivery_configured():
        return {"sent": False, "reason": "SMTP email delivery is not configured."}
        
    safe_name = html.escape(str(user_name or "TraidiumX member").strip() or "TraidiumX member", quote=True)
    base = str(getattr(settings, "APP_PUBLIC_URL", "") or getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
    action_url = f"{base}/src/pages/wallet.html" if base else ""

    return _send_simple_transactional_email(
        to_email=to_email,
        subject="Your KYC is Approved! Make your first deposit on TraidiumX",
        title="Account Ready: Make Your First Deposit",
        lines=[
            f"Hello {safe_name},",
            "Great news! Your KYC verification has been reviewed and approved by our team.",
            "Your account is now fully active with unlimited features enabled.",
            "Make your first deposit to fund your trading account and start trading immediately.",
        ],
        email_type="first-deposit-invite",
        action_url=action_url,
        action_label="Deposit Funds"
    )


def send_kyc_approved_email(to_email, user_name=""):
    """Send a transactional email informing the user that their KYC is approved."""
    if not is_email_delivery_configured():
        return {"sent": False, "reason": "SMTP email delivery is not configured."}
        
    safe_name = html.escape(str(user_name or "TraidiumX member").strip() or "TraidiumX member", quote=True)
    base = str(getattr(settings, "APP_PUBLIC_URL", "") or getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
    action_url = f"{base}/src/pages/dashboard.html" if base else ""

    return _send_simple_transactional_email(
        to_email=to_email,
        subject="Your KYC Verification has been Approved!",
        title="KYC Approved Successfully",
        lines=[
            f"Hello {safe_name},",
            "Congratulations! Your KYC identity verification has been successfully reviewed and approved by our compliance team.",
            "Your account has been fully verified and is now ready for deposits, trading, and withdrawals.",
            "Thank you for completing your verification details.",
        ],
        email_type="kyc-approved-success",
        action_url=action_url,
        action_label="Go to Dashboard"
    )



