"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Blog Details Page - Backend Connected
|--------------------------------------------------------------------------
| Reads slug from URL and renders selected MongoDB article.
|--------------------------------------------------------------------------
*/

const blogDetailsArticle = document.getElementById("blogDetailsArticle");
const relatedPostsList = document.getElementById("relatedPostsList");

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getSlugFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("slug") || "futures-trading-basics";
}

function getCategoryTheme(category) {
    const themes = {
        Futures: {
            color: "text-cyan-400",
            badge: "bg-cyan-400/10 text-cyan-400 border border-cyan-400/20",
            bannerBg: "bg-gradient-to-br from-cyan-950/40 via-slate-950 to-blue-950/30 border border-cyan-400/20",
            iconBox: "bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 shadow-xl shadow-cyan-500/10",
            glowColor: "bg-cyan-400/15",
            pillDot: "bg-cyan-400",
            pillText: "Crypto Derivatives · Leverage · Trading Mechanics",
            icon: `<svg class="h-12 w-12 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>`
        },
        Options: {
            color: "text-purple-400",
            badge: "bg-purple-400/10 text-purple-300 border border-purple-400/20",
            bannerBg: "bg-gradient-to-br from-purple-950/40 via-slate-950 to-indigo-950/30 border border-purple-400/20",
            iconBox: "bg-purple-500/10 border border-purple-400/30 text-purple-400 shadow-xl shadow-purple-500/10",
            glowColor: "bg-purple-400/15",
            pillDot: "bg-purple-400",
            pillText: "Calls & Puts · Strike Matrix · Option Greeks",
            icon: `<svg class="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`
        },
        Risk: {
            color: "text-red-400",
            badge: "bg-red-400/10 text-red-300 border border-red-400/20",
            bannerBg: "bg-gradient-to-br from-red-950/40 via-slate-950 to-rose-950/30 border border-red-400/20",
            iconBox: "bg-red-500/10 border border-red-400/30 text-red-400 shadow-xl shadow-red-500/10",
            glowColor: "bg-red-400/15",
            pillDot: "bg-red-400",
            pillText: "Capital Protection · Risk Rules · Trade Journaling",
            icon: `<svg class="h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>`
        },
        Fees: {
            color: "text-emerald-400",
            badge: "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20",
            bannerBg: "bg-gradient-to-br from-emerald-950/40 via-slate-950 to-teal-950/30 border border-emerald-400/20",
            iconBox: "bg-emerald-500/10 border border-emerald-400/30 text-emerald-400 shadow-xl shadow-emerald-500/10",
            glowColor: "bg-emerald-400/15",
            pillDot: "bg-emerald-400",
            pillText: "Order Book Dynamics · Maker vs Taker · VIP Tiers",
            icon: `<svg class="h-12 w-12 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
        },
        Security: {
            color: "text-blue-400",
            badge: "bg-blue-400/10 text-blue-300 border border-blue-400/20",
            bannerBg: "bg-gradient-to-br from-blue-950/40 via-slate-950 to-cyan-950/30 border border-blue-400/20",
            iconBox: "bg-blue-500/10 border border-blue-400/30 text-blue-400 shadow-xl shadow-blue-500/10",
            glowColor: "bg-blue-400/15",
            pillDot: "bg-blue-400",
            pillText: "Multi-Sig Storage · 2FA Protocols · AML Compliance",
            icon: `<svg class="h-12 w-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>`
        }
    };

    return themes[category] || themes.Futures;
}

function getPostUrl(post) {
    return `./blog-details.html?slug=${encodeURIComponent(post.slug)}`;
}

