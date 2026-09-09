"use strict";

/*
|--------------------------------------------------------------------------
| TraidiumX Blog Page - Backend Connected
|--------------------------------------------------------------------------
| Source of truth: Flask API + MongoDB blog_posts / blog_subscribers.
| No frontend JSON/static fallback is used for company handover flow.
|--------------------------------------------------------------------------
*/

let blogPosts = [];
let blogCategories = [{ name: "All", count: 0 }];
let activeCategory = "All";
let activeSort = "latest";
let activeSearch = "";
let searchDebounceTimer = null;

const featuredHeroTitle = document.getElementById("featuredHeroTitle");
const featuredHeroExcerpt = document.getElementById("featuredHeroExcerpt");
const featuredHeroLink = document.getElementById("featuredHeroLink");
const featuredReadTime = document.getElementById("featuredReadTime");
const featuredArticleCard = document.getElementById("featuredArticleCard");

const blogSearchInput = document.getElementById("blogSearchInput");
const blogSortSelect = document.getElementById("blogSortSelect");
const blogCategoryTabs = document.getElementById("blogCategoryTabs");
const blogCardsGrid = document.getElementById("blogCardsGrid");
const blogEmptyState = document.getElementById("blogEmptyState");

const recentPostsList = document.getElementById("recentPostsList");
const popularTagsList = document.getElementById("popularTagsList");
const blogDataStatus = document.getElementById("blogDataStatus");

const newsletterForm = document.getElementById("newsletterForm");
const newsletterEmail = document.getElementById("newsletterEmail");
const newsletterMessage = document.getElementById("newsletterMessage");

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
}

