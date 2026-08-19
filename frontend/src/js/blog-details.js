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

function getCategoryColor(category) {
    const colors = {
        Futures: "text-cyan-400 bg-cyan-400/10",
        Options: "text-purple-300 bg-purple-400/10",
        Risk: "text-orange-300 bg-orange-400/10",
        Fees: "text-emerald-400 bg-emerald-400/10",
        Security: "text-blue-300 bg-blue-400/10"
    };

    return colors[category] || "text-cyan-400 bg-cyan-400/10";
}

function getCategoryIcon(category) {
    const icons = {
        Futures: `
            <svg class="h-12 w-12 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
        `,
        Options: `
            <svg class="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        `,
        Risk: `
            <svg class="h-12 w-12 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
        `,
        Fees: `
            <svg class="h-12 w-12 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        `,
        Security: `
            <svg class="h-12 w-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
        `
    };

    return icons[category] || `
        <svg class="h-12 w-12 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
    `;
}

function getCategoryArtStyle(category) {
    const styles = {
        Futures: "bg-cyan-950/40 border border-cyan-500/20 text-cyan-400 shadow-xl shadow-cyan-950/40",
        Options: "bg-purple-950/40 border border-purple-500/20 text-purple-400 shadow-xl shadow-purple-950/40",
        Risk: "bg-orange-950/40 border border-orange-500/20 text-orange-400 shadow-xl shadow-orange-950/40",
        Fees: "bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 shadow-xl shadow-emerald-950/40",
        Security: "bg-blue-950/40 border border-blue-500/20 text-blue-400 shadow-xl shadow-blue-950/40"
    };

    return styles[category] || "bg-cyan-950/40 border border-cyan-500/20 text-cyan-400 shadow-xl shadow-cyan-950/40";
}

function getPostUrl(post) {
    return `./blog-details.html?slug=${encodeURIComponent(post.slug)}`;
}

function renderArticle(post) {
    if (!blogDetailsArticle) {
        return;
    }

    document.title = `${post.title} | TraidiumX`;

    blogDetailsArticle.innerHTML = `
        <div class="mb-6 flex flex-wrap items-center gap-3">
            <span class="rounded-full px-3 py-1 text-xs font-black ${getCategoryColor(post.category)}">
                ${escapeHtml(post.category)}
            </span>
        </div>

        <h1 class="text-4xl font-black leading-tight sm:text-6xl">
            ${escapeHtml(post.title)}
        </h1>

        <p class="mt-5 text-lg leading-8 text-slate-300">
            ${escapeHtml(post.excerpt)}
        </p>

        <div class="my-8 h-[280px] rounded-[2rem] border border-cyan-400/20 bg-cyan-400/[0.06] blog-details-art">
            <div class="blog-details-symbol ${getCategoryArtStyle(post.category)}">
                ${getCategoryIcon(post.category)}
            </div>
        </div>

        <div class="blog-content-prose">
            ${(post.content || []).map((paragraph) => {
                return `<p>${escapeHtml(paragraph)}</p>`;
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
