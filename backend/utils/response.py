from flask import jsonify


def success_response(message="Success", data=None, status_code=200):
    return jsonify({
        "success": True,
        "message": message,
        "data": data if data is not None else {}
    }), status_code


def error_response(message="Something went wrong", errors=None, status_code=400):
    return jsonify({
        "success": False,
        "message": message,
        "errors": errors if errors is not None else {}
    }), status_code