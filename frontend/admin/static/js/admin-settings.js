"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const ui = window.TXAdmin;
    const api = window.TXAdminApi;

    if (!api || !api.requireAuth()) return;

    const form = document.getElementById("settingsForm");

    const fields = {
        platform_status: document.getElementById("platformStatus"),
        maintenance_message: document.getElementById("maintenanceMessage"),
        allow_new_registrations: document.getElementById("allowNewRegistrations"),
        require_email_verification: document.getElementById("requireEmailVerification"),

        platform_selection_enabled: document.getElementById("platformSelectionEnabled"),
        traidiumx_platform_enabled: document.getElementById("traidiumxPlatformEnabled"),
        mt5_platform_enabled: document.getElementById("mt5PlatformEnabled"),
        auto_restore_preferred_plan: document.getElementById("autoRestorePreferredPlan"),
        basic_plan_spread_type: document.getElementById("basicPlanSpreadType"),
        basic_plan_spread_value: document.getElementById("basicPlanSpreadValue"),
        basic_plan_minimum_balance: document.getElementById("basicPlanMinimumBalance"),
        standard_plan_spread_type: document.getElementById("standardPlanSpreadType"),
        standard_plan_spread_value: document.getElementById("standardPlanSpreadValue"),
        standard_plan_minimum_balance: document.getElementById("standardPlanMinimumBalance"),
        advanced_plan_spread_type: document.getElementById("advancedPlanSpreadType"),
        advanced_plan_spread_value: document.getElementById("advancedPlanSpreadValue"),
        advanced_plan_minimum_balance: document.getElementById("advancedPlanMinimumBalance"),

        default_max_leverage: document.getElementById("defaultMaxLeverage"),
        min_order_notional: document.getElementById("minOrderNotional"),
        max_order_notional: document.getElementById("maxOrderNotional"),
        enable_futures_trading: document.getElementById("enableFuturesTrading"),
        enable_options_trading: document.getElementById("enableOptionsTrading"),
        enable_auto_liquidation: document.getElementById("enableAutoLiquidation"),

        withdrawal_review_limit: document.getElementById("withdrawalReviewLimit"),
        daily_withdrawal_limit: document.getElementById("dailyWithdrawalLimit"),
        kyc_manual_review_score: document.getElementById("kycManualReviewScore"),
        require_kyc_for_withdrawals: document.getElementById("requireKycForWithdrawals"),
        auto_approve_low_risk_kyc: document.getElementById("autoApproveLowRiskKyc"),
        pause_withdrawals: document.getElementById("pauseWithdrawals"),

        enable_platform_charge: document.getElementById("enablePlatformCharge"),
        platform_charge_type: document.getElementById("platformChargeType"),
        platform_charge_value: document.getElementById("platformChargeValue"),
        platform_charge_min: document.getElementById("platformChargeMin"),
        platform_charge_max: document.getElementById("platformChargeMax"),
        platform_charge_apply_futures: document.getElementById("platformChargeApplyFutures"),
        platform_charge_apply_options: document.getElementById("platformChargeApplyOptions"),

        enable_account_platform_fee: document.getElementById("enableAccountPlatformFee"),
        account_platform_fee_type: document.getElementById("accountPlatformFeeType"),
        account_platform_fee_value: document.getElementById("accountPlatformFeeValue"),
        account_platform_fee_min: document.getElementById("accountPlatformFeeMin"),
        account_platform_fee_max: document.getElementById("accountPlatformFeeMax"),
        account_platform_fee_cycle: document.getElementById("accountPlatformFeeCycle"),

        enable_withdrawal_fee: document.getElementById("enableWithdrawalFee"),
        withdrawal_fee_type: document.getElementById("withdrawalFeeType"),
        withdrawal_fee_value: document.getElementById("withdrawalFeeValue"),
        withdrawal_fee_min: document.getElementById("withdrawalFeeMin"),
        withdrawal_fee_max: document.getElementById("withdrawalFeeMax"),
        withdrawal_fee_trc20: document.getElementById("withdrawalFeeTrc20"),
        withdrawal_fee_bep20: document.getElementById("withdrawalFeeBep20"),
        withdrawal_fee_erc20: document.getElementById("withdrawalFeeErc20"),

        crypto_deposit_usdt_trc20_address: document.getElementById("cryptoDepositTrc20Address"),
        crypto_deposit_usdt_erc20_address: document.getElementById("cryptoDepositErc20Address"),
        crypto_deposit_usdt_bep20_address: document.getElementById("cryptoDepositBep20Address"),
        crypto_deposit_btc_address: document.getElementById("cryptoDepositBtcAddress"),
        crypto_deposit_sol_address: document.getElementById("cryptoDepositSolAddress"),
        crypto_deposit_xrp_address: document.getElementById("cryptoDepositXrpAddress"),
        crypto_deposit_ada_address: document.getElementById("cryptoDepositAdaAddress"),
        crypto_deposit_eth_address: document.getElementById("cryptoDepositEthAddress"),
        crypto_deposit_usdc_address: document.getElementById("cryptoDepositUsdcAddress"),
        crypto_deposit_bnb_address: document.getElementById("cryptoDepositBnbAddress"),
        crypto_deposit_min_usdt: document.getElementById("cryptoDepositMinUsdt"),
        crypto_deposit_max_usdt: document.getElementById("cryptoDepositMaxUsdt"),
        min_main_wallet_balance: document.getElementById("minMainWalletBalance"),
        usdt_inr_rate: document.getElementById("usdtInrRate"),
        inr_deposit_upi_id: document.getElementById("inrDepositUpiId"),
        inr_deposit_account_name: document.getElementById("inrDepositAccountName"),
        inr_deposit_bank_name: document.getElementById("inrDepositBankName"),
        inr_deposit_account_number: document.getElementById("inrDepositAccountNumber"),
        inr_deposit_ifsc_code: document.getElementById("inrDepositIfscCode"),
        razorpay_key_id: document.getElementById("razorpayKeyId"),
        razorpay_key_secret: document.getElementById("razorpayKeySecret"),
        razorpay_webhook_secret: document.getElementById("razorpayWebhookSecret"),



        admin_session_timeout: document.getElementById("adminSessionTimeout"),
        max_failed_login_attempts: document.getElementById("maxFailedLoginAttempts"),
        admin_ip_allowlist: document.getElementById("adminIpAllowlist"),
        require_admin_2fa: document.getElementById("requireAdmin2fa"),
        enable_audit_logging: document.getElementById("enableAuditLogging"),

        binance_api_key: document.getElementById("binanceApiKey"),
        binance_secret_key: document.getElementById("binanceSecretKey"),
        binance_is_testnet: document.getElementById("binanceIsTestnet"),

        rate_override_btc: document.getElementById("rateOverrideBtc"),
        rate_override_eth: document.getElementById("rateOverrideEth"),
        rate_override_sol: document.getElementById("rateOverrideSol"),
        rate_override_ada: document.getElementById("rateOverrideAda"),
        rate_override_xrp: document.getElementById("rateOverrideXrp"),
        rate_override_bnb: document.getElementById("rateOverrideBnb"),
        rate_override_usdc: document.getElementById("rateOverrideUsdc"),
    };

    let isSaving = false;
    let isLoading = false;
    let isResetting = false;

    const DEFAULT_SETTINGS = {
        platform_status: "trading_enabled",
        maintenance_message: "System running normally.",

        allow_new_registrations: true,
        require_email_verification: true,

        platform_selection_enabled: true,
        traidiumx_platform_enabled: true,
        mt5_platform_enabled: true,
        auto_restore_preferred_plan: true,
        basic_plan_spread_type: "fixed",
        basic_plan_spread_value: 18,
        basic_plan_minimum_balance: 0,
        standard_plan_spread_type: "fixed",
        standard_plan_spread_value: 12,
        standard_plan_minimum_balance: 2000,
        advanced_plan_spread_type: "fixed",
        advanced_plan_spread_value: 5,
        advanced_plan_minimum_balance: 5000,

        default_max_leverage: 20,
        min_order_notional: 10,
        max_order_notional: 10000,

        enable_futures_trading: true,
        enable_options_trading: true,
        enable_auto_liquidation: true,

        withdrawal_review_limit: 10000,
        daily_withdrawal_limit: 50000,
        kyc_manual_review_score: 70,

        require_kyc_for_withdrawals: true,
        auto_approve_low_risk_kyc: false,
        pause_withdrawals: false,

        enable_platform_charge: false,
        platform_charge_type: "percentage",
        platform_charge_value: 0,
        platform_charge_min: 0,
        platform_charge_max: 0,
        platform_charge_apply_futures: true,
        platform_charge_apply_options: true,

        enable_account_platform_fee: false,
        account_platform_fee_type: "fixed",
        account_platform_fee_value: 0,
        account_platform_fee_min: 0,
        account_platform_fee_max: 0,
        account_platform_fee_cycle: "one_time",

        enable_withdrawal_fee: false,
        withdrawal_fee_type: "fixed",
        withdrawal_fee_value: 0,
        withdrawal_fee_min: 0,
        withdrawal_fee_max: 0,
        withdrawal_fee_trc20: 0,
        withdrawal_fee_bep20: 0,
        withdrawal_fee_erc20: 0,

        crypto_deposit_usdt_trc20_address: "TQp9K7vY3Wm2N8rF4cL6Xh5A1BzDgE2sRZ",
        crypto_deposit_usdt_erc20_address: "0x8A4b2C5D7e9F0a1B3c4D6E8F901234567890AbCd",
        crypto_deposit_usdt_bep20_address: "0xB2C7e9F1A4d6E8b0C3f5A7D9e1B234567890cDEF",
        crypto_deposit_min_usdt: 10,
        crypto_deposit_max_usdt: 1000000,
        min_main_wallet_balance: 0,

        admin_session_timeout: 30,
        max_failed_login_attempts: 5,
        admin_ip_allowlist: "",

        require_admin_2fa: true,
        enable_audit_logging: true,

        binance_api_key: "",
        binance_secret_key: "",
        binance_is_testnet: true,
    };

    function injectConfirmModalStyles() {
        if (document.getElementById("txConfirmModalStyles")) return;

        const style = document.createElement("style");
        style.id = "txConfirmModalStyles";
        style.textContent = `
            .tx-confirm-backdrop {
                position: fixed;
                inset: 0;
                z-index: 99999;
                background: rgba(2, 6, 23, 0.74);
                backdrop-filter: blur(10px);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 18px;
            }

            .tx-confirm-card {
                width: min(470px, 100%);
                background: linear-gradient(180deg, #111827, #070b16);
                border: 1px solid rgba(148, 163, 184, 0.22);
                box-shadow: 0 28px 90px rgba(0, 0, 0, 0.60);
                border-radius: 24px;
                padding: 26px;
                color: #e5e7eb;
                animation: txConfirmPop 0.18s ease-out;
            }

            .tx-confirm-icon {
                width: 54px;
                height: 54px;
                border-radius: 18px;
                display: grid;
                place-items: center;
                font-size: 26px;
                font-weight: 900;
                color: #67e8f9;
                background: rgba(34, 211, 238, 0.12);
                border: 1px solid rgba(34, 211, 238, 0.25);
                margin-bottom: 16px;
            }

            .tx-confirm-icon.danger {
                color: #fca5a5;
                background: rgba(239, 68, 68, 0.12);
                border-color: rgba(239, 68, 68, 0.28);
            }

            .tx-confirm-content h3 {
                margin: 0 0 8px;
                font-size: 22px;
                font-weight: 900;
                letter-spacing: -0.03em;
            }

            .tx-confirm-content p {
                margin: 0;
                color: #94a3b8;
                line-height: 1.55;
                font-size: 14px;
            }

            .tx-confirm-actions {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                margin-top: 24px;
            }

            .tx-confirm-btn {
                border: 0;
                border-radius: 14px;
                padding: 12px 18px;
                font-weight: 800;
                cursor: pointer;
                transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
            }

            .tx-confirm-btn:hover {
                transform: translateY(-1px);
            }

            .tx-confirm-btn.cancel {
                background: rgba(148, 163, 184, 0.12);
                color: #cbd5e1;
                border: 1px solid rgba(148, 163, 184, 0.18);
            }

            .tx-confirm-btn.confirm {
                background: linear-gradient(135deg, #22d3ee, #818cf8);
                color: #020617;
                box-shadow: 0 14px 30px rgba(34, 211, 238, 0.18);
            }

            .tx-confirm-btn.confirm.danger {
                background: linear-gradient(135deg, #fb7185, #f97316);
                color: #fff;
                box-shadow: 0 14px 30px rgba(251, 113, 133, 0.18);
            }

            @keyframes txConfirmPop {
                from {
                    opacity: 0;
                    transform: translateY(12px) scale(0.96);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            @media (max-width: 520px) {
                .tx-confirm-card {
                    padding: 22px;
                    border-radius: 20px;
                }

                .tx-confirm-actions {
                    flex-direction: column-reverse;
                }

                .tx-confirm-btn {
                    width: 100%;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function showConfirmModal({
        title,
        message,
        confirmText = "Confirm",
        cancelText = "Cancel",
        danger = false,
    }) {
        injectConfirmModalStyles();

        return new Promise((resolve) => {
            const oldModal = document.getElementById("txConfirmModal");
            if (oldModal) oldModal.remove();

            const modal = document.createElement("div");
            modal.id = "txConfirmModal";

            modal.innerHTML = `
                <div class="tx-confirm-backdrop">
                    <div class="tx-confirm-card" role="dialog" aria-modal="true">
                        <div class="tx-confirm-icon ${danger ? "danger" : ""}">
                            ${danger ? "!" : "?"}
                        </div>

                        <div class="tx-confirm-content">
                            <h3>${title}</h3>
                            <p>${message}</p>
                        </div>

                        <div class="tx-confirm-actions">
                            <button type="button" class="tx-confirm-btn cancel" id="txConfirmCancel">
                                ${cancelText}
                            </button>
                            <button type="button" class="tx-confirm-btn confirm ${danger ? "danger" : ""}" id="txConfirmOk">
                                ${confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const close = (value) => {
                modal.remove();
                document.removeEventListener("keydown", escHandler);
                resolve(value);
            };

            function escHandler(event) {
                if (event.key === "Escape") {
                    close(false);
                }
            }

            document.addEventListener("keydown", escHandler);

            modal.querySelector("#txConfirmCancel")?.addEventListener("click", () => close(false));
            modal.querySelector("#txConfirmOk")?.addEventListener("click", () => close(true));

            modal.querySelector(".tx-confirm-backdrop")?.addEventListener("click", (event) => {
                if (event.target.classList.contains("tx-confirm-backdrop")) {
                    close(false);
                }
            });
        });
    }

    function normalizeResponse(response) {
        if (!response) return {};
        if (response.data && typeof response.data === "object") return response.data;
        return response;
    }

    function normalizeSettings(data) {
        return {
            ...DEFAULT_SETTINGS,
            ...(data || {}),
        };
    }

    function platformLabel(value) {
        const map = {
            trading_enabled: "Trading Enabled",
            maintenance_mode: "Maintenance Mode",
            withdrawals_paused: "Withdrawals Paused",
            trading_paused: "Trading Paused",

            "Trading Enabled": "Trading Enabled",
            "Maintenance Mode": "Maintenance Mode",
            "Withdrawals Paused": "Withdrawals Paused",
            "Trading Paused": "Trading Paused",
        };

        return map[value] || "Trading Enabled";
    }

    function normalizePlatformValue(value) {
        const map = {
            "Trading Enabled": "trading_enabled",
            "Maintenance Mode": "maintenance_mode",
            "Withdrawals Paused": "withdrawals_paused",
            "Trading Paused": "trading_paused",

            trading_enabled: "trading_enabled",
            maintenance_mode: "maintenance_mode",
            withdrawals_paused: "withdrawals_paused",
            trading_paused: "trading_paused",
        };

        return map[value] || "trading_enabled";
    }

    function setVal(el, value, isCheckbox = false) {
        if (!el) return;

        if (isCheckbox) {
            el.checked = Boolean(value);
            return;
        }

        el.value = value ?? "";
    }

    function setSelectValue(el, value) {
        if (!el) return;

        const normalized = normalizePlatformValue(value);
        el.value = normalized;

        if (el.value !== normalized) {
            el.value = platformLabel(value);
        }
    }

    function getVal(el, isCheckbox = false) {
        if (!el) return isCheckbox ? false : "";

        if (isCheckbox) {
            return Boolean(el.checked);
        }

        return el.value;
    }

    function numberValue(el) {
        const value = Number(getVal(el));
        return Number.isFinite(value) ? value : 0;
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function updateCards(data) {
        setText("settingsPlatformStatus", platformLabel(data.platform_status));
        setText("settingsMaxLeverage", `${Number(data.default_max_leverage || 0)}x`);
        setText("settingsWithdrawalLimit", `$${Number(data.withdrawal_review_limit || 0)}`);
        setText("settingsKycScore", Number(data.kyc_manual_review_score || 0));
    }

    function fillForm(rawData) {
        const data = normalizeSettings(rawData);

        setSelectValue(fields.platform_status, data.platform_status);
        setVal(fields.maintenance_message, data.maintenance_message);

        setVal(fields.allow_new_registrations, data.allow_new_registrations, true);
        setVal(fields.require_email_verification, data.require_email_verification, true);

        setVal(fields.platform_selection_enabled, data.platform_selection_enabled, true);
        setVal(fields.traidiumx_platform_enabled, data.traidiumx_platform_enabled, true);
        setVal(fields.mt5_platform_enabled, data.mt5_platform_enabled, true);
        setVal(fields.auto_restore_preferred_plan, data.auto_restore_preferred_plan, true);
        setVal(fields.basic_plan_spread_type, data.basic_plan_spread_type || "fixed");
        setVal(fields.basic_plan_spread_value, data.basic_plan_spread_value);
        setVal(fields.basic_plan_minimum_balance, data.basic_plan_minimum_balance);
        setVal(fields.standard_plan_spread_type, data.standard_plan_spread_type || "fixed");
        setVal(fields.standard_plan_spread_value, data.standard_plan_spread_value);
        setVal(fields.standard_plan_minimum_balance, data.standard_plan_minimum_balance);
        setVal(fields.advanced_plan_spread_type, data.advanced_plan_spread_type || "fixed");
        setVal(fields.advanced_plan_spread_value, data.advanced_plan_spread_value);
        setVal(fields.advanced_plan_minimum_balance, data.advanced_plan_minimum_balance);

        setVal(fields.default_max_leverage, data.default_max_leverage);
        setVal(fields.min_order_notional, data.min_order_notional);
        setVal(fields.max_order_notional, data.max_order_notional);

        setVal(fields.enable_futures_trading, data.enable_futures_trading, true);
        setVal(fields.enable_options_trading, data.enable_options_trading, true);
        setVal(fields.enable_auto_liquidation, data.enable_auto_liquidation, true);

        setVal(fields.withdrawal_review_limit, data.withdrawal_review_limit);
        setVal(fields.daily_withdrawal_limit, data.daily_withdrawal_limit);
        setVal(fields.kyc_manual_review_score, data.kyc_manual_review_score);

        setVal(fields.require_kyc_for_withdrawals, data.require_kyc_for_withdrawals, true);
        setVal(fields.auto_approve_low_risk_kyc, data.auto_approve_low_risk_kyc, true);
        setVal(fields.pause_withdrawals, data.pause_withdrawals, true);

        setVal(fields.enable_platform_charge, data.enable_platform_charge, true);
        setVal(fields.platform_charge_type, data.platform_charge_type);
        setVal(fields.platform_charge_value, data.platform_charge_value);
        setVal(fields.platform_charge_min, data.platform_charge_min);
        setVal(fields.platform_charge_max, data.platform_charge_max);
        setVal(fields.platform_charge_apply_futures, data.platform_charge_apply_futures, true);
        setVal(fields.platform_charge_apply_options, data.platform_charge_apply_options, true);

        setVal(fields.enable_account_platform_fee, data.enable_account_platform_fee, true);
        setVal(fields.account_platform_fee_type, "fixed");
        setVal(fields.account_platform_fee_value, data.account_platform_fee_value);
        setVal(fields.account_platform_fee_min, data.account_platform_fee_min);
        setVal(fields.account_platform_fee_max, data.account_platform_fee_max);
        setVal(fields.account_platform_fee_cycle, data.account_platform_fee_cycle || "one_time");

        setVal(fields.enable_withdrawal_fee, data.enable_withdrawal_fee, true);
        setVal(fields.withdrawal_fee_type, data.withdrawal_fee_type);
        setVal(fields.withdrawal_fee_value, data.withdrawal_fee_value);
        setVal(fields.withdrawal_fee_min, data.withdrawal_fee_min);
        setVal(fields.withdrawal_fee_max, data.withdrawal_fee_max);
        setVal(fields.withdrawal_fee_trc20, data.withdrawal_fee_trc20);
        setVal(fields.withdrawal_fee_bep20, data.withdrawal_fee_bep20);
        setVal(fields.withdrawal_fee_erc20, data.withdrawal_fee_erc20);

        setVal(fields.crypto_deposit_usdt_trc20_address, data.crypto_deposit_usdt_trc20_address);
        setVal(fields.crypto_deposit_usdt_erc20_address, data.crypto_deposit_usdt_erc20_address);
        setVal(fields.crypto_deposit_usdt_bep20_address, data.crypto_deposit_usdt_bep20_address);
        setVal(fields.crypto_deposit_btc_address, data.crypto_deposit_btc_address);
        setVal(fields.crypto_deposit_sol_address, data.crypto_deposit_sol_address);
        setVal(fields.crypto_deposit_xrp_address, data.crypto_deposit_xrp_address);
        setVal(fields.crypto_deposit_ada_address, data.crypto_deposit_ada_address);
        setVal(fields.crypto_deposit_eth_address, data.crypto_deposit_eth_address);
        setVal(fields.crypto_deposit_usdc_address, data.crypto_deposit_usdc_address);
        setVal(fields.crypto_deposit_bnb_address, data.crypto_deposit_bnb_address);
        setVal(fields.crypto_deposit_min_usdt, data.crypto_deposit_min_usdt);
        setVal(fields.crypto_deposit_max_usdt, data.crypto_deposit_max_usdt);
        setVal(fields.min_main_wallet_balance, data.min_main_wallet_balance);
        setVal(fields.usdt_inr_rate, data.usdt_inr_rate || 88.50);

        setVal(fields.rate_override_btc, (data.rate_override_btc && data.rate_override_btc > 0) ? data.rate_override_btc : "");
        setVal(fields.rate_override_eth, (data.rate_override_eth && data.rate_override_eth > 0) ? data.rate_override_eth : "");
        setVal(fields.rate_override_sol, (data.rate_override_sol && data.rate_override_sol > 0) ? data.rate_override_sol : "");
        setVal(fields.rate_override_ada, (data.rate_override_ada && data.rate_override_ada > 0) ? data.rate_override_ada : "");
        setVal(fields.rate_override_xrp, (data.rate_override_xrp && data.rate_override_xrp > 0) ? data.rate_override_xrp : "");
        setVal(fields.rate_override_bnb, (data.rate_override_bnb && data.rate_override_bnb > 0) ? data.rate_override_bnb : "");
        setVal(fields.rate_override_usdc, (data.rate_override_usdc && data.rate_override_usdc > 0) ? data.rate_override_usdc : "");
        setVal(fields.inr_deposit_upi_id, data.inr_deposit_upi_id || "traidiumx@upi");
        setVal(fields.inr_deposit_account_name, data.inr_deposit_account_name || "TraidiumX Trading Services Ltd");
        setVal(fields.inr_deposit_bank_name, data.inr_deposit_bank_name || "HDFC Bank");
        setVal(fields.inr_deposit_account_number, data.inr_deposit_account_number || "50100498765432");
        setVal(fields.inr_deposit_ifsc_code, data.inr_deposit_ifsc_code || "HDFC0000128");
        setVal(fields.razorpay_key_id, data.razorpay_key_id || "");
        setVal(fields.razorpay_key_secret, data.razorpay_key_secret || "");
        setVal(fields.razorpay_webhook_secret, data.razorpay_webhook_secret || "");



        setVal(fields.admin_session_timeout, data.admin_session_timeout);
        setVal(fields.max_failed_login_attempts, data.max_failed_login_attempts);
        setVal(fields.admin_ip_allowlist, data.admin_ip_allowlist);

        setVal(fields.require_admin_2fa, data.require_admin_2fa, true);
        setVal(fields.enable_audit_logging, data.enable_audit_logging, true);

        setVal(fields.binance_api_key, data.binance_api_key);
        setVal(fields.binance_secret_key, data.binance_secret_key);
        setVal(fields.binance_is_testnet, data.binance_is_testnet, true);

        updateCards(data);

        if (typeof validateAddressLive === "function") {
            validateAddressLive("cryptoDepositTrc20Address", "TRC20");
            validateAddressLive("cryptoDepositErc20Address", "ERC20");
            validateAddressLive("cryptoDepositBep20Address", "BEP20");
            validateAddressLive("cryptoDepositBtcAddress", "BITCOIN");
            validateAddressLive("cryptoDepositSolAddress", "SOLANA");
            validateAddressLive("cryptoDepositXrpAddress", "RIPPLE");
            validateAddressLive("cryptoDepositAdaAddress", "CARDANO");
            validateAddressLive("cryptoDepositEthAddress", "ERC20");
            validateAddressLive("cryptoDepositUsdcAddress", "ERC20");
            validateAddressLive("cryptoDepositBnbAddress", "BEP20");
        }
    }

    function collectPayload() {
        return {
            platform_status: normalizePlatformValue(getVal(fields.platform_status)),
            maintenance_message: getVal(fields.maintenance_message),

            allow_new_registrations: getVal(fields.allow_new_registrations, true),
            require_email_verification: getVal(fields.require_email_verification, true),

            platform_selection_enabled: getVal(fields.platform_selection_enabled, true),
            traidiumx_platform_enabled: getVal(fields.traidiumx_platform_enabled, true),
            mt5_platform_enabled: getVal(fields.mt5_platform_enabled, true),
            auto_restore_preferred_plan: getVal(fields.auto_restore_preferred_plan, true),
            basic_plan_spread_type: getVal(fields.basic_plan_spread_type) || "fixed",
            basic_plan_spread_value: numberValue(fields.basic_plan_spread_value),
            basic_plan_minimum_balance: numberValue(fields.basic_plan_minimum_balance),
            standard_plan_spread_type: getVal(fields.standard_plan_spread_type) || "fixed",
            standard_plan_spread_value: numberValue(fields.standard_plan_spread_value),
            standard_plan_minimum_balance: numberValue(fields.standard_plan_minimum_balance),
            advanced_plan_spread_type: getVal(fields.advanced_plan_spread_type) || "fixed",
            advanced_plan_spread_value: numberValue(fields.advanced_plan_spread_value),
            advanced_plan_minimum_balance: numberValue(fields.advanced_plan_minimum_balance),

            default_max_leverage: numberValue(fields.default_max_leverage),
            min_order_notional: numberValue(fields.min_order_notional),
            max_order_notional: numberValue(fields.max_order_notional),

            enable_futures_trading: getVal(fields.enable_futures_trading, true),
            enable_options_trading: getVal(fields.enable_options_trading, true),
            enable_auto_liquidation: getVal(fields.enable_auto_liquidation, true),

            withdrawal_review_limit: numberValue(fields.withdrawal_review_limit),
            daily_withdrawal_limit: numberValue(fields.daily_withdrawal_limit),
            kyc_manual_review_score: numberValue(fields.kyc_manual_review_score),

            require_kyc_for_withdrawals: getVal(fields.require_kyc_for_withdrawals, true),
            auto_approve_low_risk_kyc: getVal(fields.auto_approve_low_risk_kyc, true),
            pause_withdrawals: getVal(fields.pause_withdrawals, true),

            enable_platform_charge: getVal(fields.enable_platform_charge, true),
            platform_charge_type: getVal(fields.platform_charge_type) || "percentage",
            platform_charge_value: numberValue(fields.platform_charge_value),
            platform_charge_min: numberValue(fields.platform_charge_min),
            platform_charge_max: numberValue(fields.platform_charge_max),
            platform_charge_apply_futures: getVal(fields.platform_charge_apply_futures, true),
            platform_charge_apply_options: getVal(fields.platform_charge_apply_options, true),

            enable_account_platform_fee: getVal(fields.enable_account_platform_fee, true),
            account_platform_fee_type: "fixed",
            account_platform_fee_value: numberValue(fields.account_platform_fee_value),
            account_platform_fee_min: numberValue(fields.account_platform_fee_min),
            account_platform_fee_max: numberValue(fields.account_platform_fee_max),
            account_platform_fee_cycle: getVal(fields.account_platform_fee_cycle) || "one_time",

            enable_withdrawal_fee: getVal(fields.enable_withdrawal_fee, true),
            withdrawal_fee_type: getVal(fields.withdrawal_fee_type) || "fixed",
            withdrawal_fee_value: numberValue(fields.withdrawal_fee_value),
            withdrawal_fee_min: numberValue(fields.withdrawal_fee_min),
            withdrawal_fee_max: numberValue(fields.withdrawal_fee_max),
            withdrawal_fee_trc20: numberValue(fields.withdrawal_fee_trc20),
            withdrawal_fee_bep20: numberValue(fields.withdrawal_fee_bep20),
            withdrawal_fee_erc20: numberValue(fields.withdrawal_fee_erc20),

            crypto_deposit_usdt_trc20_address: getVal(fields.crypto_deposit_usdt_trc20_address).replace(/\s/g, ""),
            crypto_deposit_usdt_erc20_address: getVal(fields.crypto_deposit_usdt_erc20_address).replace(/\s/g, ""),
            crypto_deposit_usdt_bep20_address: getVal(fields.crypto_deposit_usdt_bep20_address).replace(/\s/g, ""),
            crypto_deposit_btc_address: getVal(fields.crypto_deposit_btc_address).replace(/\s/g, ""),
            crypto_deposit_sol_address: getVal(fields.crypto_deposit_sol_address).replace(/\s/g, ""),
            crypto_deposit_xrp_address: getVal(fields.crypto_deposit_xrp_address).replace(/\s/g, ""),
            crypto_deposit_ada_address: getVal(fields.crypto_deposit_ada_address).replace(/\s/g, ""),
            crypto_deposit_eth_address: getVal(fields.crypto_deposit_eth_address).replace(/\s/g, ""),
            crypto_deposit_usdc_address: getVal(fields.crypto_deposit_usdc_address).replace(/\s/g, ""),
            crypto_deposit_bnb_address: getVal(fields.crypto_deposit_bnb_address).replace(/\s/g, ""),
            crypto_deposit_min_usdt: numberValue(fields.crypto_deposit_min_usdt),
            crypto_deposit_max_usdt: numberValue(fields.crypto_deposit_max_usdt),
            min_main_wallet_balance: numberValue(fields.min_main_wallet_balance),
            usdt_inr_rate: numberValue(fields.usdt_inr_rate),

            rate_override_btc: numberValue(fields.rate_override_btc),
            rate_override_eth: numberValue(fields.rate_override_eth),
            rate_override_sol: numberValue(fields.rate_override_sol),
            rate_override_ada: numberValue(fields.rate_override_ada),
            rate_override_xrp: numberValue(fields.rate_override_xrp),
            rate_override_bnb: numberValue(fields.rate_override_bnb),
            rate_override_usdc: numberValue(fields.rate_override_usdc),
            inr_deposit_upi_id: getVal(fields.inr_deposit_upi_id) || "traidiumx@upi",
            inr_deposit_account_name: getVal(fields.inr_deposit_account_name) || "TraidiumX Trading Services Ltd",
            inr_deposit_bank_name: getVal(fields.inr_deposit_bank_name) || "HDFC Bank",
            inr_deposit_account_number: getVal(fields.inr_deposit_account_number) || "50100498765432",
            inr_deposit_ifsc_code: getVal(fields.inr_deposit_ifsc_code) || "HDFC0000128",
            razorpay_key_id: getVal(fields.razorpay_key_id) || "",
            razorpay_key_secret: getVal(fields.razorpay_key_secret) || "",
            razorpay_webhook_secret: getVal(fields.razorpay_webhook_secret) || "",



            admin_session_timeout: numberValue(fields.admin_session_timeout),
            max_failed_login_attempts: numberValue(fields.max_failed_login_attempts),
            admin_ip_allowlist: getVal(fields.admin_ip_allowlist),

            require_admin_2fa: getVal(fields.require_admin_2fa, true),
            enable_audit_logging: getVal(fields.enable_audit_logging, true),

            binance_api_key: getVal(fields.binance_api_key),
            binance_secret_key: getVal(fields.binance_secret_key),
            binance_is_testnet: getVal(fields.binance_is_testnet, true),
        };
    }

    function setBusy(buttonId, busyText, isBusy) {
        const btn = document.getElementById(buttonId);
        if (!btn) return;

        if (isBusy) {
            if (!btn.dataset.originalHtml) {
                btn.dataset.originalHtml = btn.innerHTML;
            }

            btn.innerHTML = busyText;
            btn.disabled = true;
        } else {
            btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
            btn.disabled = false;
            delete btn.dataset.originalHtml;
        }
    }

    async function loadLiveCryptoPricesForPlaceholders() {
        try {
            const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "XRPUSDT", "BNBUSDT", "USDCUSDT"];
            const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
            if (!res.ok) return;
            const prices = await res.json();
            
            const priceMap = {};
            prices.forEach(item => {
                const asset = item.symbol.replace("USDT", "").toLowerCase();
                priceMap[asset] = parseFloat(item.price);
            });

            const inputs = {
                btc: document.getElementById("rateOverrideBtc"),
                eth: document.getElementById("rateOverrideEth"),
                sol: document.getElementById("rateOverrideSol"),
                ada: document.getElementById("rateOverrideAda"),
                xrp: document.getElementById("rateOverrideXrp"),
                bnb: document.getElementById("rateOverrideBnb"),
                usdc: document.getElementById("rateOverrideUsdc")
            };

            for (const [coin, input] of Object.entries(inputs)) {
                if (input && priceMap[coin]) {
                    const formatted = priceMap[coin] >= 1.0 
                        ? priceMap[coin].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : priceMap[coin].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                    input.placeholder = `Live ($${formatted})`;
                }
            }
        } catch (err) {
            console.error("Failed to load live prices for admin placeholders:", err);
        }
    }

    async function loadSettings(showToast = false) {
        loadLiveCryptoPricesForPlaceholders();
        if (isLoading) return;

        try {
            isLoading = true;
            setBusy("settingsRefreshBtn", "Refreshing...", true);

            const response = await api.request("/settings");
            const data = normalizeResponse(response);

            console.log("SETTINGS LOADED:", data);

            fillForm(data);

            if (showToast) {
                ui?.toast?.("Success", "Settings refreshed successfully.", "success");
            }
        } catch (error) {
            console.error("SETTINGS LOAD ERROR:", error);
            ui?.toast?.("Error", "Settings load failed.", "error");
        } finally {
            isLoading = false;
            setBusy("settingsRefreshBtn", "Refresh", false);
        }
    }

    async function saveSettings() {
        if (isSaving) return;

        try {
            isSaving = true;
            setBusy("settingsSaveBtn", "Saving...", true);
            setBusy("settingsSaveTopBtn", "Saving...", true);

            const payload = collectPayload();

            const trc20 = (payload.crypto_deposit_usdt_trc20_address || "").trim().replace(/\s/g, "");
            const erc20 = (payload.crypto_deposit_usdt_erc20_address || "").trim().replace(/\s/g, "");
            const bep20 = (payload.crypto_deposit_usdt_bep20_address || "").trim().replace(/\s/g, "");

            if (!trc20 || trc20.length !== 34 || !trc20.startsWith("T")) {
                throw new Error("TRC20 USDT Address must be exactly 34 characters and start with 'T'.");
            }
            if (!erc20 || erc20.length !== 42 || !(erc20.toLowerCase().startsWith("0x"))) {
                throw new Error("ERC20 USDT Address must be exactly 42 characters and start with '0x'.");
            }
            if (!bep20 || bep20.length !== 42 || !(bep20.toLowerCase().startsWith("0x"))) {
                throw new Error("BEP20 USDT Address must be exactly 42 characters and start with '0x'.");
            }

            if (!payload.traidiumx_platform_enabled && !payload.mt5_platform_enabled) {
                throw new Error("At least one trading platform must remain enabled.");
            }

            if (payload.basic_plan_minimum_balance > payload.standard_plan_minimum_balance || payload.standard_plan_minimum_balance > payload.advanced_plan_minimum_balance) {
                throw new Error("Plan minimum balances must be ordered Basic ≤ Standard ≤ Advanced.");
            }

            const response = await api.request("/settings", {
                method: "PUT",
                body: payload,
            });

            const saved = normalizeResponse(response);

            console.log("SETTINGS SAVED:", saved);

            fillForm(saved);

            ui?.toast?.("Success", "Settings saved successfully.", "success");
        } catch (error) {
            console.error("SETTINGS SAVE ERROR:", error);
            ui?.toast?.("Error", error.message || "Failed to save settings.", "error");
        } finally {
            isSaving = false;
            setBusy("settingsSaveBtn", "Save Settings", false);
            setBusy("settingsSaveTopBtn", "Save Changes", false);
        }
    }

    async function resetSettings() {
        if (isResetting) return;

        const confirmed = await showConfirmModal({
            title: "Reset Settings?",
            message: "This will restore all settings to default values. Your current settings will be replaced.",
            confirmText: "Yes, Reset",
            cancelText: "Cancel",
            danger: true,
        });

        if (!confirmed) return;

        try {
            isResetting = true;
            setBusy("settingsResetBtn", "Resetting...", true);

            const response = await api.request("/settings/reset", {
                method: "POST",
                body: {},
            });

            const resetData = normalizeResponse(response);

            console.log("SETTINGS RESET:", resetData);

            fillForm(resetData);

            ui?.toast?.("Success", "Settings reset to default successfully.", "success");
        } catch (error) {
            console.error("SETTINGS RESET ERROR:", error);
            ui?.toast?.("Error", "Failed to reset settings.", "error");
        } finally {
            isResetting = false;
            setBusy("settingsResetBtn", "Reset Defaults", false);
        }
    }

    form?.addEventListener("submit", (event) => {
        event.preventDefault();
        saveSettings();
    });

    document.getElementById("settingsSaveBtn")?.addEventListener("click", (event) => {
        event.preventDefault();
        saveSettings();
    });

    document.getElementById("settingsSaveTopBtn")?.addEventListener("click", (event) => {
        event.preventDefault();
        saveSettings();
    });

    document.getElementById("settingsRefreshBtn")?.addEventListener("click", (event) => {
        event.preventDefault();
        loadSettings(true);
    });

    document.getElementById("settingsResetBtn")?.addEventListener("click", (event) => {
        event.preventDefault();
        resetSettings();
    });


    function validateAddressLive(fieldId, networkType) {
        const field = document.getElementById(fieldId);
        const errSpan = document.getElementById(fieldId + "Err");
        if (!field || !errSpan) return;

        const val = String(field.value || "").replace(/\s/g, "");
        if (!val) {
            errSpan.style.display = "none";
            field.classList.remove("border-red-500", "focus:border-red-500");
            return;
        }

        let errMsg = "";
        if (networkType === "TRC20") {
            if (!val.startsWith("T")) {
                errMsg = "TRC20 Address must start with 'T'";
            } else if (val.length !== 34) {
                errMsg = `TRC20 Address must be exactly 34 characters (currently ${val.length})`;
            }
        } else if (networkType === "ERC20" || networkType === "BEP20") {
            if (!val.toLowerCase().startsWith("0x")) {
                errMsg = `${networkType} Address must start with '0x'`;
            } else if (val.length !== 42) {
                errMsg = `${networkType} Address must be exactly 42 characters (currently ${val.length})`;
            }
        } else if (networkType === "BITCOIN") {
            const startsOk = val.startsWith("1") || val.startsWith("3") || val.toLowerCase().startsWith("bc1");
            if (!startsOk) {
                errMsg = "Bitcoin Address must start with '1', '3', or 'bc1'";
            } else if (val.length < 26 || val.length > 90) {
                errMsg = `Bitcoin Address length must be between 26 and 90 characters (currently ${val.length})`;
            }
        } else if (networkType === "SOLANA") {
            const solRegex = /^[1-9A-HJ-NP-Za-km-z]+$/;
            if (!solRegex.test(val)) {
                errMsg = "Solana Address must be a valid Base58 string (no 0, O, I, l)";
            } else if (val.length < 32 || val.length > 44) {
                errMsg = `Solana Address length must be between 32 and 44 characters (currently ${val.length})`;
            }
        } else if (networkType === "RIPPLE") {
            if (!val.startsWith("r")) {
                errMsg = "Ripple Address must start with 'r'";
            } else if (val.length < 25 || val.length > 35) {
                errMsg = `Ripple Address length must be between 25 and 35 characters (currently ${val.length})`;
            }
        } else if (networkType === "CARDANO") {
            const startsOk = val.toLowerCase().startsWith("addr1") || val.startsWith("Ae2") || val.startsWith("Ddz");
            if (!startsOk) {
                errMsg = "Cardano Address must start with 'addr1', 'Ae2', or 'Ddz'";
            } else if (val.length < 25 || val.length > 110) {
                errMsg = `Cardano Address length must be between 25 and 110 characters (currently ${val.length})`;
            }
        }

        if (errMsg) {
            errSpan.textContent = errMsg;
            errSpan.style.display = "block";
            field.classList.add("border-red-500", "focus:border-red-500");
        } else {
            errSpan.style.display = "none";
            field.classList.remove("border-red-500", "focus:border-red-500");
        }
    }

    [
        { field: fields.crypto_deposit_usdt_trc20_address, type: "TRC20", id: "cryptoDepositTrc20Address" },
        { field: fields.crypto_deposit_usdt_erc20_address, type: "ERC20", id: "cryptoDepositErc20Address" },
        { field: fields.crypto_deposit_usdt_bep20_address, type: "BEP20", id: "cryptoDepositBep20Address" },
        { field: fields.crypto_deposit_btc_address, type: "BITCOIN", id: "cryptoDepositBtcAddress" },
        { field: fields.crypto_deposit_sol_address, type: "SOLANA", id: "cryptoDepositSolAddress" },
        { field: fields.crypto_deposit_xrp_address, type: "RIPPLE", id: "cryptoDepositXrpAddress" },
        { field: fields.crypto_deposit_ada_address, type: "CARDANO", id: "cryptoDepositAdaAddress" },
        { field: fields.crypto_deposit_eth_address, type: "ERC20", id: "cryptoDepositEthAddress" },
        { field: fields.crypto_deposit_usdc_address, type: "ERC20", id: "cryptoDepositUsdcAddress" },
        { field: fields.crypto_deposit_bnb_address, type: "BEP20", id: "cryptoDepositBnbAddress" },
    ].forEach(({ field, type, id }) => {
        if (!field) return;

        const validate = () => validateAddressLive(id, type);

        field.addEventListener("input", () => {
            field.value = String(field.value || "").replace(/\s/g, "").slice(0, 140);
            validate();
        });

        field.addEventListener("blur", validate);
    });

    await loadSettings(false);

    // Fetch and update live placeholders in real-time every 10 seconds
    const pricePlaceholderInterval = setInterval(() => {
        // If settings inputs are no longer in the DOM (page changed), clear the interval
        if (!document.getElementById("rateOverrideBtc")) {
            clearInterval(pricePlaceholderInterval);
            return;
        }
        loadLiveCryptoPricesForPlaceholders();
    }, 10000);
});