def calculate_position_pnl(position, current_price):
    quantity = float(position.get("quantity", 0.0))
    entry_price = float(position.get("entry_price", 0.0))
    margin_amount = float(position.get("margin_amount", 0.0))
    position_side = position.get("position_side")

    current_price = float(current_price)

    if position_side == "long":
        unrealized_pnl = (current_price - entry_price) * quantity
    elif position_side == "short":
        unrealized_pnl = (entry_price - current_price) * quantity
    else:
        unrealized_pnl = 0.0

    roe_percent = 0.0

    if margin_amount > 0:
        roe_percent = (unrealized_pnl / margin_amount) * 100

    return {
        "current_price": round(current_price, 8),
        "unrealized_pnl": round(unrealized_pnl, 8),
        "roe_percent": round(roe_percent, 4)
    }