"use strict";

let activeTab = "open"; // "open" or "history"

document.addEventListener("DOMContentLoaded", function () {
    initOrdersPage();
});

function initOrdersPage() {
    if (!isLoggedIn()) {
        window.location.href = "/src/pages/login.html";
        return;
    }

    // Bind tab clicks
    document.getElementById("tabOpenOrders")?.addEventListener("click", function () {
        switchTab("open");
    });

    document.getElementById("tabOrderHistory")?.addEventListener("click", function () {
        switchTab("history");
    });

    // Initial load
    loadOrders();
}

function switchTab(tab) {
    activeTab = tab;
    
    // Toggle active tab class
    const tabOpen = document.getElementById("tabOpenOrders");
    const tabHistory = document.getElementById("tabOrderHistory");

    if (tabOpen && tabHistory) {
        if (tab === "open") {
            tabOpen.classList.add("active");
            tabHistory.classList.remove("active");
        } else {
            tabHistory.classList.add("active");
            tabOpen.classList.remove("active");
        }
    }

    // Clear table body and show loading indicator
    const tbody = document.getElementById("ordersTableBody");
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8">
                    <span class="text-slate-400">Loading orders...</span>
                </td>
            </tr>
        `;
    }

    loadOrders();
}

async function loadOrders() {
    const tbody = document.getElementById("ordersTableBody");
    const emptyState = document.getElementById("ordersEmptyState");
    const table = document.getElementById("ordersTable");

    if (!tbody) return;

    try {
        const url = activeTab === "open" ? "/trading/open-orders" : "/trading/orders";
        const response = await apiRequest(url);
        
        let ordersList = [];
        if (response && response.success && response.data) {
            ordersList = response.data.open_orders || response.data.orders || response.data || [];
        }

        // Sort: newest first
        ordersList.sort((a, b) => {
            const timeA = new Date(a.created_at || a.timestamp || 0).getTime();
            const timeB = new Date(b.created_at || b.timestamp || 0).getTime();
            return timeB - timeA;
        });

        tbody.innerHTML = "";

        if (ordersList.length === 0) {
            table?.classList.add("hidden");
            emptyState?.classList.remove("hidden");
            return;
        }

        table?.classList.remove("hidden");
        emptyState?.classList.add("hidden");

        ordersList.forEach(order => {
            const tr = document.createElement("tr");

            // Format date
            const dateStr = formatOrderDate(order.created_at || order.timestamp);

            // Format symbol
            const symbol = escapeOrdersHtml(order.symbol || order.pair || "--");

            // Format type
            const type = escapeOrdersHtml(order.type || order.order_type || "Limit");

            // Format side
            const side = String(order.side || "").toLowerCase() === "buy" 
                ? `<span class="tx-badge-buy">Buy</span>` 
                : `<span class="tx-badge-sell">Sell</span>`;

            // Format price
            const priceVal = order.limit_price || order.stop_price || order.estimated_price || order.price || 0;
            const price = formatOrderAmount(priceVal);

            // Format amount
            const amountVal = order.quantity || order.amount || order.qty || 0;
            const amount = formatOrderAmount(amountVal);

            // Format status
            const status = escapeOrdersHtml(order.status || "Open");

            // Cancel action button (only for open orders)
            const orderId = order.order_id || order.id || order._id;
            let actionHtml = "--";
            if (activeTab === "open" && orderId) {
                actionHtml = `<button type="button" class="tx-orders-cancel-btn" onclick="cancelOrder('${orderId}')">Cancel</button>`;
            }

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td class="font-bold text-white">${symbol}</td>
                <td class="capitalize">${type}</td>
                <td>${side}</td>
                <td class="font-semibold">${price}</td>
                <td class="font-semibold">${amount}</td>
                <td class="capitalize font-bold text-cyan-400">${status}</td>
                <td>${actionHtml}</td>
            `;

            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Failed to load orders:", error);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8">
                    <span class="text-red-400">Failed to load orders: ${escapeOrdersHtml(error.message)}</span>
                </td>
            </tr>
        `;
    }
}

window.cancelOrder = async function (orderId) {
    if (!confirm("Are you sure you want to cancel this order?")) {
        return;
    }

    try {
        const response = await apiRequest(`/trading/cancel/${orderId}`, {
            method: "POST"
        });

        if (response && response.success) {
            alert("Order cancelled successfully!");
            loadOrders();
        } else {
            alert(response.message || "Failed to cancel order.");
        }
    } catch (error) {
        console.error("Cancel order error:", error);
        alert(error.message || "An error occurred while cancelling the order.");
    }
};

function formatOrderDate(val) {
    if (!val) return "--";
    const date = new Date(val);
    if (isNaN(date.getTime())) return "--";
    return date.toLocaleString("en-IN", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatOrderAmount(val) {
    const num = Number(val);
    if (isNaN(num)) return "--";
    return num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8
    });
}

function escapeOrdersHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
