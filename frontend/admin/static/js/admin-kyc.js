"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const ui = window.TXAdmin;
    const api = window.TXAdminApi;
    if (!ui || !api || !api.requireAuth()) return;

    const body = document.getElementById("kycTableBody");
    if (!body) return;

    const state = {
        rows: [],
        page: 1,
        limit: 25,
        status: "all",
        search: "",
        pendingReview: null,
        currentDetail: null,
    };

    const els = {
        statusFilter: document.getElementById("kycStatusFilter"),
        searchInput: document.getElementById("kycSearchInput"),
        refreshBtn: document.getElementById("kycRefreshBtn"),
        pagination: document.getElementById("kycPagination"),
        total: document.getElementById("kycTotalCount"),
        pending: document.getElementById("kycPendingCount"),
        approved: document.getElementById("kycApprovedCount"),
        rejected: document.getElementById("kycRejectedCount"),
    };

    function normalizeStatus(status) {
        return String(status || "pending").toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
    }

    function labelStatus(status) {
        const map = {
            pending: "Pending Review",
            under_review: "Under Review",
            review: "Under Review",
            approved: "Approved",
            rejected: "Rejected",
            not_submitted: "Not Submitted",
        };
        const normalized = normalizeStatus(status);
        return map[normalized] || String(status || "pending").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
    }

    function docTypeLabel(value) {
        const map = {
            pan: "PAN Card",
            aadhaar: "Aadhaar",
            aadhaar_card: "Aadhaar Offline e-KYC",
            aadhaar_offline_ekyc: "Aadhaar Offline e-KYC",
            aadhar: "Aadhaar",
            passport: "Passport",
            driving_license: "Driving License",
            voter_id: "Voter ID",
        };
        const normalized = normalizeStatus(value);
        return map[normalized] || labelStatus(value || "KYC Documents");
    }

    function scoreColor(score) {
        const n = api.number(score, 0);
        if (n >= 80) return "bg-emerald-400";
        if (n >= 50) return "bg-orange-300";
        return "bg-rose-400";
    }

    function rowStatusClass(status) {
        const normalized = normalizeStatus(status);
        if (normalized === "approved") return "bg-emerald-400/10 text-emerald-400";
        if (normalized === "rejected") return "bg-rose-400/10 text-rose-400";
        if (["pending", "under_review", "review"].includes(normalized)) return "bg-orange-400/10 text-orange-300";
        return "bg-slate-400/10 text-slate-300";
    }

    function normalizeKyc(item) {
        const id = api.getId(item);
        const user = item.user || {};
        const status = normalizeStatus(item.status);
        const docs = item.documents || {};
        return {
            raw: item,
            id,
            userId: item.user_id || user.id || user._id || "",
            user: item.full_name || user.name || user.full_name || item.user_id || "Unknown User",
            email: user.email || item.email || "",
            phone: user.mobile || user.phone || item.phone || item.mobile || "",
            pan: item.document_number || item.offline_ekyc_reference_masked || item.pan_number || "",
            documentNumberLabel: item.document_number_label || "UIDAI Masked Aadhaar / Reference",
            verificationMethod: item.verification_method || "aadhaar_offline_ekyc",
            offlineShareCode: item.offline_ekyc_share_code || "",
            offlineReference: item.offline_ekyc_reference_masked || item.document_number || "",
            type: item.document_type || item.type || item.kyc_type || "KYC Documents",
            status,
            statusLabel: item.status_label || labelStatus(status),
            statusMessage: item.status_message || "",
            remark: item.remark || item.reject_reason || "",
            score: api.number(item.risk_score || item.score || item.confidence_score || (status === "approved" ? 100 : 0)),
            submittedAt: api.fmtDate(item.submitted_at || item.created_at),
            reviewedAt: api.fmtDate(item.reviewed_at || item.approved_at || item.rejected_at),
            canReview: item.can_review !== false && ["pending", "review", "under_review", "approved", "rejected"].includes(status),
            frontDoc: docs.front || null,
            backDoc: docs.back || null,
            selfieDoc: docs.selfie || null,
            offlineDoc: docs.offline || null,
        };
    }

    function setSummary(summary = {}) {
        if (els.total) els.total.textContent = String(summary.total || 0);
        if (els.pending) els.pending.textContent = String(summary.pending || 0);
        if (els.approved) els.approved.textContent = String(summary.approved || 0);
        if (els.rejected) els.rejected.textContent = String(summary.rejected || 0);
    }

    function render(rows) {
        if (!rows.length) {
            body.innerHTML = api.emptyRow(8, "No KYC requests found.");
            return;
        }

        body.innerHTML = rows.map(raw => {
            const k = normalizeKyc(raw);
            const score = Math.max(0, Math.min(100, k.score));
            const fileCount = [
                k.offlineDoc?.available,
                k.frontDoc?.available,
                k.backDoc?.available,
                k.selfieDoc?.available
            ].filter(Boolean).length;

            const isDigio = k.verificationMethod === "digilocker";
            const docBadgeHtml = isDigio
                ? `<span class="mt-1 inline-block rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-400">DigiLocker</span>`
                : "";

            let detailsHtml = "";
            if (isDigio) {
                detailsHtml = `
                    <div class="text-xs font-bold text-slate-200">${api.escapeHtml(raw.document_number || "Aadhaar Card")}</div>
                    <div class="mt-1 text-xs font-bold text-slate-400">PAN ${api.escapeHtml(raw.pan_number || "-")}</div>
                    <div class="mt-1"><a href="#" class="text-xs font-black text-cyan-400 hover:underline" data-kyc-action="view-details" data-id="${api.escapeHtml(k.id)}">View Aadhaar details</a></div>
                `;
            } else {
                detailsHtml = `
                    <div class="text-xs font-bold text-slate-200">${api.escapeHtml(k.pan || "-")}</div>
                `;
            }

            let actionHtml = "";
            if (isDigio) {
                actionHtml = `
                    <div class="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button type="button" class="admin-btn admin-btn-ghost px-3 py-2 text-xs" data-kyc-action="view-details" data-id="${api.escapeHtml(k.id)}">View</button>
                        ${k.canReview ? `<button type="button" class="admin-btn admin-btn-success px-3 py-2 text-xs" data-kyc-action="approve" data-id="${api.escapeHtml(k.id)}" data-user="${api.escapeHtml(k.user)}">Approve</button><button type="button" class="admin-btn admin-btn-danger px-3 py-2 text-xs" data-kyc-action="reject" data-id="${api.escapeHtml(k.id)}" data-user="${api.escapeHtml(k.user)}">Reject</button>` : `<span class="text-xs font-bold text-slate-500">Reviewed</span>`}
                    </div>
                `;
            } else {
                actionHtml = `
                    <div class="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button type="button" class="admin-btn admin-btn-ghost px-3 py-2 text-xs" data-kyc-action="view" data-id="${api.escapeHtml(k.id)}">View</button>
                        ${k.canReview ? `<button type="button" class="admin-btn admin-btn-success px-3 py-2 text-xs" data-kyc-action="approve" data-id="${api.escapeHtml(k.id)}" data-user="${api.escapeHtml(k.user)}">Approve</button><button type="button" class="admin-btn admin-btn-danger px-3 py-2 text-xs" data-kyc-action="reject" data-id="${api.escapeHtml(k.id)}" data-user="${api.escapeHtml(k.user)}">Reject</button>` : `<span class="text-xs font-bold text-slate-500">Reviewed</span>`}
                    </div>
                `;
            }

            return `
                <tr class="transition hover:bg-cyan-400/[0.04]">
                    <td class="align-top">
                        <div class="max-w-[200px] truncate font-black text-white" title="${api.escapeHtml(k.user)}">${api.escapeHtml(k.user)}</div>
                        <div class="mt-1 max-w-[200px] truncate text-xs font-bold text-slate-500" title="${api.escapeHtml(k.email || k.userId)}">${api.escapeHtml(k.email || k.userId || "-")}</div>
                        ${k.phone ? `<div class="mt-1 text-xs font-bold text-slate-600">${api.escapeHtml(k.phone)}</div>` : ""}
                    </td>
                    <td class="align-top font-black text-slate-200">
                        ${api.escapeHtml(raw.full_name || k.user || "-")}
                    </td>
                    <td class="align-top">
                        <div class="text-sm font-black text-slate-200">${api.escapeHtml(docTypeLabel(k.type))}</div>
                        ${docBadgeHtml}
                    </td>
                    <td class="align-top">
                        ${detailsHtml}
                    </td>
                    <td class="align-top"><span class="rounded-full px-3 py-1 text-xs font-black ${rowStatusClass(k.status)}">${api.escapeHtml(k.statusLabel)}</span></td>
                    <td class="align-top">
                        <div class="flex items-center gap-3">
                            ${isDigio ? `<span class="font-black text-slate-400">—</span>` : `
                            <div class="h-2 w-20 overflow-hidden rounded-full bg-slate-800"><span class="block h-full ${scoreColor(score)}" style="width:${score}%"></span></div>
                            <span class="font-black text-white">${score}</span>
                            `}
                        </div>
                    </td>
                    <td class="align-top text-xs font-bold text-slate-400">${api.escapeHtml(k.submittedAt)}</td>
                    <td class="align-top text-right font-semibold">
                        ${actionHtml}
                    </td>
                </tr>
            `;
        }).join("");
    }

    function renderPagination(pagination = {}) {
        if (!els.pagination) return;

        const page = pagination.page || state.page;
        const totalPages = pagination.total_pages || pagination.pages || 1;
        const total = pagination.total || 0;

        els.pagination.innerHTML = `
            <span>Showing page ${api.escapeHtml(page)} of ${api.escapeHtml(totalPages)} • ${api.escapeHtml(total)} records</span>
            <div class="flex items-center gap-2">
                <button type="button" class="admin-btn admin-btn-ghost px-3 py-2 text-xs" data-page-move="prev" ${page <= 1 ? "disabled" : ""}>Previous</button>
                <button type="button" class="admin-btn admin-btn-ghost px-3 py-2 text-xs" data-page-move="next" ${page >= totalPages ? "disabled" : ""}>Next</button>
            </div>
        `;
    }

    function ensureReviewModal() {
        let modal = document.getElementById("kycReviewModal");
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "kycReviewModal";
        modal.className = "admin-modal";
        modal.innerHTML = `
            <div class="admin-modal-panel p-6">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <h3 id="kycReviewTitle" class="text-xl font-black text-white">Review KYC</h3>
                        <p id="kycReviewSubtitle" class="mt-1 text-sm text-slate-400">Approve or reject this KYC request.</p>
                    </div>
                    <button class="admin-btn admin-btn-ghost px-3 py-2" data-modal-close type="button">✕</button>
                </div>
                <div class="mt-5">
                    <label id="kycReviewLabel" class="mb-2 block text-sm font-black text-slate-300">Remark</label>
                    <textarea id="kycReviewReason" rows="4" class="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-cyan-400" placeholder="Write admin remark or reject reason"></textarea>
                    <p id="kycReviewError" class="mt-2 text-xs font-bold text-rose-300"></p>
                </div>
                <div class="mt-6 flex flex-wrap justify-end gap-3">
                    <button class="admin-btn" data-modal-close type="button">Cancel</button>
                    <button id="kycReviewSubmit" class="admin-btn admin-btn-primary" type="button">Submit</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector("#kycReviewSubmit")?.addEventListener("click", submitReviewModal);
        modal.addEventListener("click", (event) => {
            if (event.target.closest("[data-modal-close]")) closeReviewModal();
        });
        return modal;
    }

    function openReviewModal(id, action, userName) {
        const modal = ensureReviewModal();
        state.pendingReview = { id, action };
        const isApprove = action === "approve";
        modal.querySelector("#kycReviewTitle").textContent = isApprove ? "Approve KYC" : "Reject KYC";
        modal.querySelector("#kycReviewSubtitle").textContent = `${isApprove ? "Approve" : "Reject"} KYC request for ${userName || id}.`;
        modal.querySelector("#kycReviewLabel").textContent = isApprove ? "Approval remark" : "Reject reason";
        const textarea = modal.querySelector("#kycReviewReason");
        textarea.value = isApprove ? "KYC approved by admin." : "";
        textarea.placeholder = isApprove ? "KYC approved by admin." : "Example: Document image is not clear.";
        modal.querySelector("#kycReviewError").textContent = "";
        modal.querySelector("#kycReviewSubmit").textContent = isApprove ? "Approve KYC" : "Reject KYC";
        modal.querySelector("#kycReviewSubmit").className = isApprove ? "admin-btn admin-btn-success" : "admin-btn admin-btn-danger";
        modal.classList.add("open");
        setTimeout(() => textarea.focus(), 40);
    }

    function closeReviewModal() {
        document.getElementById("kycReviewModal")?.classList.remove("open");
        state.pendingReview = null;
    }

    function ensureDetailModal() {
        let modal = document.getElementById("kycDetailModal");
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "kycDetailModal";
        modal.className = "admin-modal";
        modal.innerHTML = `
            <div class="admin-modal-panel p-6" style="width: min(920px, 100%); max-width: min(920px, 100%);">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <h3 id="kycDetailTitle" class="text-xl font-black text-white">KYC Detail</h3>
                        <p id="kycDetailSubtitle" class="mt-1 text-sm text-slate-400">User submitted KYC documents.</p>
                    </div>
                    <button class="admin-btn admin-btn-ghost px-3 py-2" data-detail-close type="button">✕</button>
                </div>
                <div id="kycDetailContent" class="mt-5 space-y-5"></div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener("click", (event) => {
            if (event.target.closest("[data-detail-close]")) closeDetailModal();
        });
        return modal;
    }

    function closeDetailModal() {
        document.getElementById("kycDetailModal")?.classList.remove("open");
        state.currentDetail = null;
    }

    async function openDetailsModal(id) {
        const modal = document.getElementById("kycDetailsModal");
        const content = document.getElementById("kycDetailsContent");
        const closeBtn = document.getElementById("kycDetailsClose");
        if (!modal || !content) return;

        content.innerHTML = `<div class="py-12 text-center text-sm font-bold text-slate-500">Loading profile details...</div>`;
        modal.classList.add("open");

        const close = () => {
            modal.classList.remove("open");
        };
        closeBtn.onclick = close;
        modal.onclick = (e) => { if (e.target === modal) close(); };

        try {
            const data = await api.request(`/kyc/${id}`, { params: { _t: Date.now() } });
            const kyc = data?.kyc || {};
            const user = data?.user || {};

            const rawKyc = kyc.raw || kyc;
            const actions = rawKyc.actions || [];
            const aadhaarAction = actions.find(a => ["aadhaar_offline", "digilocker", "aadhaar_verification"].includes(a.type.toLowerCase())) || {};
            const details = aadhaarAction.details || {};

            const name = details.name || details.full_name || kyc.full_name || user.name || "—";
            const dob = details.dob || details.date_of_birth || kyc.dob || user.dob || "—";
            const gender = details.gender || kyc.gender || user.gender || "—";
            const address = details.address || kyc.address || user.address || "—";
            let addressStr = address;
            if (address && typeof address === "object") {
                const parts = [];
                for (let key of ["house", "street", "loc", "po", "dist", "state", "pc"]) {
                    if (address[key]) parts.push(String(address[key]));
                }
                addressStr = parts.join(", ");
            }

            const selfieUrl = kyc.documents?.selfie?.url || kyc.documents?.front?.url || "";
            const isDigioKyc = kyc.verification_method === "digilocker";

            content.innerHTML = `
                <div class="space-y-4 text-xs font-semibold text-slate-300">
                    ${selfieUrl ? `
                    <div class="flex justify-center mb-4">
                        <img src="${selfieUrl}" class="w-32 h-36 object-cover border border-white/10 rounded-2xl shadow-xl bg-slate-950" alt="Selfie" onerror="this.style.display='none'" />
                    </div>
                    ` : ""}
                    <div class="grid grid-cols-3 gap-2 border-b border-white/5 pb-2">
                        <span class="text-slate-500 font-bold">Full Name:</span>
                        <span class="col-span-2 text-white font-black">${api.escapeHtml(name)}</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 border-b border-white/5 pb-2">
                        <span class="text-slate-500 font-bold">Date of Birth:</span>
                        <span class="col-span-2 text-white font-black">${api.escapeHtml(dob)}</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 border-b border-white/5 pb-2">
                        <span class="text-slate-500 font-bold">Gender:</span>
                        <span class="col-span-2 text-white font-black">${api.escapeHtml(gender === "M" ? "Male" : gender === "F" ? "Female" : gender)}</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 border-b border-white/5 pb-2">
                        <span class="text-slate-500 font-bold">Aadhaar Card Number:</span>
                        <span class="col-span-2 text-white font-black">${api.escapeHtml(kyc.aadhaar_number || user.aadhaar_number || "—")}</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 border-b border-white/5 pb-2">
                        <span class="text-slate-500 font-bold">PAN Number:</span>
                        <span class="col-span-2 text-white font-black">${api.escapeHtml(kyc.pan_number || user.pan_number || "—")}</span>
                    </div>
                    ${(kyc.driving_license_number || user.driving_license_number) ? `
                    <div class="grid grid-cols-3 gap-2 border-b border-white/5 pb-2">
                        <span class="text-slate-500 font-bold">Driving License:</span>
                        <span class="col-span-2 text-white font-black">${api.escapeHtml(kyc.driving_license_number || user.driving_license_number)}</span>
                    </div>
                    ` : ""}
                    <div class="grid grid-cols-3 gap-2 border-b border-white/5 pb-2">
                        <span class="text-slate-500 font-bold">Address:</span>
                        <span class="col-span-2 text-white leading-relaxed font-bold">${api.escapeHtml(addressStr || "—")}</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 border-b border-white/5 pb-2">
                        <span class="text-slate-500 font-bold">Digio Request ID:</span>
                        <span class="col-span-2 text-slate-400 font-mono text-[10px]">${api.escapeHtml(user.digio_request_id || "—")}</span>
                    </div>
                    ${isDigioKyc ? `
                    <div class="mt-4 pt-4 border-t border-white/10 flex flex-wrap justify-between items-center gap-3">
                        <div>
                            <span class="text-slate-500 font-bold block mb-2">DigiLocker Documents:</span>
                            <div class="flex flex-wrap gap-2">
                                <button type="button" data-dl-doc="aadhaar" data-kyc-id="${id}" class="rounded-xl border border-white/10 bg-slate-900 hover:bg-slate-800 text-cyan-400 px-3 py-2 text-xs font-black transition flex items-center gap-1 focus:outline-none">
                                    📄 Aadhaar PDF
                                </button>
                                <button type="button" data-dl-doc="pan" data-kyc-id="${id}" class="rounded-xl border border-white/10 bg-slate-900 hover:bg-slate-800 text-cyan-400 px-3 py-2 text-xs font-black transition flex items-center gap-1 focus:outline-none">
                                    📄 PAN PDF
                                </button>
                                ${(kyc.driving_license_number || user.driving_license_number) ? `
                                <button type="button" data-dl-doc="dl" data-kyc-id="${id}" class="rounded-xl border border-white/10 bg-slate-900 hover:bg-slate-800 text-cyan-400 px-3 py-2 text-xs font-black transition flex items-center gap-1 focus:outline-none">
                                    📄 DL PDF
                                </button>
                                ` : ""}
                            </div>
                        </div>
                        <button type="button" class="rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 text-xs font-black transition" data-kyc-action="delete" data-id="${id}">
                            Delete KYC
                        </button>
                    </div>
                    ` : ""}
                </div>
            `;
        } catch (err) {
            content.innerHTML = `<div class="py-12 text-center text-sm font-bold text-rose-400">Failed to load details: ${api.escapeHtml(err.message || "Server error")}</div>`;
        }
    }

    async function fetchDocumentBlob(kycId, side) {
        const token = api.getToken();
        const response = await fetch(`/api/admin/kyc/${encodeURIComponent(kycId)}/document/${side}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error(`${labelStatus(side)} document not available.`);
        return response.blob();
    }

    async function fetchOfflineEkycPreview(kycId, shareCode) {
        const token = api.getToken();
        let url = `/api/admin/kyc/${encodeURIComponent(kycId)}/document/offline?preview=1`;
        if (shareCode) {
            url += `&share_code=${encodeURIComponent(shareCode)}`;
        }
        const response = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const text = await response.text();
        if (!response.ok) {
            let message = "Unable to open Offline e-KYC preview.";
            try {
                const parsed = JSON.parse(text);
                message = parsed.message || parsed.error || message;
                if (parsed.errors?.offline_ekyc) message = parsed.errors.offline_ekyc;
            } catch (_) {}
            throw new Error(message);
        }
        return text;
    }

    async function openOfflineEkycFile(kycId, filename) {
        const xmlText = await fetchOfflineEkycPreview(kycId);
        const safeTitle = api.escapeHtml(filename || "Offline e-KYC XML Preview");
        const safeXml = api.escapeHtml(xmlText || "");
        const preview = window.open("", "_blank", "noopener,noreferrer");
        if (!preview) throw new Error("Popup blocked. Please allow popups to open the Offline e-KYC preview.");
        preview.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{margin:0;background:#0b1220;color:#e5eefc;font-family:Consolas,Menlo,monospace}.bar{position:sticky;top:0;background:#111827;border-bottom:1px solid #263247;padding:14px 18px;font-family:Arial,sans-serif}.bar h1{font-size:16px;margin:0}.bar p{font-size:12px;margin:4px 0 0;color:#9ca3af}pre{white-space:pre-wrap;word-break:break-word;padding:18px;margin:0;font-size:13px;line-height:1.55}</style></head><body><div class="bar"><h1>${safeTitle}</h1><p>UIDAI Offline e-KYC XML preview opened using the submitted share code.</p></div><pre>${safeXml}</pre></body></html>`);
        preview.document.close();
    }

    async function downloadOfflineEkycFile(kycId, filename) {
        const blob = await fetchDocumentBlob(kycId, "offline");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || "offline-ekyc.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function renderOfflineEkycFile(container, kycId, doc, shareCode, referenceValue) {
        const slot = container.querySelector(`[data-doc-slot="offline"]`);
        if (!slot) return;

        if (!doc?.available) {
            slot.innerHTML = `<div class="rounded-3xl border border-white/10 bg-slate-950/70 p-6 text-center text-sm font-bold text-slate-500">UIDAI Offline e-KYC ZIP/XML not uploaded.</div>`;
            return;
        }

        slot.innerHTML = `
            <div class="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
                <p class="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">UIDAI Offline e-KYC File</p>
                <h4 class="mt-2 break-words text-sm font-black text-white">${api.escapeHtml(doc.filename || "Offline e-KYC file")}</h4>
                <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <div class="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                        <label for="adminShareCodeInput" class="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Share Code</label>
                        <input id="adminShareCodeInput" type="text" maxlength="12" class="mt-2 w-full border-0 bg-transparent text-sm font-black text-emerald-300 outline-none p-0 focus:ring-0 focus:border-b focus:border-emerald-400/30" value="${api.escapeHtml(shareCode || "")}" placeholder="Enter Share Code" />
                    </div>
                    <div class="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                        <p class="text-xs font-black uppercase tracking-[0.16em] text-slate-500">UIDAI Reference</p>
                        <p class="mt-2 break-words text-sm font-black text-white">${api.escapeHtml(referenceValue || "-")}</p>
                    </div>
                </div>
                <div class="mt-4 flex flex-wrap gap-2">
                    <button type="button" class="admin-btn admin-btn-primary px-4 py-2 text-xs" data-open-offline-doc="${api.escapeHtml(kycId)}" data-offline-filename="${api.escapeHtml(doc.filename || "offline-ekyc.zip")}">Open File</button>
                    <button type="button" class="admin-btn admin-btn-ghost px-4 py-2 text-xs" data-download-offline-doc="${api.escapeHtml(kycId)}" data-offline-filename="${api.escapeHtml(doc.filename || "offline-ekyc.zip")}">Download File</button>
                    <button type="button" class="admin-btn admin-btn-ghost px-4 py-2 text-xs" data-copy-share-code="${api.escapeHtml(shareCode || "")}">Copy Share Code</button>
                </div>
                <p class="mt-3 text-xs font-bold leading-6 text-slate-400">Open previews the UIDAI XML with the entered share code. Download keeps the original ZIP/XML file for manual review.</p>
            </div>
        `;
    }

    async function openDetailModal(id) {
        const modal = ensureDetailModal();
        const content = modal.querySelector("#kycDetailContent");
        modal.classList.add("open");
        content.innerHTML = `<div class="rounded-3xl border border-white/10 bg-slate-950/70 p-6 text-center text-sm font-bold text-slate-500">Loading KYC detail...</div>`;

        async function loadSecuredImage(kycId, side, imgElementId) {
            try {
                const blob = await fetchDocumentBlob(kycId, side);
                const url = URL.createObjectURL(blob);
                const img = document.getElementById(imgElementId);
                if (img) {
                    img.src = url;
                    img.onclick = () => {
                        const win = window.open();
                        win.document.write(`<img src="${url}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                    };
                }
            } catch (err) {
                console.error(`Failed to load ${side} image:`, err);
                const img = document.getElementById(imgElementId);
                if (img) {
                    const parent = img.parentElement;
                    if (parent) {
                        parent.innerHTML = `<div class="flex items-center justify-center h-full text-slate-500 text-xs font-bold p-4 text-center">Failed to load ${side} image.</div>`;
                    }
                }
            }
        }

        try {
            const data = await api.request(`/kyc/${encodeURIComponent(id)}`);
            const k = normalizeKyc(data.kyc || {});
            state.currentDetail = k;
            modal.querySelector("#kycDetailTitle").textContent = `${k.user} • ${k.statusLabel}`;
            modal.querySelector("#kycDetailSubtitle").textContent = k.email || k.userId || "KYC request detail";

            content.innerHTML = `
                <div class="grid gap-4 md:grid-cols-3">
                    <div class="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                        <p class="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Full Name</p>
                        <p class="mt-2 text-sm font-black text-white">${api.escapeHtml(k.user)}</p>
                    </div>
                    <div class="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                        <p class="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Document</p>
                        <p class="mt-2 text-sm font-black text-white">${api.escapeHtml(docTypeLabel(k.type))}</p>
                        <p class="mt-1 text-xs font-bold text-slate-500">${api.escapeHtml(k.verificationMethod === "aadhaar_offline_ekyc" ? "UIDAI Offline e-KYC" : k.verificationMethod)}</p>
                    </div>
                    <div class="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                        <p class="text-xs font-black uppercase tracking-[0.18em] text-slate-500">UIDAI Reference</p>
                        <p class="mt-2 break-words text-sm font-black text-white">${api.escapeHtml(k.pan || "-")}</p>
                    </div>
                </div>

                <!-- Document Image Preview Grid -->
                <div class="grid gap-4 md:grid-cols-3">
                    ${k.frontDoc && k.frontDoc.available ? `
                        <div class="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                            <p class="text-xs font-black uppercase tracking-[0.18em] text-slate-500 mb-2">Aadhaar Front Side</p>
                            <div class="relative overflow-hidden rounded-2xl bg-black aspect-[4/3] flex items-center justify-center border border-white/5">
                                <img id="adminImgFront" class="w-full h-full object-contain cursor-pointer" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><text x='50%' y='50%' font-size='10' font-family='sans-serif' text-anchor='middle' fill='%2364748b'>Loading...</text></svg>" />
                            </div>
                        </div>
                    ` : ""}
                    ${k.backDoc && k.backDoc.available ? `
                        <div class="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                            <p class="text-xs font-black uppercase tracking-[0.18em] text-slate-500 mb-2">Aadhaar Back Side</p>
                            <div class="relative overflow-hidden rounded-2xl bg-black aspect-[4/3] flex items-center justify-center border border-white/5">
                                <img id="adminImgBack" class="w-full h-full object-contain cursor-pointer" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><text x='50%' y='50%' font-size='10' font-family='sans-serif' text-anchor='middle' fill='%2364748b'>Loading...</text></svg>" />
                            </div>
                        </div>
                    ` : ""}
                    ${k.selfieDoc && k.selfieDoc.available ? `
                        <div class="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                            <p class="text-xs font-black uppercase tracking-[0.18em] text-slate-500 mb-2">User Selfie</p>
                            <div class="relative overflow-hidden rounded-2xl bg-black aspect-[4/3] flex items-center justify-center border border-white/5">
                                <img id="adminImgSelfie" class="w-full h-full object-contain cursor-pointer" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><text x='50%' y='50%' font-size='10' font-family='sans-serif' text-anchor='middle' fill='%2364748b'>Loading...</text></svg>" />
                            </div>
                        </div>
                    ` : ""}
                </div>

                <div class="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <span class="rounded-full px-3 py-1 text-xs font-black ${rowStatusClass(k.status)}">${api.escapeHtml(k.statusLabel)}</span>
                            <p class="mt-2 text-sm font-bold text-slate-400">${api.escapeHtml(k.statusMessage || k.remark || "No remark available.")}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            ${k.canReview ? `<button type="button" class="admin-btn admin-btn-success" data-kyc-action="approve" data-id="${api.escapeHtml(k.id)}" data-user="${api.escapeHtml(k.user)}">Approve</button><button type="button" class="admin-btn admin-btn-danger" data-kyc-action="reject" data-id="${api.escapeHtml(k.id)}" data-user="${api.escapeHtml(k.user)}">Reject</button>` : ""}
                        </div>
                    </div>
                </div>
                <div data-doc-slot="offline"></div>
            `;

            renderOfflineEkycFile(content, k.id, k.offlineDoc, k.offlineShareCode, k.offlineReference || k.pan);

            if (k.frontDoc && k.frontDoc.available) {
                loadSecuredImage(k.id, "front", "adminImgFront");
            }
            if (k.backDoc && k.backDoc.available) {
                loadSecuredImage(k.id, "back", "adminImgBack");
            }
            if (k.selfieDoc && k.selfieDoc.available) {
                loadSecuredImage(k.id, "selfie", "adminImgSelfie");
            }
        } catch (error) {
            content.innerHTML = `<div class="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6 text-center text-sm font-bold text-rose-300">${api.escapeHtml(error.message || "Unable to load KYC detail.")}</div>`;
            ui.toast("KYC Detail", error.message || "Unable to load KYC detail.", "danger");
        }
    }


    async function submitReviewModal() {
        if (!state.pendingReview) return;
        const modal = ensureReviewModal();
        const textarea = modal.querySelector("#kycReviewReason");
        const error = modal.querySelector("#kycReviewError");
        const submitBtn = modal.querySelector("#kycReviewSubmit");
        const reason = String(textarea.value || "").trim();
        const { id, action } = state.pendingReview;

        if (action === "reject" && !reason) {
            error.textContent = "Reject reason is required.";
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = action === "approve" ? "Approving..." : "Rejecting...";
        ui.toast(action === "approve" ? "Approving KYC" : "Rejecting KYC", "Please wait...", "info");

        try {
            await api.request(`/kyc/${encodeURIComponent(id)}/${action}`, {
                method: "POST",
                body: action === "approve" ? { remark: reason || "KYC approved by admin." } : { reason }
            });
            ui.toast("KYC Updated", `KYC ${action === "approve" ? "approved" : "rejected"} successfully.`, action === "approve" ? "success" : "danger");
            closeReviewModal();
            closeDetailModal();
            await loadKyc();
            await loadSummary();
        } catch (errorObj) {
            ui.toast("KYC Action Failed", errorObj.message || `KYC ${action} failed.`, "danger");
            console.error(errorObj);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = action === "approve" ? "Approve KYC" : "Reject KYC";
        }
    }

    async function loadSummary() {
        try {
            const data = await api.request("/kyc/summary");
            setSummary(data.summary || {});
        } catch (error) {
            console.warn("KYC summary failed", error);
        }
    }

    async function loadKyc() {
        api.setLoading(body, 7, "Loading KYC requests...");
        try {
            const data = await api.request("/kyc", {
                params: {
                    page: state.page,
                    limit: state.limit,
                    status: state.status === "all" ? "" : state.status,
                    search: state.search,
                }
            });
            state.rows = data.kyc_requests || [];
            render(state.rows);
            renderPagination(data.pagination || {});
        } catch (error) {
            ui.toast("KYC Requests Failed", error.message || "Unable to load KYC requests.", "danger");
            console.error(error);
            render([]);
        }
    }

    let searchTimer = null;
    els.searchInput?.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.search = String(els.searchInput.value || "").trim();
            state.page = 1;
            loadKyc();
        }, 350);
    });

    els.statusFilter?.addEventListener("change", () => {
        state.status = els.statusFilter.value || "all";
        state.page = 1;
        loadKyc();
    });

    els.refreshBtn?.addEventListener("click", async () => {
        await loadSummary();
        await loadKyc();
        ui.toast("KYC Refreshed", "Latest KYC requests loaded.", "success");
    });

    els.pagination?.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-page-move]");
        if (!btn || btn.disabled) return;
        const move = btn.dataset.pageMove;
        state.page = Math.max(1, state.page + (move === "next" ? 1 : -1));
        loadKyc();
    });

    document.addEventListener("click", async (e) => {
        const openOfflineBtn = e.target.closest("[data-open-offline-doc]");
        if (openOfflineBtn) {
            const kycId = openOfflineBtn.dataset.openOfflineDoc || "";
            if (!kycId) return;
            const cardBody = openOfflineBtn.closest(".rounded-3xl");
            let xmlContainer = cardBody?.querySelector(".xml-preview-container");

            if (xmlContainer) {
                if (xmlContainer.classList.contains("hidden")) {
                    xmlContainer.classList.remove("hidden");
                    openOfflineBtn.textContent = "Close File";
                    openOfflineBtn.className = "admin-btn admin-btn-danger px-4 py-2 text-xs";
                } else {
                    xmlContainer.classList.add("hidden");
                    openOfflineBtn.textContent = "Open File";
                    openOfflineBtn.className = "admin-btn admin-btn-primary px-4 py-2 text-xs";
                }
                return;
            }

            const shareCodeInput = document.getElementById("adminShareCodeInput");
            const shareCode = shareCodeInput ? shareCodeInput.value.trim() : "";

            if (!shareCode) {
                ui.toast("Preview Failed", "Please enter the 4-digit Share Code in the input field.", "warning");
                if (shareCodeInput) shareCodeInput.focus();
                return;
            }

            try {
                openOfflineBtn.disabled = true;
                openOfflineBtn.textContent = "Opening...";

                const xmlText = await fetchOfflineEkycPreview(kycId, shareCode.trim());
                const safeXml = api.escapeHtml(xmlText || "");

                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlText, "text/xml");
                
                const getTag = (name) => {
                    const elements = xmlDoc.getElementsByTagName("*");
                    for (let el of elements) {
                        if (el.tagName.toLowerCase().endsWith(name.toLowerCase())) {
                            return el;
                        }
                    }
                    return null;
                };

                const poi = getTag("Poi");
                const poa = getTag("Poa");
                const pht = getTag("Pht");

                const name = poi?.getAttribute("name") || poi?.getAttribute("Name") || "";
                const dob = poi?.getAttribute("dob") || poi?.getAttribute("DOB") || poi?.getAttribute("yob") || poi?.getAttribute("YOB") || "";
                const gender = poi?.getAttribute("gender") || poi?.getAttribute("Gender") || "";
                const photoBase64 = pht?.textContent?.trim() || "";
                
                const addressParts = [];
                if (poa) {
                    const attrs = ["co", "house", "street", "lm", "loc", "vtc", "po", "dist", "state", "pc"];
                    attrs.forEach(attr => {
                        const val = poa.getAttribute(attr) || poa.getAttribute(attr.toUpperCase()) || poa.getAttribute(attr.charAt(0).toUpperCase() + attr.slice(1));
                        if (val) addressParts.push(val);
                    });
                }
                const address = addressParts.join(", ") || "";
                
                const root = xmlDoc.documentElement;
                const referenceId = root?.getAttribute("referenceId") || root?.getAttribute("referenceID") || root?.getAttribute("refId") || "";

                xmlContainer = document.createElement("div");
                xmlContainer.className = "xml-preview-container mt-4";

                if (photoBase64 && name) {
                    xmlContainer.innerHTML = `
                        <div class="mt-4 rounded-3xl border border-slate-200 bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] p-5 text-slate-900 shadow-xl max-w-md mx-auto text-left">
                            <div class="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                                <div class="text-left">
                                    <h5 class="text-[10px] font-black tracking-wide text-blue-900">भारत सरकार | GOVERNMENT OF INDIA</h5>
                                    <h6 class="text-[9px] font-bold text-slate-500">भारतीय विशिष्ट पहचान प्राधिकरण | UIDAI</h6>
                                </div>
                                <div class="text-right">
                                    <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800 border border-emerald-200">Offline e-KYC</span>
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-[100px_1fr] gap-4 items-start">
                                <div class="flex flex-col items-center">
                                    <img src="data:image/jpeg;base64,${photoBase64}" class="w-24 h-28 object-cover border border-slate-200 rounded-xl shadow-md bg-slate-100" alt="Aadhaar Photo" />
                                </div>
                                
                                <div class="space-y-2 text-xs">
                                    <div>
                                        <span class="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Name (नाम)</span>
                                        <p class="font-extrabold text-slate-900 text-sm">${api.escapeHtml(name)}</p>
                                    </div>
                                    <div class="grid grid-cols-2 gap-2">
                                        <div>
                                            <span class="text-[9px] font-black uppercase tracking-wider text-slate-400 block">DOB (जन्म तिथि)</span>
                                            <p class="font-bold text-slate-900">${api.escapeHtml(dob)}</p>
                                        </div>
                                        <div>
                                            <span class="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Gender (लिंग)</span>
                                            <p class="font-bold text-slate-900">${gender === 'M' ? 'Male (पुरुष)' : gender === 'F' ? 'Female (महिला)' : api.escapeHtml(gender)}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <span class="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Reference ID</span>
                                        <p class="font-mono text-[10px] text-slate-600">${api.escapeHtml(referenceId)}</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="mt-4 pt-3 border-t border-slate-200 text-[10px] text-slate-700">
                                <span class="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Address (पता)</span>
                                <p class="leading-relaxed font-semibold">${api.escapeHtml(address)}</p>
                            </div>
                        </div>
                    `;
                } else {
                    xmlContainer.innerHTML = `<pre class="whitespace-pre-wrap break-all rounded-2xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-emerald-300 max-h-96 overflow-auto">${safeXml}</pre>`;
                }

                cardBody.appendChild(xmlContainer);

                openOfflineBtn.textContent = "Close File";
                openOfflineBtn.className = "admin-btn admin-btn-danger px-4 py-2 text-xs";
                ui.toast("File Opened", "Offline e-KYC document preview loaded successfully.", "success");
            } catch (err) {
                ui.toast("Open Failed", err.message || "Unable to decrypt/open Offline e-KYC file.", "danger");
                openOfflineBtn.textContent = "Open File";
                openOfflineBtn.className = "admin-btn admin-btn-primary px-4 py-2 text-xs";
            } finally {
                openOfflineBtn.disabled = false;
            }
            return;
        }

        const downloadOfflineBtn = e.target.closest("[data-download-offline-doc]");
        if (downloadOfflineBtn) {
            const kycId = downloadOfflineBtn.dataset.downloadOfflineDoc || "";
            const filename = downloadOfflineBtn.dataset.offlineFilename || "offline-ekyc.zip";
            if (!kycId) return;
            const originalText = downloadOfflineBtn.textContent;
            try {
                downloadOfflineBtn.disabled = true;
                downloadOfflineBtn.textContent = "Downloading...";
                await downloadOfflineEkycFile(kycId, filename);
                ui.toast("File Downloaded", "Original Offline e-KYC ZIP/XML downloaded. Use the saved share code to open it.", "success");
            } catch (err) {
                ui.toast("Download Failed", err.message || "Unable to download Offline e-KYC file.", "danger");
            } finally {
                downloadOfflineBtn.disabled = false;
                downloadOfflineBtn.textContent = originalText || "Download File";
            }
            return;
        }

        const copyShareBtn = e.target.closest("[data-copy-share-code]");
        if (copyShareBtn) {
            const code = copyShareBtn.dataset.copyShareCode || "";
            if (!code) return;
            try {
                await navigator.clipboard.writeText(code);
                ui.toast("Share Code Copied", "Offline e-KYC share code copied.", "success");
            } catch (err) {
                ui.toast("Copy Failed", "Please copy the share code manually.", "danger");
            }
            return;
        }
        const dlDocBtn = e.target.closest("[data-dl-doc]");
        if (dlDocBtn) {
            e.preventDefault();
            const kycId = dlDocBtn.dataset.kycId;
            const docType = dlDocBtn.dataset.dlDoc;
            if (!kycId || !docType) return;
            
            try {
                dlDocBtn.style.opacity = "0.5";
                dlDocBtn.style.pointerEvents = "none";
                const token = api.getToken();
                const response = await fetch(`/api/admin/kyc/${encodeURIComponent(kycId)}/document/${docType}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (!response.ok) {
                    throw new Error(`${docType.toUpperCase()} document not available.`);
                }
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
            } catch (err) {
                ui.toast("Download Failed", err.message || "Failed to retrieve DigiLocker document.", "danger");
            } finally {
                dlDocBtn.style.opacity = "1";
                dlDocBtn.style.pointerEvents = "auto";
            }
            return;
        }
        const btn = e.target.closest("[data-kyc-action][data-id]");
        if (!btn) return;
        const action = btn.dataset.kycAction;
        const id = btn.dataset.id;
        if (action === "view") {
            openDetailModal(id);
            return;
        }
        if (action === "view-details") {
            e.preventDefault();
            openDetailsModal(id);
            return;
        }
        if (action === "fetch-files") {
            e.preventDefault();
            try {
                btn.style.pointerEvents = "none";
                btn.style.opacity = "0.5";
                const res = await api.post(`/kyc/${id}/fetch-files`);
                ui.toast("Sync Success", "Digio files synchronized successfully.", "success");
                await loadKyc();
            } catch (err) {
                ui.toast("Sync Failed", err.message || "Failed to synchronise Digio files.", "danger");
            } finally {
                btn.style.pointerEvents = "auto";
                btn.style.opacity = "1";
            }
            return;
        }
        if (action === "delete") {
            const confirmDelete = confirm("Are you sure you want to delete this KYC request and reset the user's verification status?");
            if (!confirmDelete) return;
            try {
                btn.disabled = true;
                const res = await api.delete(`/kyc/${id}`);
                ui.toast("Deleted", "KYC record deleted successfully.", "success");
                await Promise.all([loadSummary(), loadKyc()]);
            } catch (err) {
                ui.toast("Delete Failed", err.message || "Failed to delete KYC record.", "danger");
            } finally {
                btn.disabled = false;
            }
            return;
        }
        if (["approve", "reject"].includes(action)) {
            openReviewModal(id, action, btn.dataset.user || "");
        }
    });

    await Promise.all([loadSummary(), loadKyc()]);
});
