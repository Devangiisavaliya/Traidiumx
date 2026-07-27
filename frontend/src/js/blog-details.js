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

            <span class="text-xs font-black text-slate-500">${escapeHtml(post.date)}</span>
            <span class="text-xs font-black text-slate-500">${escapeHtml(post.readTime)}</span>
            <span class="text-xs font-black text-cyan-400">${Number(post.views || 0).toLocaleString()} views</span>
            <span class="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-300">Backend Article</span>
        </div>

        <h1 class="text-4xl font-black leading-tight sm:text-6xl">
            ${escapeHtml(post.title)}
        </h1>

        <p class="mt-5 text-lg leading-8 text-slate-300">
            ${escapeHtml(post.excerpt)}
        </p>

        <div class="mt-6 flex flex-wrap gap-2">
            ${(post.tags || []).map((tag) => {
                return `<span class="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-400">#${escapeHtml(tag)}</span>`;
            }).join("")}
        </div>

        <div class="my-8 h-[280px] rounded-[2rem] border border-cyan-400/20 bg-cyan-400/[0.06] blog-details-art">
            <div class="blog-details-symbol">${escapeHtml(post.category || "T").slice(0, 1)}</div>
        </div>

        <div class="blog-content-prose">
            ${(post.content || []).map((paragraph) => {
                return `<p>${escapeHtml(paragraph)}</p>`;
            }).join("")}
        </div>

        <div class="mt-10 rounded-[2rem] border border-orange-400/20 bg-orange-400/10 p-5">
            <h3 class="text-xl font-black text-orange-300">Important Risk Note</h3>

            <p class="mt-3 leading-7 text-orange-100">
                This article is for education and platform guidance only. It is not financial advice.
                Live trading decisions must be made with independent judgement and strict risk control.
            </p>
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
