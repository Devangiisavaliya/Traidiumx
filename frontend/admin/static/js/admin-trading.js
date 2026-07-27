"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Admin Trading Monitor
|--------------------------------------------------------------------------
| Orders page stays clean audit/history layout.
| No live price on Orders page.
| Positions page monitors open positions with fast tick prices and keeps closed positions frozen at exit/close price.
*/

document.addEventListener("DOMContentLoaded", async () => {
    const ui = window.TXAdmin;
    const api = window.TXAdminApi;
    if (!ui || !api || !api.requireAuth()) return;

    const pageName = document.body.dataset.adminPage;
    const state = {
        orders: { page: 1, limit: 25, lastRows: [], pagination: {} },
        positions: { page: 1, limit: 25, lastRows: [], pagination: {} },
        positionPrices: {},
        positionPriceSocket: null,
        positionRestTimer: null,
        positionRenderTimer: null,
        positionSymbols: []
    };

    const OPEN_ORDER_STATUSES = ["open", "pending", "pending_trigger", "partially_filled"];
    const FILLED_ORDER_STATUSES = ["filled", "executed", "completed"];
    const CANCELLED_ORDER_STATUSES = ["cancelled", "canceled", "rejected", "expired", "failed"];
    const OPEN_POSITION_STATUSES = ["open", "active", "running"];
    const CLOSED_POSITION_STATUSES = ["closed", "settled", "liquidated", "completed", "exited", "sold", "filled_close", "closed_market"];

    function text(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function value(id) {
        return String(document.getElementById(id)?.value || "").trim();
    }

    function setButtonLoading(button, loading, label = "Loading...") {
        if (!button) return;
        if (loading) {
            button.dataset.originalText = button.dataset.originalText || button.textContent;
            button.textContent = label;
            button.disabled = true;
            button.classList.add("opacity-60", "cursor-not-allowed");
        } else {
            button.textContent = button.dataset.originalText || button.textContent;
            button.disabled = false;
            button.classList.remove("opacity-60", "cursor-not-allowed");
        }
    }

    function safeDate(value) {
        return value ? api.fmtDate(value) : "-";
    }

    function orderTimeParts(value) {
        if (!value) return { date: "-", time: "", title: "-" };
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return { date: String(value), time: "", title: String(value) };
        return {
            date: d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }),
            time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
            title: d.toLocaleString()
        };
    }

    function compactId(id) {
        const textValue = String(id || "-");
        return textValue.length > 12 ? textValue.slice(0, 10) : textValue;
    }

    function titleCase(value) {
        return String(value || "")
            .replace(/_/g, " ")
            .replace(/\b\w/g, char => char.toUpperCase());
    }

    function sideClass(side) {
        const value = String(side || "").toLowerCase();
        return value === "long" || value === "buy" ? "text-emerald-300" : "text-rose-300";
    }

    function riskClass(risk) {
        const value = String(risk || "low").toLowerCase();
        if (value === "critical" || value === "high") return "status-pill status-rejected";
        if (value === "medium") return "status-pill status-pending";
        return "status-pill status-approved";
    }

    function orderStatusGroup(status) {
        const value = String(status || "").toLowerCase();
        if (["active", "running"].includes(value) || OPEN_ORDER_STATUSES.includes(value)) return "active";
        if (["closed", "settled"].includes(value) || FILLED_ORDER_STATUSES.includes(value)) return "filled";
        if (CANCELLED_ORDER_STATUSES.includes(value)) return "cancelled";
        return value || "unknown";
    }

    function orderStatusClass(group) {
        const value = String(group || "").toLowerCase();
        if (value === "active") return "status-pill status-review";
        if (value === "filled") return "status-pill status-approved";
        if (value === "cancelled") return "status-pill status-rejected";
        return ui.statusClass(value);
    }

    function normalizeDisplaySymbol(item) {
        return item.display_symbol || item.contract || item.symbol || item.ticker_symbol || "-";
    }

    function normalizeOrder(item) {
        const id = api.getId(item);
        const qty = api.number(item.quantity || item.qty);
        const entryPrice = api.number(item.entry_price || item.entry || item.open_price || item.buy_price || item.price || item.limit_price || item.estimated_price || item.average_fill_price || item.execution_price || item.executed_price || item.filled_price);
        const exitPrice = api.number(item.exit_price || item.close_price || item.closed_price || item.average_exit_price || item.settlement_price || item.sell_price || item.filled_exit_price);
        const notional = api.number(item.notional_value || item.notional || item.total || item.amount || (qty * entryPrice));
        const leverageRaw = item.leverage || item.lev || item.leverage_text || 1;
        const leverageNumber = api.number(String(leverageRaw).replace(/x/gi, "")) || 1;
        const margin = api.number(item.margin_amount || item.used_margin || item.margin_used || item.required_margin || item.wallet_lock_amount || item.wallet_locked_amount || item.margin) || (notional > 0 && leverageNumber > 0 ? notional / leverageNumber : 0);
        const market = item.market_type || item.trading_type || item.segment || item.product_type || "futures";
        const statusValue = item.order_status || item.status || "active";
        const statusGroup = orderStatusGroup(statusValue);
        const sideRaw = String(item.side || item.action || item.position_side || item.entry_side || "buy").toLowerCase();
        const entrySide = String(item.entry_side || (sideRaw === "sell" || sideRaw === "short" ? "SELL" : "BUY")).toUpperCase();
        const exitSide = String(item.exit_side || (statusGroup === "filled" ? (entrySide === "SELL" ? "BUY" : "SELL") : "-")).toUpperCase();
        const pnl = api.number(item.pnl || item.realized_pnl || item.closed_pnl || item.profit_loss || 0);
        const createdSource = item.created_at || item.opened_at || item.executed_at || item.date;
        const updatedSource = item.closed_at || item.settled_at || item.updated_at || item.executed_at || item.cancelled_at;
        return {
            id,
            shortId: compactId(id),
            userId: item.user_id || item.user?.id || "",
            user: api.userLabel(item) || item.user_id || "Unknown User",
            email: api.userEmail(item),
            symbol: normalizeDisplaySymbol(item),
            tickerSymbol: item.ticker_symbol || item.symbol || "",
            market,
            side: entrySide,
            entrySide,
            exitSide: statusGroup === "filled" ? exitSide : "-",
            type: item.order_type || item.type || "market",
            qty,
            entryPrice,
            exitPrice: statusGroup === "filled" ? exitPrice : 0,
            price: entryPrice,
            leverage: leverageNumber,
            leverageLabel: leverageNumber > 1 ? `${leverageNumber}x` : "-",
            margin,
            notional,
            pnl,
            status: statusValue,
            statusGroup,
            createdAt: safeDate(createdSource),
            updatedAt: safeDate(updatedSource),
            createdParts: orderTimeParts(statusGroup === "filled" ? (updatedSource || createdSource) : createdSource),
            raw: item
        };
    }

    function normalizePosition(item) {
        const id = api.getId(item);
        const entry = api.number(item.entry_price || item.entry || item.open_price || item.buy_price);
        const rawExit = api.number(item.exit_price || item.close_price || item.closed_price || item.average_exit_price || item.settlement_price || item.sell_price || item.filled_exit_price);
        const mark = api.number(item.mark_price || item.mark || item.current_price || rawExit || entry);
        const margin = api.number(item.margin_amount || item.margin || item.wallet_lock_amount);
        const qty = api.number(item.quantity || item.qty);
        const status = String(item.status || "open").toLowerCase();
        const side = item.position_side || item.side || "-";
        const tickerSymbol = normalizeTickerSymbol(item.ticker_symbol || item.symbol || item.underlying || item.display_symbol);
        const isClosed = CLOSED_POSITION_STATUSES.includes(status);
        const realized = api.number(item.realized_pnl || item.closed_pnl || item.settled_pnl || item.profit_loss);
        const unrealized = api.number(item.unrealized_pnl || item.pnl);
        const fallbackPnl = isClosed ? realized : unrealized;
        const roi = item.roi_percent !== undefined && item.roi_percent !== null
            ? api.number(item.roi_percent)
            : (margin > 0 ? (fallbackPnl / margin) * 100 : 0);
        const risk = item.risk_level || item.risk || "low";
        const openedAt = safeDate(item.created_at || item.opened_at || item.date);
        const updatedAt = safeDate(item.updated_at);
        const closedAt = safeDate(item.closed_at || item.settled_at || item.liquidated_at);

        return {
            id,
            shortId: compactId(id),
            userId: item.user_id || item.user?.id || "",
            user: api.userLabel(item) || item.user_id || "Unknown User",
            email: api.userEmail(item),
            symbol: item.display_symbol || item.contract || item.symbol || "-",
            tickerSymbol,
            market: String(item.market_type || item.trading_type || item.segment || item.product_type || "futures").toLowerCase(),
            side,
            sideLabel: normalizeSideLabel(side),
            qty,
            margin,
            notional: api.number(item.notional_value || item.notional || (qty * entry)),
            leverage: item.leverage ? `${item.leverage}x` : "-",
            entry,
            mark,
            exitPrice: rawExit,
            liquidation: api.number(item.liquidation_price),
            pnl: fallbackPnl,
            roi,
            status,
            isClosed,
            risk,
            distance: item.liquidation_distance_percent,
            openedAt,
            updatedAt,
            closedAt,
            raw: item
        };
    }

    function normalizeTickerSymbol(symbol) {
        let text = String(symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
        if (!text) return "";
        if (text.includes("USDT")) {
            text = text.slice(0, text.indexOf("USDT") + 4);
        }
        if (["BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "LTC", "XAU"].includes(text)) {
            text = `${text}USDT`;
        }
        return text;
    }

    function normalizeSideLabel(side) {
        const value = String(side || "").toLowerCase();
        if (["long", "buy"].includes(value)) return "BUY";
        if (["short", "sell"].includes(value)) return "SELL";
        return String(side || "-").toUpperCase();
    }

    function positionOpenAction(side) {
        return isSellSide(side) ? "SELL" : "BUY";
    }

    function positionCloseAction(side) {
        return isSellSide(side) ? "BUY" : "SELL";
    }

    function isBuySide(side) {
        return ["long", "buy"].includes(String(side || "").toLowerCase());
    }

    function isSellSide(side) {
        return ["short", "sell"].includes(String(side || "").toLowerCase());
    }

    function currentPositionPrice(position) {
        // Closed positions must stay frozen at the final exit/close price.
        // Only open positions are allowed to use the fast live tick feed.
        if (position.isClosed) {
            return position.exitPrice || position.mark || position.entry || 0;
        }
        // Options do not use Binance futures live ticks here. Keep their stored option mark/exit value stable.
        if (String(position.market || "").toLowerCase().includes("option")) {
            return position.mark || position.entry || 0;
        }
        const live = api.number(state.positionPrices[position.tickerSymbol]);
        if (live > 0) return live;
        return position.mark || position.entry || 0;
    }

    function computePositionMetrics(position) {
        const livePrice = currentPositionPrice(position);
        let pnl = position.pnl;
        if (!position.isClosed && position.entry > 0 && livePrice > 0 && position.qty > 0) {
            if (isSellSide(position.side)) pnl = (position.entry - livePrice) * position.qty;
            else pnl = (livePrice - position.entry) * position.qty;
        }
        if (position.isClosed && position.exitPrice > 0 && position.entry > 0 && position.qty > 0 && !position.pnl) {
            pnl = isSellSide(position.side) ? (position.entry - position.exitPrice) * position.qty : (position.exitPrice - position.entry) * position.qty;
        }
        const roi = position.margin > 0 ? (pnl / position.margin) * 100 : position.roi;
        return {
            livePrice: Number(livePrice || 0),
            pnl: Number(pnl || 0),
            roi: Number(roi || 0)
        };
    }

    function pnlClass(value) {
        const n = api.number(value);
        if (n > 0) return "text-emerald-300";
        if (n < 0) return "text-rose-300";
        return "text-slate-200";
    }

    function positionStatusGroup(status) {
        const value = String(status || "open").toLowerCase();
        if (OPEN_POSITION_STATUSES.includes(value)) return "open";
        if (CLOSED_POSITION_STATUSES.includes(value)) return "closed";
        return value;
    }

    function compactNumber(value, decimals = 4) {
        const n = api.number(value);
        return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
    }

    function paginationMeta(pagination, kind) {
        const total = Number(pagination?.total || 0);
        const page = Number(pagination?.page || state[kind].page || 1);
        const limit = Number(pagination?.limit || state[kind].limit || 25);
        const pages = Number(pagination?.pages || pagination?.total_pages || Math.max(Math.ceil(total / Math.max(limit, 1)), 1));
        return {
            total,
            page,
            limit,
            pages,
            has_prev: page > 1,
            has_next: page < pages
        };
    }

    function paginationItems(page, pages) {
        const items = [];
        const from = Math.max(1, page - 2);
        const to = Math.min(pages, page + 2);
        if (from > 1) items.push(1);
        if (from > 2) items.push("...");
        for (let i = from; i <= to; i += 1) items.push(i);
        if (to < pages - 1) items.push("...");
        if (to < pages) items.push(pages);
        return items;
    }

    function renderPagination(kind, pagination) {
        const prefix = kind === "orders" ? "orders" : "positions";
        const meta = paginationMeta(pagination, kind);
        state[kind].pagination = meta;
        const start = meta.total ? ((meta.page - 1) * meta.limit) + 1 : 0;
        const end = Math.min(meta.page * meta.limit, meta.total);

        text(`${prefix}PageLabel`, `Page ${meta.page} / ${meta.pages || 1}`);
        text(`${prefix}Meta`, `${meta.total.toLocaleString()} records • showing ${meta.limit} per page`);
        text(`${prefix}ShowingLabel`, meta.total ? `Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${meta.total.toLocaleString()} ${kind}` : `Showing 0 ${kind}`);

        const prev = document.getElementById(`${prefix}PrevBtn`);
        const next = document.getElementById(`${prefix}NextBtn`);
        if (prev) prev.disabled = !meta.has_prev;
        if (next) next.disabled = !meta.has_next;

        const pageHolder = document.getElementById(`${prefix}PageNumbers`);
        const oldContainer = document.getElementById(`${prefix}Pagination`);
        const container = pageHolder || oldContainer;
        if (!container) return;

        if (!meta.total) {
            container.innerHTML = "";
            return;
        }

        const pages = paginationItems(meta.page, meta.pages);
        if (pageHolder) {
            container.innerHTML = pages.map(item => item === "..."
                ? `<span class="pagination-ellipsis">…</span>`
                : `<button type="button" class="page-chip ${item === meta.page ? "active" : ""}" data-${prefix}-page-number="${item}">${item}</button>`
            ).join("");
        } else {
            container.innerHTML = `
                <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <p class="text-xs font-bold text-slate-400">Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${meta.total.toLocaleString()}</p>
                    <div class="flex flex-wrap items-center gap-2">
                        <button class="admin-btn py-2" data-${prefix}-page="first" ${meta.page <= 1 ? "disabled" : ""}>First</button>
                        <button class="admin-btn py-2" data-${prefix}-page="prev" ${!meta.has_prev ? "disabled" : ""}>Prev</button>
                        ${pages.map(item => item === "..." ? `<span class="px-2 text-slate-500">...</span>` : `<button class="admin-btn py-2 ${item === meta.page ? "admin-btn-primary" : ""}" data-${prefix}-page-number="${item}">${item}</button>`).join("")}
                        <button class="admin-btn py-2" data-${prefix}-page="next" ${!meta.has_next ? "disabled" : ""}>Next</button>
                        <button class="admin-btn py-2" data-${prefix}-page="last" ${meta.page >= meta.pages ? "disabled" : ""}>Last</button>
                    </div>
                </div>
            `;
        }

        container.querySelectorAll(`[data-${prefix}-page-number]`).forEach(button => {
            button.addEventListener("click", () => {
                state[kind].page = Number(button.dataset[`${prefix}PageNumber`]);
                kind === "orders" ? loadOrders() : loadPositions();
            });
        });
        container.querySelector(`[data-${prefix}-page='first']`)?.addEventListener("click", () => { state[kind].page = 1; kind === "orders" ? loadOrders() : loadPositions(); });
        container.querySelector(`[data-${prefix}-page='prev']`)?.addEventListener("click", () => { state[kind].page = Math.max(meta.page - 1, 1); kind === "orders" ? loadOrders() : loadPositions(); });
        container.querySelector(`[data-${prefix}-page='next']`)?.addEventListener("click", () => { state[kind].page = Math.min(meta.page + 1, meta.pages); kind === "orders" ? loadOrders() : loadPositions(); });
        container.querySelector(`[data-${prefix}-page='last']`)?.addEventListener("click", () => { state[kind].page = meta.pages; kind === "orders" ? loadOrders() : loadPositions(); });
    }

    function orderParams() {
        return {
            page: state.orders.page,
            limit: state.orders.limit,
            search: value("ordersSearch"),
            market: value("ordersMarket"),
            symbol: value("ordersSymbol").toUpperCase(),
            status: value("ordersStatus"),
            side: value("ordersSide"),
            type: value("ordersType")
        };
    }

    function positionParams() {
        return {
            page: state.positions.page,
            limit: state.positions.limit,
            search: value("positionsSearch"),
            symbol: value("positionsSymbol").toUpperCase(),
            status: "open",
            side: value("positionsSide"),
            risk: value("positionsRisk"),
            market: value("positionsMarket"),
            date_from: value("positionsDateFrom"),
            date_to: value("positionsDateTo")
        };
    }

    function renderOrderSummary(summary) {
        text("ordersTotal", api.number(summary.total_orders || summary.total || 0).toLocaleString());
        text("ordersOpen", api.number(summary.open_orders || summary.open || 0).toLocaleString());
        text("ordersFilled", api.number(summary.filled_orders || summary.filled || 0).toLocaleString());
        text("ordersCancelled", api.number(summary.cancelled_orders || summary.cancelled || 0).toLocaleString());
        text("ordersToday", api.number(summary.today_orders || summary.today || 0).toLocaleString());
        text("ordersNotional", ui.money(summary.notional_value || summary.notional || summary.volume || 0));
    }

    function renderPositionSummary(summary) {
        text("positionsTotal", api.number(summary.total_positions || summary.total || 0).toLocaleString());
        text("positionsOpen", api.number(summary.open_positions || summary.open || 0).toLocaleString());
        text("positionsClosed", api.number(summary.closed_positions || summary.closed || 0).toLocaleString());
        text("positionsLong", api.number(summary.long_positions || summary.long || 0).toLocaleString());
        text("positionsShort", api.number(summary.short_positions || summary.short || 0).toLocaleString());
        text("positionsHighRisk", api.number(summary.high_risk || summary.highRisk || 0).toLocaleString());

        const pnl = api.number(summary.unrealized_pnl || summary.pnl || 0);
        const realized = api.number(summary.realized_pnl || summary.realized || 0);
        const pnlEl = document.getElementById("positionsPnl");
        if (pnlEl) {
            pnlEl.textContent = ui.money(pnl);
            pnlEl.classList.toggle("text-emerald-300", pnl > 0);
            pnlEl.classList.toggle("text-rose-300", pnl < 0);
            pnlEl.classList.toggle("text-white", pnl === 0);
        }
        const realizedEl = document.getElementById("positionsRealizedPnl");
        if (realizedEl) {
            realizedEl.textContent = ui.money(realized);
            realizedEl.classList.toggle("text-emerald-300", realized > 0);
            realizedEl.classList.toggle("text-rose-300", realized < 0);
            realizedEl.classList.toggle("text-white", realized === 0);
        }
        text("positionsMargin", ui.money(summary.margin_amount || 0));
        text("positionsNotional", ui.money(summary.notional_value || 0));
    }

    function orderMarketClass(market) {
        const value = String(market || "").toLowerCase();
        if (value.includes("option")) return "orders-market-options";
        if (value.includes("future")) return "orders-market-futures";
        return "orders-market-futures";
    }

    function renderOrders(rows) {
        const ordersBody = document.getElementById("ordersTableBody");
        if (!ordersBody) return;

        if (!rows.length) {
            ordersBody.innerHTML = api.emptyRow(13, "No orders found for selected filters.");
            return;
        }

        ordersBody.innerHTML = rows.map(raw => {
            const o = normalizeOrder(raw);
            const market = titleCase(String(o.market || "").toLowerCase().replace(/_/g, " "));
            const marketClass = orderMarketClass(o.market);
            const statusLabel = o.statusGroup === "active" ? "Active" : titleCase(o.statusGroup);
            const typeLabel = titleCase(o.type);
            const pnlClassName = o.pnl > 0 ? "text-emerald-300" : (o.pnl < 0 ? "text-rose-300" : "text-slate-400");
            const exitText = o.statusGroup === "filled" && o.exitPrice > 0 ? ui.money(o.exitPrice) : "Active";
            return `
                <tr>
                    <td>
                        <a class="orders-clip font-black text-cyan-300 hover:text-cyan-200" title="${api.escapeHtml(o.user)}" href="/admin/users/detail?id=${encodeURIComponent(o.userId)}">${api.escapeHtml(o.user)}</a>
                        <div class="orders-muted orders-clip" title="${api.escapeHtml(o.email || o.userId)}">${api.escapeHtml(o.email || o.userId)}</div>
                    </td>
                    <td><span class="orders-badge status-pill orders-market-badge ${marketClass}">${api.escapeHtml(market)}</span></td>
                    <td>
                        <div class="orders-clip font-black text-white" title="${api.escapeHtml(o.symbol)}">${api.escapeHtml(o.symbol)}</div>
                        ${o.tickerSymbol && o.tickerSymbol !== o.symbol ? `<div class="orders-muted orders-clip" title="${api.escapeHtml(o.tickerSymbol)}">${api.escapeHtml(o.tickerSymbol)}</div>` : ""}
                    </td>
                    <td>
                        <div class="orders-mini-label">Entry</div>
                        <div class="orders-nowrap font-black ${sideClass(o.entrySide)}">${api.escapeHtml(o.entrySide)}</div>
                        <div class="orders-mini-label mt-1">Exit</div>
                        <div class="orders-nowrap font-black ${o.exitSide === "-" ? "text-slate-500" : sideClass(o.exitSide)}">${api.escapeHtml(o.exitSide)}</div>
                    </td>
                    <td><div class="orders-nowrap font-bold text-white">${api.escapeHtml(typeLabel)}</div></td>
                    <td>
                        <div class="orders-nowrap font-black text-white">${o.qty.toLocaleString()}</div>
                        <div class="orders-muted orders-nowrap">Lev ${api.escapeHtml(o.leverageLabel)}</div>
                    </td>
                    <td>
                        <div class="orders-mini-label">Entry</div>
                        <div class="orders-money font-black text-white">${ui.money(o.entryPrice)}</div>
                        <div class="orders-mini-label mt-1">Exit</div>
                        <div class="orders-money font-black ${o.statusGroup === "filled" ? "text-white" : "text-slate-500"}">${api.escapeHtml(exitText)}</div>
                    </td>
                    <td class="orders-money font-black text-amber-200">${ui.money(o.margin)}</td>
                    <td class="orders-money font-black text-white">${ui.money(o.notional)}</td>
                    <td class="orders-money font-black ${pnlClassName}">${ui.money(o.pnl)}</td>
                    <td><span class="orders-badge ${orderStatusClass(o.statusGroup)}">${api.escapeHtml(statusLabel)}</span></td>
                    <td title="${api.escapeHtml(o.createdParts.title)}">
                        <div class="orders-time font-black text-white">${api.escapeHtml(o.createdParts.date)}</div>
                        <div class="orders-muted orders-time">${api.escapeHtml(o.createdParts.time)}</div>
                    </td>
                    <td class="text-right">
                        <div class="orders-actions">
                            <a class="admin-btn admin-btn-primary py-2" href="/admin/users/detail?id=${encodeURIComponent(o.userId)}">User</a>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    function renderPositionLiveTotals(rows) {
        let livePnl = 0;
        let realizedPnl = 0;
        (rows || []).forEach(raw => {
            const p = normalizePosition(raw);
            const metrics = computePositionMetrics(p);
            if (p.isClosed) realizedPnl += metrics.pnl;
            else livePnl += metrics.pnl;
        });

        const liveEl = document.getElementById("positionsPnl");
        if (liveEl) {
            liveEl.textContent = ui.money(livePnl);
            liveEl.className = `mt-3 text-3xl font-black ${pnlClass(livePnl)}`;
        }

        const realizedEl = document.getElementById("positionsRealizedPnl");
        if (realizedEl) {
            realizedEl.textContent = ui.money(realizedPnl);
            realizedEl.className = `mt-3 text-3xl font-black ${pnlClass(realizedPnl)}`;
        }
    }

    function renderPositions(rows) {
        const positionsBody = document.getElementById("positionsTableBody");
        if (!positionsBody) return;
        renderPositionLiveTotals(rows || []);
        if (!rows.length) {
            positionsBody.innerHTML = api.emptyRow(12, "No positions found. Change Status to All / Closed or clear filters.");
            text("positionsLiveStatus", "Live feed: waiting");
            return;
        }

        positionsBody.innerHTML = rows.map(raw => {
            const p = normalizePosition(raw);
            const metrics = computePositionMetrics(p);
            const risk = String(p.risk || "low").toLowerCase();
            const distance = p.distance === null || p.distance === undefined ? "-" : `${api.number(p.distance).toFixed(2)}% away`;
            const statusGroup = positionStatusGroup(p.status);
            const statusClass = statusGroup === "open" ? "status-pill status-review" : ui.statusClass(statusGroup);
            const marketLabel = titleCase(String(p.market || "futures"));
            const exitDisplay = p.exitPrice > 0 ? ui.money(p.exitPrice) : "Not closed";
            const liveSub = p.isClosed ? "Closed / fixed" : "Live tick";
            const openAction = positionOpenAction(p.side);
            const closeAction = positionCloseAction(p.side);
            const exitTitle = `${closeAction}`;

            return `
                <tr class="position-row position-row-clean" data-position-id="${api.escapeHtml(p.id)}">
                    <td>
                        <div class="font-black text-white">${api.escapeHtml(p.shortId)}</div>
                        <button class="pos-copy-link" data-copy="${api.escapeHtml(p.id)}">Copy</button>
                    </td>
                    <td>
                        <a class="font-black text-cyan-300 hover:text-cyan-200" href="/admin/users/detail?id=${encodeURIComponent(p.userId)}">${api.escapeHtml(p.user)}</a>
                        <div class="max-w-[140px] truncate text-xs text-slate-500" title="${api.escapeHtml(p.email || p.userId)}">${api.escapeHtml(p.email || p.userId)}</div>
                    </td>
                    <td>
                        <div class="pos-symbol-main font-black text-white" title="${api.escapeHtml(p.symbol)}">${api.escapeHtml(p.symbol)}</div>
                        <div class="position-meta-line">${api.escapeHtml(p.tickerSymbol || p.symbol)} · ${api.escapeHtml(marketLabel)}</div>
                    </td>
                    <td>
                        <span class="position-side-badge ${isSellSide(p.side) ? "sell" : "buy"}">${api.escapeHtml(p.sideLabel)}</span>
                        <span class="mt-1 inline-flex ${statusClass}">${api.escapeHtml(titleCase(p.status))}</span>
                    </td>
                    <td>
                        <div class="font-black text-white">${compactNumber(p.qty)}</div>
                        <div class="position-meta-line">${api.escapeHtml(p.leverage)}</div>
                    </td>
                    <td>
                        <div class="position-mini-label">${api.escapeHtml(openAction)}</div>
                        <div class="font-black text-white">${ui.money(p.entry)}</div>
                    </td>
                    <td>
                        <div class="position-mini-label text-cyan-300">${api.escapeHtml(liveSub)}</div>
                        <div class="position-live-price font-black text-white" data-live-symbol="${api.escapeHtml(p.tickerSymbol)}" data-live-position-id="${api.escapeHtml(p.id)}">${ui.money(metrics.livePrice)}</div>
                    </td>
                    <td>
                        <div class="font-black ${pnlClass(metrics.pnl)}" data-position-pnl="${api.escapeHtml(p.id)}">${ui.money(metrics.pnl)}</div>
                        <div class="text-xs font-black ${pnlClass(metrics.roi)}" data-position-roi="${api.escapeHtml(p.id)}">${metrics.roi.toFixed(2)}%</div>
                    </td>
                    <td>
                        <div class="font-bold text-amber-200">${ui.money(p.margin)}</div>
                        <div class="position-meta-line">Value ${ui.money(p.notional)}</div>
                    </td>
                    <td>
                        <div class="font-bold text-white">${p.liquidation > 0 ? ui.money(p.liquidation) : "-"}</div>
                        <div class="position-meta-line">${api.escapeHtml(distance)}</div>
                        <span class="mt-1 inline-flex ${riskClass(risk)}">${api.escapeHtml(titleCase(risk))}</span>
                    </td>
                    <td class="text-right">
                        <div class="action-stack justify-end">
                            <button class="admin-btn py-2" data-position-detail="${api.escapeHtml(p.id)}">View</button>
                            <a class="admin-btn admin-btn-primary py-2" href="/admin/users/detail?id=${encodeURIComponent(p.userId)}">User</a>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    function renderPositionDetail(positionId) {
        const raw = (state.positions.lastRows || []).find(item => api.getId(item) === positionId);
        if (!raw) return;
        const p = normalizePosition(raw);
        const metrics = computePositionMetrics(p);
        const modal = document.getElementById("positionDetailModal");
        const body = document.getElementById("positionDetailBody");
        if (!modal || !body) return;

        const rows = [
            ["Position ID", p.id],
            ["User", `${p.user} (${p.email || p.userId})`],
            ["Market", titleCase(p.market)],
            ["Symbol / Ticker", `${p.symbol} / ${p.tickerSymbol || p.symbol}`],
            ["Side", p.sideLabel],
            ["Open Action", positionOpenAction(p.side)],
            ["Close Action", positionCloseAction(p.side)],
            ["Status", titleCase(p.status)],
            ["Quantity", compactNumber(p.qty)],
            ["Leverage", p.leverage],
            [`Entry / ${positionOpenAction(p.side)} Price`, ui.money(p.entry)],
            ["Current Live Mark Price", ui.money(metrics.livePrice)],
            [`Exit / ${positionCloseAction(p.side)} Price`, p.exitPrice > 0 ? ui.money(p.exitPrice) : "Not closed"],
            ["Margin Locked", ui.money(p.margin)],
            ["Notional Value", ui.money(p.notional)],
            ["Liquidation Price", p.liquidation > 0 ? ui.money(p.liquidation) : "-"],
            ["P&L", ui.money(metrics.pnl)],
            ["ROI", `${metrics.roi.toFixed(2)}%`],
            ["Risk", titleCase(p.risk)],
            ["Opened At", p.openedAt],
            ["Updated / Closed", p.isClosed ? p.closedAt : p.updatedAt],
        ];

        body.innerHTML = rows.map(([label, val]) => `
            <div class="position-detail-item">
                <span>${api.escapeHtml(label)}</span>
                <strong>${api.escapeHtml(String(val ?? "-"))}</strong>
            </div>
        `).join("");
        modal.classList.add("open");
    }

    function closePositionDetailModal() {
        document.getElementById("positionDetailModal")?.classList.remove("open");
    }

    function updatePositionLiveValues() {
        if (document.body.dataset.adminPage !== "positions") return;
        renderPositionLiveTotals(state.positions.lastRows || []);
        (state.positions.lastRows || []).forEach(raw => {
            const p = normalizePosition(raw);
            const metrics = computePositionMetrics(p);
            const priceEl = document.querySelector(`[data-live-position-id="${CSS.escape(String(p.id))}"]`);
            if (priceEl) priceEl.textContent = ui.money(metrics.livePrice);
            const pnlEl = document.querySelector(`[data-position-pnl="${CSS.escape(String(p.id))}"]`);
            if (pnlEl) {
                pnlEl.textContent = ui.money(metrics.pnl);
                pnlEl.className = `font-black ${pnlClass(metrics.pnl)}`;
                pnlEl.setAttribute("data-position-pnl", p.id);
            }
            const roiEl = document.querySelector(`[data-position-roi="${CSS.escape(String(p.id))}"]`);
            if (roiEl) {
                roiEl.textContent = `${metrics.roi.toFixed(2)}%`;
                roiEl.className = `text-xs font-black ${pnlClass(metrics.roi)}`;
                roiEl.setAttribute("data-position-roi", p.id);
            }
        });
    }

    function schedulePositionRender() {
        if (state.positionRenderTimer) return;
        state.positionRenderTimer = setTimeout(() => {
            state.positionRenderTimer = null;
            updatePositionLiveValues();
        }, 450);
    }

    function setPositionLiveStatus(message) {
        text("positionsLiveStatus", message);
    }

    function activePositionSymbols(rows) {
        const symbols = [];
        (rows || []).forEach(raw => {
            const p = normalizePosition(raw);
            if (!p.isClosed && String(p.market || "").toLowerCase().includes("future") && p.tickerSymbol && !symbols.includes(p.tickerSymbol)) symbols.push(p.tickerSymbol);
        });
        return symbols.slice(0, 80);
    }

    async function fetchPositionRestPrices(symbols) {
        if (!symbols.length) return;
        try {
            const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`, { cache: "no-store" });
            const payload = await response.json();
            const list = Array.isArray(payload) ? payload : [payload];
            list.forEach(item => {
                const symbol = normalizeTickerSymbol(item.symbol);
                const price = api.number(item.price);
                if (symbol && price > 0) state.positionPrices[symbol] = price;
            });
            setPositionLiveStatus(`Live mark: REST fallback ${symbols.length}/${symbols.length}`);
            schedulePositionRender();
        } catch (error) {
            setPositionLiveStatus("Live mark: backend value");
        }
    }

    function startPositionLiveFeed(rows) {
        const symbols = activePositionSymbols(rows);
        state.positionSymbols = symbols;

        if (state.positionPriceSocket) {
            try { state.positionPriceSocket.close(); } catch (error) {}
            state.positionPriceSocket = null;
        }
        if (state.positionRestTimer) {
            clearInterval(state.positionRestTimer);
            state.positionRestTimer = null;
        }

        if (!symbols.length) {
            setPositionLiveStatus("Live mark: no open positions");
            return;
        }

        setPositionLiveStatus(`Live mark: connecting ${symbols.length}`);
        fetchPositionRestPrices(symbols);
        state.positionRestTimer = setInterval(() => fetchPositionRestPrices(state.positionSymbols), 2000);

        try {
            const streams = symbols.map(symbol => `${symbol.toLowerCase()}@aggTrade`).join("/");
            const socket = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);
            state.positionPriceSocket = socket;
            socket.onopen = () => setPositionLiveStatus(`Live mark: fast tick ${symbols.length}/${symbols.length}`);
            socket.onmessage = event => {
                try {
                    const message = JSON.parse(event.data || "{}");
                    const data = message.data || message;
                    const symbol = normalizeTickerSymbol(data.s);
                    const price = api.number(data.p || data.c || data.price);
                    if (symbol && price > 0) {
                        state.positionPrices[symbol] = price;
                        schedulePositionRender();
                    }
                } catch (error) {}
            };
            socket.onerror = () => setPositionLiveStatus("Live mark: REST fallback");
            socket.onclose = () => {
                if (document.body.dataset.adminPage === "positions" && state.positionSymbols.length) {
                    setPositionLiveStatus("Live mark: REST fallback");
                }
            };
        } catch (error) {
            setPositionLiveStatus("Live mark: REST fallback");
        }
    }

    function toCsv(rows, type) {
        const formatted = rows.map(row => type === "orders" ? normalizeOrder(row) : normalizePosition(row));
        const header = type === "orders"
            ? ["id", "user", "email", "market", "symbol", "entrySide", "exitSide", "type", "qty", "leverageLabel", "entryPrice", "exitPrice", "margin", "notional", "pnl", "statusGroup", "createdAt", "updatedAt"]
            : ["id", "user", "email", "symbol", "tickerSymbol", "market", "sideLabel", "qty", "margin", "notional", "leverage", "entry", "mark", "exitPrice", "liquidation", "pnl", "roi", "risk", "status", "openedAt", "updatedAt", "closedAt"];
        const lines = [header.join(",")];
        formatted.forEach(item => {
            lines.push(header.map(key => `"${String(item[key] ?? "").replace(/"/g, '""')}"`).join(","));
        });
        return lines.join("\n");
    }

    function downloadCsv(type) {
        const rows = state[type].lastRows || [];
        if (!rows.length) {
            ui.toast("Nothing to export", "No rows found for current filters.", "warning");
            return;
        }
        const csv = toCsv(rows, type);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `traidiumx-admin-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        ui.toast("Export Ready", `${rows.length} rows exported from current page.`, "success");
    }

    async function loadOrders() {
        const ordersBody = document.getElementById("ordersTableBody");
        if (!ordersBody) return;
        api.setLoading(ordersBody, 13);
        setButtonLoading(document.getElementById("ordersRefreshBtn"), true, "Refreshing...");
        try {
            const data = await api.request("/trading/orders", { params: orderParams() });
            state.orders.lastRows = data.orders || [];
            state.orders.pagination = paginationMeta(data.pagination, "orders");
            renderOrderSummary(data.summary || {});
            renderOrders(state.orders.lastRows);
            renderPagination("orders", state.orders.pagination);
        } catch (error) {
            api.showError(error, "Orders failed.");
            renderOrders([]);
        } finally {
            setButtonLoading(document.getElementById("ordersRefreshBtn"), false);
        }
    }

    async function loadPositions() {
        const positionsBody = document.getElementById("positionsTableBody");
        if (!positionsBody) return;
        api.setLoading(positionsBody, 12);
        setButtonLoading(document.getElementById("positionsRefreshBtn"), true, "Refreshing...");
        try {
            const data = await api.request("/trading/positions", { params: positionParams() });
            state.positions.lastRows = data.positions || [];
            state.positions.pagination = paginationMeta(data.pagination, "positions");
            renderPositionSummary(data.summary || {});
            renderPositions(state.positions.lastRows);
            renderPagination("positions", state.positions.pagination);
            startPositionLiveFeed(state.positions.lastRows);
        } catch (error) {
            api.showError(error, "Positions failed.");
            renderPositions([]);
        } finally {
            setButtonLoading(document.getElementById("positionsRefreshBtn"), false);
        }
    }

    function bindOrders() {
        document.getElementById("ordersFilterForm")?.addEventListener("submit", (event) => {
            event.preventDefault();
            state.orders.page = 1;
            loadOrders();
        });
        document.getElementById("ordersRefreshBtn")?.addEventListener("click", (event) => {
            event.preventDefault();
            loadOrders();
        });
        document.getElementById("ordersExportBtn")?.addEventListener("click", () => downloadCsv("orders"));
        document.getElementById("ordersResetBtn")?.addEventListener("click", (event) => {
            event.preventDefault();
            document.getElementById("ordersFilterForm")?.reset();
            state.orders.limit = Number(document.getElementById("ordersLimit")?.value || 25);
            state.orders.page = 1;
            loadOrders();
        });
        document.getElementById("ordersLimit")?.addEventListener("change", (event) => {
            state.orders.limit = Number(event.target.value || 25);
            state.orders.page = 1;
            loadOrders();
        });
        document.getElementById("ordersPrevBtn")?.addEventListener("click", () => {
            if (state.orders.pagination?.has_prev) {
                state.orders.page -= 1;
                loadOrders();
            }
        });
        document.getElementById("ordersNextBtn")?.addEventListener("click", () => {
            if (state.orders.pagination?.has_next) {
                state.orders.page += 1;
                loadOrders();
            }
        });
    }

    function bindPositions() {
        document.getElementById("positionsFilterForm")?.addEventListener("submit", (event) => {
            event.preventDefault();
            state.positions.page = 1;
            state.positions.limit = Number(document.getElementById("positionsLimit")?.value || state.positions.limit || 25);
            loadPositions();
        });
        document.getElementById("positionsResetBtn")?.addEventListener("click", (event) => {
            event.preventDefault();
            ["positionsSearch", "positionsSymbol", "positionsDateFrom", "positionsDateTo"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
            const status = document.getElementById("positionsStatus");
            const side = document.getElementById("positionsSide");
            const risk = document.getElementById("positionsRisk");
            const market = document.getElementById("positionsMarket");
            const limit = document.getElementById("positionsLimit");
            if (status) status.value = "all";
            if (side) side.value = "all";
            if (risk) risk.value = "all";
            if (market) market.value = "all";
            if (limit) limit.value = "25";
            state.positions.limit = 25;
            state.positions.page = 1;
            loadPositions();
        });
        document.getElementById("positionsRefreshBtn")?.addEventListener("click", (event) => {
            event.preventDefault();
            state.positions.page = 1;
            state.positions.limit = Number(document.getElementById("positionsLimit")?.value || state.positions.limit || 25);
            loadPositions();
        });
        document.getElementById("positionsExportBtn")?.addEventListener("click", () => downloadCsv("positions"));
        document.getElementById("positionsLimit")?.addEventListener("change", (event) => {
            state.positions.limit = Number(event.target.value || 25);
            state.positions.page = 1;
            loadPositions();
        });
        document.getElementById("positionsPrevBtn")?.addEventListener("click", () => {
            if (state.positions.pagination?.has_prev) {
                state.positions.page -= 1;
                loadPositions();
            }
        });
        document.getElementById("positionsNextBtn")?.addEventListener("click", () => {
            if (state.positions.pagination?.has_next) {
                state.positions.page += 1;
                loadPositions();
            }
        });
        document.getElementById("positionDetailClose")?.addEventListener("click", closePositionDetailModal);
        document.getElementById("positionDetailModal")?.addEventListener("click", (event) => {
            if (event.target.id === "positionDetailModal") closePositionDetailModal();
        });
    }

    document.addEventListener("click", async (event) => {
        const detailButton = event.target.closest("[data-position-detail]");
        if (detailButton) {
            renderPositionDetail(detailButton.dataset.positionDetail || "");
            return;
        }

        const copyButton = event.target.closest("[data-copy]");
        if (!copyButton) return;
        await navigator.clipboard?.writeText(copyButton.dataset.copy || "");
        ui.toast("Copied", "Value copied to clipboard.", "success");
    });

    window.addEventListener("beforeunload", () => {
        if (state.positionPriceSocket) {
            try { state.positionPriceSocket.close(); } catch (error) {}
        }
        if (state.positionRestTimer) clearInterval(state.positionRestTimer);
    });

    if (pageName === "orders") {
        bindOrders();
        await loadOrders();
    }

    if (pageName === "positions") {
        bindPositions();
        const status = document.getElementById("positionsStatus");
        if (status && !status.value) status.value = "all";
        await loadPositions();
    }
});
