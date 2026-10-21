// TraidiumX PWA Installer Script
(function () {
  "use strict";

  // 1. Register Service Worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("/sw.js")
        .then(function (reg) {
          console.log("[PWA] Service Worker active, scope:", reg.scope);
        })
        .catch(function (err) {
          console.warn("[PWA] Registration failed:", err);
        });
    });
  }

  // Check if already running as standalone app
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    return; // Already installed and opened as app
  }

  let deferredPrompt = null;

  // Listen for Chrome / Android beforeinstallprompt
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showPwaInstallBanner();
  });

  function showPwaInstallBanner() {
    if (document.getElementById("txPwaBanner")) return;

    // Check if dismissed recently (within 24 hours)
    const dismissedAt = localStorage.getItem("tx_pwa_dismissed_at");
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < 86400000) {
      return;
    }

    const banner = document.createElement("div");
    banner.id = "txPwaBanner";
    banner.className =
      "fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-cyan-500/30 bg-slate-900/95 p-4 shadow-2xl shadow-cyan-950/80 backdrop-blur-xl transition-all duration-300 animate-fade-in";
    banner.innerHTML = `
      <div class="flex items-center gap-3">
        <img src="/assets/logo.png" alt="TraidiumX Logo" class="h-12 w-12 rounded-xl object-contain bg-slate-950/60 p-1 border border-white/10" />
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-black text-white truncate">Install TraidiumX App</h4>
          <p class="text-xs text-slate-300">Fast 1-tap mobile trading experience</p>
        </div>
        <button id="txPwaDismissBtn" class="text-slate-400 hover:text-white p-1 text-lg leading-none" aria-label="Close">&times;</button>
      </div>
      <div class="mt-3 flex items-center gap-2">
        <button id="txPwaInstallBtn" class="flex-1 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-2.5 px-4 text-xs font-black text-slate-950 shadow-lg shadow-cyan-500/25 transition hover:brightness-110 active:scale-95 text-center">
          📲 Install App
        </button>
        <button id="txPwaLaterBtn" class="rounded-xl border border-white/10 bg-white/5 py-2.5 px-3 text-xs font-bold text-slate-300 transition hover:bg-white/10">
          Later
        </button>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById("txPwaInstallBtn").addEventListener("click", async function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          console.log("[PWA] User accepted install prompt");
        }
        deferredPrompt = null;
      }
      dismissBanner();
    });

    document.getElementById("txPwaDismissBtn").addEventListener("click", dismissBanner);
    document.getElementById("txPwaLaterBtn").addEventListener("click", dismissBanner);
  }

  function dismissBanner() {
    const banner = document.getElementById("txPwaBanner");
    if (banner) {
      banner.style.opacity = "0";
      banner.style.transform = "translateY(20px)";
      setTimeout(() => banner.remove(), 300);
    }
    localStorage.setItem("tx_pwa_dismissed_at", Date.now().toString());
  }

  window.addEventListener("appinstalled", function () {
    console.log("[PWA] TraidiumX was installed successfully");
    dismissBanner();
  });
})();
