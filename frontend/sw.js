// TraidiumX PWA Service Worker - v1.0
const CACHE_NAME = "traidiumx-pwa-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/assets/logo.png",
  "/dist/output.css",
  "/src/css/custom.css",
  "/src/css/responsive.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[PWA] Asset caching skipped on install:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Network-first strategy: Trading apps must always fetch live market & balance data
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls, WebSocket feeds, or mutations
  if (
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api") ||
    url.pathname.includes("/admin/api")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
