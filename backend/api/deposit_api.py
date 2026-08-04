from flask import Blueprint, g, request

from middleware.auth_middleware import auth_required, auth_required_allow_restricted
from services.deposit_service import (
    complete_deposit_for_development,
    create_deposit_request,
    get_crypto_deposit_addresses,
    get_deposit_history,
    verify_deposit_request,
    create_razorpay_order_service,
    verify_razorpay_payment_service,
)
from utils.response import error_response, success_response


deposit_api = Blueprint("deposit_api", __name__, url_prefix="/api/deposit")


@deposit_api.get("/crypto-addresses")
@auth_required
def crypto_addresses():
    result = get_crypto_deposit_addresses(g.current_user_id)
    return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])


@deposit_api.get("/inr-details")
@auth_required
def inr_details():
    from services.system_settings_service import get_inr_deposit_details
    details = get_inr_deposit_details()
    return success_response(message="INR deposit details fetched successfully.", data=details)



@deposit_api.post("/create")
@auth_required
def create():
    try:
        data = request.get_json(silent=True) or {}
        result = create_deposit_request(g.current_user_id, data)

        if result.get("success"):
            return success_response(message=result.get("message", "Deposit created successfully."), data=result.get("data", {}), status_code=result.get("status_code", 200))

        return error_response(message=result.get("message", "Deposit request failed."), errors=result.get("errors", {}), status_code=result.get("status_code", 400))
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(message=f"Deposit processing error: {str(e)}", errors={"system": str(e)}, status_code=500)



@deposit_api.post("/verify/<deposit_id>")
@auth_required
def verify(deposit_id):
    result = verify_deposit_request(g.current_user_id, deposit_id)

    if result["success"]:
        return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])

    return error_response(message=result["message"], errors=result.get("errors", {}), status_code=result["status_code"])


@deposit_api.get("/history")
@auth_required_allow_restricted
def history():
    result = get_deposit_history(g.current_user_id)
    return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])


@deposit_api.post("/dev-complete/<deposit_id>")
@auth_required
def dev_complete(deposit_id):
    result = complete_deposit_for_development(g.current_user_id, deposit_id)

    if result["success"]:
        return success_response(message=result["message"], data=result["data"], status_code=result["status_code"])

    return error_response(message=result["message"], errors=result["errors"], status_code=result["status_code"])


@deposit_api.post("/razorpay/create-order")
@auth_required
def create_razorpay_order():
    try:
        data = request.get_json(silent=True) or {}
        amount = data.get("amount")
        if amount is None:
            return error_response(message="Amount is required.", status_code=400)
            
        result = create_razorpay_order_service(g.current_user_id, amount)
        if result.get("success"):
            return success_response(
                message=result.get("message"), 
                data=result.get("data", {}), 
                status_code=result.get("status_code", 200)
            )
        return error_response(
            message=result.get("message"), 
            errors=result.get("errors", {}), 
            status_code=result.get("status_code", 400)
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(message=f"Razorpay order creation error: {str(e)}", status_code=500)


@deposit_api.post("/razorpay/verify-payment")
@auth_required
def verify_razorpay_payment():
    try:
        data = request.get_json(silent=True) or {}
        result = verify_razorpay_payment_service(g.current_user_id, data)
        if result.get("success"):
            return success_response(
                message=result.get("message"), 
                data=result.get("data", {}), 
                status_code=result.get("status_code", 200)
            )
        return error_response(
            message=result.get("message"), 
            errors=result.get("errors", {}), 
            status_code=result.get("status_code", 400)
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(message=f"Razorpay verification error: {str(e)}", status_code=500)


@deposit_api.post("/razorpay/webhook")
def razorpay_webhook():
    # Public route, no auth_required
    try:
        from config.settings import settings
        from utils.date_helper import now_utc
        from models.deposit_model import find_deposit_by_gateway_order_id, update_deposit_status
        from services.wallet_service import credit_main_wallet
        import json
        import uuid
        
        payload = request.data
        signature = request.headers.get("X-Razorpay-Signature")

        from admin.settings_routes import get_final_settings
        system_settings = get_final_settings()
        key_id = system_settings.get("razorpay_key_id") or settings.RAZORPAY_KEY_ID
        key_secret = system_settings.get("razorpay_key_secret") or settings.RAZORPAY_KEY_SECRET
        secret = system_settings.get("razorpay_webhook_secret") or settings.RAZORPAY_WEBHOOK_SECRET
        
        # Verify the signature if we have a secret configured
        if secret and signature:
            import razorpay
            client = razorpay.Client(auth=(key_id, key_secret))
            try:
                client.utility.verify_webhook_signature(payload, signature, secret)
            except Exception as e:
                return error_response(message=f"Invalid webhook signature: {str(e)}", status_code=400)
        
        event_data = json.loads(payload.decode("utf-8"))
        event = event_data.get("event")
        
        if event == "order.paid":
            order_entity = event_data.get("payload", {}).get("order", {}).get("entity", {})
            razorpay_order_id = order_entity.get("id")
            
            if razorpay_order_id:
                deposit = find_deposit_by_gateway_order_id(razorpay_order_id)
                if deposit and deposit.get("status") != "completed":
                    # Get payment details
                    payments_payload = event_data.get("payload", {}).get("payment", {})
                    payment_entity = payments_payload.get("entity", {}) if isinstance(payments_payload, dict) else {}
                    razorpay_payment_id = payment_entity.get("id") or f"pay_webhook_{uuid.uuid4().hex[:8]}"
                    
                    amount = float(deposit["amount"])
                    wallet = credit_main_wallet(
                        user_id=deposit["user_id"],
                        amount=amount,
                        transaction_type="inr_deposit_credit",
                        reference_id=str(deposit["_id"]),
                        description=f"INR deposit credited via Webhook. Reference {deposit['deposit_reference']}",
                        currency="INR"
                    )
                    
                    update_deposit_status(str(deposit["_id"]), "completed", {
                        "gateway_payment_id": razorpay_payment_id,
                        "tx_hash": razorpay_payment_id,
                        "verification_status": "verified",
                        "verification_message": f"Webhook verification success. Payment ID: {razorpay_payment_id}",
                        "credited_at": now_utc(),
                        "verified_amount": amount,
                        "confirmations": 1,
                        "remark": "Deposited via Razorpay Webhook.",
                        "wallet_after_credit": {
                            "available_balance": (wallet.get("main_wallet_inr") or {}).get("available_balance", 0.0),
                            "locked_balance": (wallet.get("main_wallet_inr") or {}).get("locked_balance", 0.0),
                            "total_balance": (wallet.get("main_wallet_inr") or {}).get("total_balance", 0.0),
                            "wallet_type": "main_wallet_inr"
                        }
                    })
        return success_response(message="Webhook processed successfully.", data={})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return success_response(message=f"Webhook parsing error: {str(e)}", data={"error": str(e)})

