"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX About Page
|--------------------------------------------------------------------------
| Link-inspired About page interactions:
| - Counter animation
| - Values render
| - Trust/value card click messages
|--------------------------------------------------------------------------
*/

const aboutValuesGrid = document.getElementById("aboutValuesGrid");

const values = [
    {
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.15)] text-cyan-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
        </div>`,
        title: "Compliance First",
        description: "Adherence to highest compliance standards, including active KYC verification and AML monitoring."
    },
    {
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.15)] text-rose-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
            </svg>
        </div>`,
        title: "Trader Education",
        description: "Dedicated blog posts, options challenges, and risk disclosures to help traders understand derivatives."
    },
    {
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.15)] text-amber-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
        </div>`,
        title: "Execution Clarity",
        description: "Intuitive layouts displaying real-time price feeds, asset pairs, leverage ratios, and transparent order details."
    },
    {
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_20px_rgba(52,211,153,0.15)] text-emerald-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 8h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V15a2 2 0 01-2 2z"></path>
            </svg>
        </div>`,
        title: "Transparent Fees",
        description: "Fully transparent maker-taker schedules, VIP tier calculations, and direct referral campaign reporting."
    },
    {
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.15)] text-blue-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
        </div>`,
        title: "Advanced Security",
        description: "Equipped with secure user authentication, complete ledger audit logs, and automated wallet verification checks."
    },
    {
        icon: `<div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.15)] text-orange-400">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h2a2.5 2.5 0 002.5-2.5V10a2 2 0 00-2-2h-1.5a2 2 0 01-2-2V4.833A8.001 8.001 0 0012 3a8 8 0 00-8.945 3.935z"></path>
            </svg>
        </div>`,
        title: "India Focused",
        description: "Customized for the Indian market, featuring local currency support, compliance readiness, and an India-first trading experience."
    }
];

function showMiniMessage(message, type = "success") {
    let messageBox = document.getElementById("aboutMiniMessage");

    if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.id = "aboutMiniMessage";
        document.body.appendChild(messageBox);
    }

    if (type === "error") {
        messageBox.className = "fixed bottom-6 right-6 z-[9999] max-w-sm rounded-2xl border border-red-400/30 bg-red-400/15 px-5 py-4 text-sm font-black text-red-300 shadow-2xl transition";
    } else {
        messageBox.className = "fixed bottom-6 right-6 z-[9999] max-w-sm rounded-2xl border border-emerald-400/30 bg-emerald-400/15 px-5 py-4 text-sm font-black text-emerald-300 shadow-2xl transition";
    }

    messageBox.textContent = message;
    messageBox.style.opacity = "1";
    messageBox.style.transform = "translateY(0)";

    window.setTimeout(() => {
        messageBox.style.opacity = "0";
        messageBox.style.transform = "translateY(12px)";
    }, 2500);
}

function animateCounters() {
    const counters = document.querySelectorAll(".about-counter");

    counters.forEach((counter) => {
        const target = Number(counter.getAttribute("data-count") || "0");
        let current = 0;
        const step = Math.max(1, Math.ceil(target / 55));

        const timer = window.setInterval(() => {
            current += step;

            if (current >= target) {
                current = target;
                window.clearInterval(timer);
            }

            counter.textContent = current;
        }, 20);
    });
}

function renderValues() {
    if (!aboutValuesGrid) {
        return;
    }

    aboutValuesGrid.innerHTML = values
        .map((value) => {
            return `
                <article class="about-value-card">
                    <div>${value.icon}</div>
                    <h3 class="mt-5 text-2xl font-black text-white">${value.title}</h3>
                    <p class="mt-3 leading-7 text-slate-400">${value.description}</p>
                </article>
            `;
        })
        .join("");

    document.querySelectorAll(".about-value-card, .about-trust-card, .about-feature-card").forEach((card) => {
        card.addEventListener("click", () => {
            const title = card.querySelector("h3")?.textContent || "Section";
            showMiniMessage(`${title} selected.`, "success");
        });
    });
}

function initAboutPage() {
    animateCounters();
    renderValues();

    const signUpBtn = document.getElementById("aboutHeroSignUpBtn");
    const createAccountBtn = document.getElementById("aboutCtaCreateAccountBtn");
    const loggedIn = typeof isLoggedIn === "function" && isLoggedIn();

    if (signUpBtn && loggedIn) {
        signUpBtn.style.display = "none";
    }
    if (createAccountBtn && loggedIn) {
        createAccountBtn.style.display = "none";
    }
}

document.addEventListener("DOMContentLoaded", initAboutPage);