function showMiniMessage(message, type = "success") {
    let messageBox = document.getElementById("blogMiniMessage");

    if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.id = "blogMiniMessage";
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

function setBlogStatus(message, type = "success") {
    if (!blogDataStatus) {
        return;
    }

    const typeClass = type === "error"
        ? "border-red-400/20 bg-red-400/10 text-red-300"
        : "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";

    blogDataStatus.className = `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black ${typeClass}`;
    blogDataStatus.innerHTML = `
        <span class="h-2 w-2 rounded-full ${type === "error" ? "bg-red-400" : "bg-emerald-400"}"></span>
        <span>${escapeHtml(message)}</span>
    `;
}

function getPostUrl(post) {
    return `./blog-details.html?slug=${encodeURIComponent(post.slug)}`;
}

function getCategoryColor(category) {
    const colors = {
        Futures: "text-cyan-400 bg-cyan-400/10",
        Options: "text-purple-300 bg-purple-400/10",
        Risk: "text-red-400 bg-red-400/10",
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
            <svg class="h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
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
        Futures: "bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 shadow-xl shadow-cyan-500/10",
        Options: "bg-purple-500/10 border border-purple-400/30 text-purple-400 shadow-xl shadow-purple-500/10",
        Risk: "bg-red-500/10 border border-red-400/30 text-red-400 shadow-xl shadow-red-500/10",
        Fees: "bg-emerald-500/10 border border-emerald-400/30 text-emerald-400 shadow-xl shadow-emerald-500/10",
        Security: "bg-blue-500/10 border border-blue-400/30 text-blue-400 shadow-xl shadow-blue-500/10"
    };

    return styles[category] || "bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 shadow-xl shadow-cyan-500/10";
}

function getFilteredTags() {
    return [...new Set(blogPosts.flatMap((post) => post.tags || []))].sort();
}

function renderFeaturedPost() {
    const featuredPost = blogPosts.find((post) => post.featured) || blogPosts[0];

    if (!featuredPost) {
        if (featuredArticleCard) {
            featuredArticleCard.innerHTML = "";
        }
        return;
    }

    if (featuredHeroTitle) featuredHeroTitle.textContent = featuredPost.title;
    if (featuredHeroExcerpt) featuredHeroExcerpt.textContent = featuredPost.excerpt;
    if (featuredReadTime) featuredReadTime.textContent = featuredPost.readTime;

    if (featuredHeroLink) {
        featuredHeroLink.href = getPostUrl(featuredPost);
    }

    if (featuredArticleCard) {
        featuredArticleCard.innerHTML = `
            <div class="blog-featured-art">
                <div class="blog-featured-symbol ${getCategoryArtStyle(featuredPost.category)}">
                    ${getCategoryIcon(featuredPost.category)}
                </div>
            </div>

            <div class="p-6 sm:p-8 lg:p-10">
                <div class="mb-5 flex flex-wrap items-center gap-3">
                    <span class="rounded-full px-3 py-1 text-xs font-black ${getCategoryColor(featuredPost.category)}">
                        ${escapeHtml(featuredPost.category)}
                    </span>

                    <span class="text-xs font-black text-slate-500">${escapeHtml(featuredPost.readTime)}</span>
                    <span class="text-xs font-black text-cyan-400">Backend Article</span>
                </div>

                <h3 class="text-3xl font-black leading-tight sm:text-4xl">
                    ${escapeHtml(featuredPost.title)}
                </h3>

                <p class="mt-4 leading-8 text-slate-400">
                    ${escapeHtml(featuredPost.excerpt)}
                </p>

                <div class="mt-6 flex flex-wrap gap-2">
                    ${(featuredPost.tags || []).map((tag) => {
                        return `<span class="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-400">#${escapeHtml(tag)}</span>`;
                    }).join("")}
                </div>

                <a href="${getPostUrl(featuredPost)}" class="mt-8 inline-flex rounded-full bg-cyan-400 px-7 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300">
                    Read Article →
                </a>
            </div>
        `;
    }
}

function renderCategoryTabs() {
    if (!blogCategoryTabs) {
        return;
    }

    const categories = blogCategories.length ? blogCategories : [{ name: "All", count: blogPosts.length }];

    blogCategoryTabs.innerHTML = categories
        .map((categoryItem) => {
            const categoryName = categoryItem.name || "All";
            const count = Number(categoryItem.count || 0);

            return `
                <button type="button" data-category="${escapeAttr(categoryName)}" class="blog-category-tab ${categoryName === activeCategory ? "active-blog-category" : ""}">
                    <span>${escapeHtml(categoryName)}</span>
                    <span>${count}</span>
                </button>
            `;
        })
        .join("");

    blogCategoryTabs.querySelectorAll("[data-category]").forEach((button) => {
        button.addEventListener("click", async () => {
            activeCategory = button.getAttribute("data-category") || "All";
            await loadBlogPosts({ silent: true });
            showMiniMessage(`${activeCategory} blogs selected`, "success");
        });
    });
}

function renderBlogCards() {
    if (!blogCardsGrid) {
        return;
    }

    const posts = [...blogPosts];

    blogCardsGrid.innerHTML = posts
        .map((post) => {
            return `
                <article class="blog-card">
                    <div class="blog-card-art">
                        <span class="${getCategoryArtStyle(post.category)}">
                            ${getCategoryIcon(post.category)}
                        </span>
                    </div>

                    <div class="p-5">
                        <div class="mb-4 flex flex-wrap items-center gap-3">
                            <span class="rounded-full px-3 py-1 text-xs font-black ${getCategoryColor(post.category)}">
                                ${escapeHtml(post.category)}
                            </span>

                            <span class="text-xs font-bold text-slate-500">${escapeHtml(post.readTime)}</span>
                        </div>

                        <h3 class="text-2xl font-black leading-tight text-white">
                            ${escapeHtml(post.title)}
                        </h3>

                        <p class="mt-3 min-h-[84px] leading-7 text-slate-400">
                            ${escapeHtml(post.excerpt)}
                        </p>

                        <div class="mt-5 flex items-center justify-between gap-4">
                            <div>
                                <p class="text-sm font-black text-slate-300">${escapeHtml(post.author)}</p>
                            </div>

                            <a href="${getPostUrl(post)}" class="shrink-0 rounded-full bg-cyan-400 px-5 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-300">
                                Read →
                            </a>
                        </div>
                    </div>
                </article>
            `;
        })
        .join("");

    if (blogEmptyState) {
        blogEmptyState.classList.toggle("hidden", posts.length > 0);
    }
}

function renderRecentPosts() {
    if (!recentPostsList) {
        return;
    }

    recentPostsList.innerHTML = [...blogPosts]
        .slice(0, 4)
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

function renderPopularTags() {
    if (!popularTagsList) {
        return;
    }

    const tags = getFilteredTags();

    popularTagsList.innerHTML = tags
        .map((tag) => {
            return `
                <button type="button" data-tag="${escapeAttr(tag)}" class="blog-tag-btn">
                    #${escapeHtml(tag)}
                </button>
            `;
        })
        .join("");

    popularTagsList.querySelectorAll("[data-tag]").forEach((button) => {
        button.addEventListener("click", async () => {
            const selectedTag = button.getAttribute("data-tag") || "";
            if (blogSearchInput) {
                blogSearchInput.value = selectedTag;
            }

            activeSearch = selectedTag;
            await loadBlogPosts({ silent: true });
            showMiniMessage(`${selectedTag} tag applied`, "success");
        });
    });
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setNewsletterMessage(message, type = "success") {
    if (!newsletterMessage) {
        return;
    }

    newsletterMessage.classList.remove("hidden");
    newsletterMessage.textContent = message;

    if (type === "error") {
        newsletterMessage.className = "mt-3 rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-semibold text-red-300";
    } else {
        newsletterMessage.className = "mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-semibold text-emerald-300";
    }
}

function initNewsletter() {
    if (!newsletterForm) {
        return;
    }

    newsletterForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = newsletterEmail ? newsletterEmail.value.trim() : "";

        if (!validateEmail(email)) {
            setNewsletterMessage("Please enter a valid email address.", "error");
            showMiniMessage("Please enter a valid email address.", "error");
            return;
        }

        const submitButton = newsletterForm.querySelector("button[type='submit']");
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Saving...";
        }

        try {
            const response = await apiRequest("/blog/newsletter", {
                method: "POST",
                body: JSON.stringify({
                    email,
                    source: "blog_page",
                }),
            });

            setNewsletterMessage(response.message || "Subscribed successfully.", "success");
            showMiniMessage("Newsletter subscribed successfully.", "success");
            newsletterForm.reset();
        } catch (error) {
            const message = showApiError(error, "Unable to subscribe right now.");
            setNewsletterMessage(message, "error");
            showMiniMessage(message, "error");
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Subscribe";
            }
        }
    });
}

function initEvents() {
    if (blogSearchInput) {
        blogSearchInput.addEventListener("input", () => {
            window.clearTimeout(searchDebounceTimer);
            searchDebounceTimer = window.setTimeout(async () => {
                activeSearch = blogSearchInput.value.trim();
                await loadBlogPosts({ silent: true });
            }, 350);
        });
    }

    if (blogSortSelect) {
        blogSortSelect.addEventListener("change", async () => {
            activeSort = blogSortSelect.value || "latest";
            await loadBlogPosts({ silent: true });
        });
    }

    initNewsletter();
}

function renderAll() {
    renderFeaturedPost();
    renderCategoryTabs();
    renderBlogCards();
    renderRecentPosts();
    renderPopularTags();
}

async function loadBlogPosts(options = {}) {
    try {
        const params = new URLSearchParams();
        params.set("limit", "50");
        params.set("sort", activeSort || "latest");

        if (activeCategory && activeCategory !== "All") {
            params.set("category", activeCategory);
        }

        if (activeSearch) {
            params.set("search", activeSearch);
        }

        const response = await apiRequest(`/blog/posts?${params.toString()}`);
        const data = response.data || {};

        blogPosts = Array.isArray(data.posts) ? data.posts : [];
        blogCategories = Array.isArray(data.categories) ? data.categories : [{ name: "All", count: blogPosts.length }];

        renderAll();
        setBlogStatus(`${blogPosts.length} backend articles loaded · MongoDB`, "success");

        if (!options.silent) {
            initEvents();
        }
    } catch (error) {
        console.error(error);
        blogPosts = [];
        renderAll();
        setBlogStatus("Blog backend unavailable", "error");
        showMiniMessage(showApiError(error, "Unable to load blog posts from backend."), "error");
    }
}

document.addEventListener("DOMContentLoaded", () => loadBlogPosts());
