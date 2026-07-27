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
        icon: "⚖️",
        title: "Compliance First",
        description: "Product flow is prepared for KYC, AML, risk disclosures and legal policy pages."
    },
    {
        icon: "🧠",
        title: "Trader Education",
        description: "Blog, challenge and risk pages help users understand futures and options before trading."
    },
    {
        icon: "🚀",
        title: "Execution Clarity",
        description: "Trading screens are designed to show price, pair, leverage, order mode and risk clearly."
    },
    {
        icon: "💰",
        title: "Transparent Fees",
        description: "Maker, taker, VIP tier and campaign calculations are kept visible to the user."
    },
    {
        icon: "🔐",
        title: "Security Planning",
        description: "Backend phase should include secure auth, audit logs, wallet checks and admin verification."
    },
    {
        icon: "🇮🇳",
        title: "India Focused",
        description: "INR support, local compliance preparation and India-first trading experience are planned."
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
                    <div class="text-5xl">${value.icon}</div>
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
}

document.addEventListener("DOMContentLoaded", initAboutPage);