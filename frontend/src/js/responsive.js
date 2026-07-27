"use strict";

/* Keeps mobile browser chrome/orientation changes from creating clipped layouts. */
(function initTraidiumXResponsiveViewport() {
    const root = document.documentElement;
    let frame = 0;

    function syncViewport() {
        frame = 0;
        const viewport = window.visualViewport;
        const width = Math.round(viewport?.width || window.innerWidth || root.clientWidth || 0);
        const height = Math.round(viewport?.height || window.innerHeight || root.clientHeight || 0);

        if (height > 0) {
            root.style.setProperty("--tx-viewport-height", `${height}px`);
        }

        const mode = width >= 1920
            ? "projector"
            : width >= 1181
                ? "desktop"
                : width >= 768
                    ? "tablet"
                    : "mobile";

        root.dataset.txViewport = mode;
    }

    function requestSync() {
        if (frame) return;
        frame = window.requestAnimationFrame(syncViewport);
    }

    syncViewport();
    window.addEventListener("resize", requestSync, { passive: true });
    window.addEventListener("orientationchange", requestSync, { passive: true });
    window.visualViewport?.addEventListener("resize", requestSync, { passive: true });
})();