function renderArticle(post) {
    if (!blogDetailsArticle) {
        return;
    }

    const theme = getCategoryTheme(post.category);
    document.title = `${post.title} | TraidiumX`;

    blogDetailsArticle.innerHTML = `
        <div class="mb-6 flex flex-wrap items-center gap-3">
            <span class="rounded-full px-3.5 py-1 text-xs font-black ${theme.badge}">
                ${escapeHtml(post.category)}
            </span>
            <span class="text-xs font-bold text-slate-500">${escapeHtml(post.readTime)}</span>
            <span class="text-xs font-bold text-slate-600">·</span>
            <span class="text-xs font-bold text-slate-400">${escapeHtml(post.date || "")}</span>
            <span class="text-xs font-bold text-slate-600">·</span>
            <span class="text-xs font-bold ${theme.color}">${escapeHtml(post.author || "TraidiumX Research")}</span>
        </div>

        <h1 class="text-3xl font-black leading-tight sm:text-5xl lg:text-6xl text-white">
            ${escapeHtml(post.title)}
        </h1>

        <p class="mt-5 text-base sm:text-lg leading-8 text-slate-300">
            ${escapeHtml(post.excerpt)}
        </p>

        <!-- Premium Themed Hero Art Banner -->
        <div class="relative my-8 overflow-hidden rounded-[2rem] ${theme.bannerBg} p-8 sm:p-10">
            <div class="absolute -left-12 -top-12 h-44 w-44 rounded-full ${theme.glowColor} blur-[60px]"></div>
            <div class="absolute -right-12 -bottom-12 h-44 w-44 rounded-full ${theme.glowColor} blur-[60px]"></div>

            <div class="relative z-10 flex flex-col items-center justify-center text-center">
                <div class="flex h-20 w-20 items-center justify-center rounded-3xl ${theme.iconBox}">
                    ${theme.icon}
                </div>
                <div class="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-4 py-1.5 text-xs font-bold text-slate-300 backdrop-blur-md">
                    <span class="h-2 w-2 rounded-full ${theme.pillDot}"></span>
                    <span>${escapeHtml(theme.pillText)}</span>
                </div>
            </div>
        </div>

        <!-- Structured Content Blocks -->
        <div class="space-y-5">
            ${(post.content || []).map((paragraph) => {
                const escaped = escapeHtml(paragraph);
                if (escaped.includes(" — ")) {
                    const [ruleTitle, ...ruleBody] = escaped.split(" — ");
                    return `
                        <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 transition hover:border-cyan-400/30 hover:bg-white/[0.05]">
                            <h4 class="text-base sm:text-lg font-black ${theme.color} mb-2">${ruleTitle}</h4>
                            <p class="text-slate-300 text-sm sm:text-base leading-relaxed">${ruleBody.join(" — ")}</p>
                        </div>
                    `;
                } else if (escaped.includes(": ")) {
                    const colonIndex = escaped.indexOf(": ");
                    const titlePrefix = escaped.substring(0, colonIndex);
                    const bodyText = escaped.substring(colonIndex + 2);
                    return `
                        <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 transition hover:border-cyan-400/30 hover:bg-white/[0.05]">
                            <h4 class="text-base sm:text-lg font-black ${theme.color} mb-2">${titlePrefix}</h4>
                            <p class="text-slate-300 text-sm sm:text-base leading-relaxed">${bodyText}</p>
                        </div>
                    `;
                }
                return `<p class="leading-relaxed text-slate-300 text-sm sm:text-base">${escaped}</p>`;
            }).join("")}
        </div>
    `;
}

function renderRelatedPosts(posts) {
    if (!relatedPostsList) {
        return;
    }

    const finalPosts = Array.isArray(posts) ? posts.slice(0, 3) : [];

    if (!finalPosts.length) {
        relatedPostsList.innerHTML = `
            <div class="rounded-2xl bg-slate-950/70 p-4 text-sm font-bold text-slate-400">
                No related article available yet.
            </div>
        `;
        return;
    }

    relatedPostsList.innerHTML = finalPosts
        .map((post) => {
            return `
                <a href="${getPostUrl(post)}" class="block rounded-2xl bg-slate-950/70 p-4 hover:bg-slate-900">
                    <p class="text-sm font-black text-white">${escapeHtml(post.title)}</p>
                    <div class="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>${escapeHtml(post.category)}</span>
                        <span>${escapeHtml(post.readTime)}</span>
                    </div>
                </a>
            `;
        })
        .join("");
}

async function loadBlogDetails() {
    try {
        const slug = getSlugFromUrl();
        const response = await apiRequest(`/blog/posts/${encodeURIComponent(slug)}?increment_view=true`);
        const data = response.data || {};

        if (!data.post) {
            throw new Error("Blog article not found in backend response.");
        }

        renderArticle(data.post);
        renderRelatedPosts(data.related_posts || []);
    } catch (error) {
        console.error(error);

        if (blogDetailsArticle) {
            blogDetailsArticle.innerHTML = `
                <h1 class="text-3xl font-black">Unable to load blog article</h1>
                <p class="mt-3 text-slate-400">${escapeHtml(showApiError(error, "Please check backend blog API and MongoDB connection."))}</p>
                <a href="./blog.html" class="mt-6 inline-flex rounded-full bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300">
                    Back to Blog
                </a>
            `;
        }
    }
}

document.addEventListener("DOMContentLoaded", loadBlogDetails);
