"use strict";

(function () {
    const video = document.getElementById("webcam");
    const preview = document.getElementById("selfiePreview");
    const loading = document.getElementById("cameraLoading");
    const errorEl = document.getElementById("selfieError");
    const loadingMsg = document.getElementById("loadingMsg");

    const cameraContainer = document.getElementById("cameraContainer");
    const scannerOverlay = document.getElementById("scannerOverlay");
    const scannerStatusText = document.getElementById("scannerStatusText");
    const analyzingOverlay = document.getElementById("analyzingOverlay");
    const inBoxErrorOverlay = document.getElementById("inBoxErrorOverlay");
    const inBoxErrorText = document.getElementById("inBoxErrorText");
    const inBoxRetryBtn = document.getElementById("inBoxRetryBtn");

    const shutterArea = document.getElementById("shutterArea");
    const captureSnapBtn = document.getElementById("captureSnapBtn");
    const fallbackCaptureBtn = document.getElementById("fallbackCaptureBtn");

    const postCaptureActions = document.getElementById("postCaptureActions");
    const retakeBtn = document.getElementById("retakeBtn");
    const submitBtn = document.getElementById("submitBtn");

    const selfieMainContainer = document.getElementById("selfieMainContainer");
    const successCard = document.getElementById("successCard");
    const nativeCameraInput = document.getElementById("nativeCameraInput");

    let localStream = null;
    let capturedBlob = null;
    let isFallbackMode = false;

    // Helper: Display error directly inside the camera box
    function showError(msg) {
        if (analyzingOverlay) {
            analyzingOverlay.classList.add("hidden");
        }
        if (inBoxErrorText) {
            inBoxErrorText.textContent = msg || "Face verification failed. Please align your face and retake.";
        }
        if (inBoxErrorOverlay) {
            inBoxErrorOverlay.classList.remove("hidden");
        }
        if (cameraContainer) {
            cameraContainer.classList.add("has-error");
        }
        if (scannerOverlay) {
            scannerOverlay.classList.add("hidden");
        }
        if (errorEl) {
            errorEl.textContent = "";
        }
    }

    // Helper: Clear error state and box styling
    function clearError() {
        if (inBoxErrorOverlay) {
            inBoxErrorOverlay.classList.add("hidden");
        }
        if (analyzingOverlay) {
            analyzingOverlay.classList.add("hidden");
        }
        if (cameraContainer) {
            cameraContainer.classList.remove("has-error");
        }
        if (errorEl) {
            errorEl.textContent = "";
        }
    }

    // 1. Process Authentication Token from URL Query Params or Short Code
    async function initAuthentication() {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get("token");
        if (token) {
            localStorage.setItem("traidiumx_auth_token", token);
            return true;
        }

        const code = urlParams.get("code");
        if (code) {
            try {
                if (loading) {
                    loading.classList.remove("hidden");
                    if (loadingMsg) loadingMsg.textContent = "Resolving session...";
                }
                const response = await apiRequest(`/kyc/resolve-code/${encodeURIComponent(code)}`);
                const resolvedToken = response?.data?.token;
                if (resolvedToken) {
                    localStorage.setItem("traidiumx_auth_token", resolvedToken);
                    return true;
                }
            } catch (err) {
                console.error("Failed to resolve session code:", err);
                showError("Session code has expired or is invalid. Please scan again.");
                if (loading) loading.classList.add("hidden");
                return false;
            }
        }

        const authToken = localStorage.getItem("traidiumx_auth_token");
        if (authToken) {
            return true;
        }

        showError("Authentication token is missing. Please scan the QR code again.");
        if (loading) loading.classList.add("hidden");
        return false;
    }

    // 2. Start Mobile Camera or Switch to Fallback
    async function startCamera() {
        clearError();

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("Webcam stream not supported in this context. Falling back to device camera.");
            isFallbackMode = true;

            if (loading) loading.classList.add("hidden");
            if (video) video.classList.add("hidden");
            if (preview) preview.classList.add("hidden");
            if (scannerOverlay) scannerOverlay.classList.add("hidden");
            if (captureSnapBtn) captureSnapBtn.classList.add("hidden");
            if (fallbackCaptureBtn) {
                fallbackCaptureBtn.classList.remove("hidden");
                fallbackCaptureBtn.textContent = "Open Device Camera";
            }
            showError("Live stream is restricted on HTTP connections. Tap 'Open Device Camera' to capture.");
            return;
        }

        try {
            if (loading) {
                loading.classList.remove("hidden");
                if (loadingMsg) loadingMsg.textContent = "Starting biometric camera...";
            }

            localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "user",
                    width: { ideal: 720 },
                    height: { ideal: 960 }
                },
                audio: false
            });

            if (video) {
                video.srcObject = localStream;
                video.classList.remove("hidden");
                video.onloadedmetadata = () => {
                    video.play();
                };
            }
            if (preview) preview.classList.add("hidden");
            if (loading) loading.classList.add("hidden");
            if (scannerOverlay) {
                scannerOverlay.classList.remove("hidden");
                if (scannerStatusText) scannerStatusText.textContent = "Position face inside frame";
            }
            if (shutterArea) shutterArea.classList.remove("hidden");
            if (captureSnapBtn) captureSnapBtn.classList.remove("hidden");
            if (postCaptureActions) postCaptureActions.classList.add("hidden");
        } catch (err) {
            console.error("Camera access error:", err);
            isFallbackMode = true;
            if (loading) loading.classList.add("hidden");
            if (video) video.classList.add("hidden");
            if (scannerOverlay) scannerOverlay.classList.add("hidden");
            if (captureSnapBtn) captureSnapBtn.classList.add("hidden");
            if (fallbackCaptureBtn) fallbackCaptureBtn.classList.remove("hidden");
            showError("Unable to access live camera. Tap 'Open Device Camera' to take photo.");
        }
    }

    function stopCamera() {
        if (localStream) {
            localStream.getTracks().forEach((track) => track.stop());
            localStream = null;
        }
    }

    // 3. Capture Live Webcam Photo
    function captureLiveWebcamPhoto() {
        if (!video || !video.videoWidth || !video.videoHeight) {
            showError("Camera feed is not ready. Try again.");
            return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        // Mirror snap to match user preview
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (!blob) {
                showError("Failed to capture snapshot. Try again.");
                return;
            }
            capturedBlob = blob;

            const imgUrl = URL.createObjectURL(blob);
            if (preview) {
                preview.src = imgUrl;
                preview.classList.remove("hidden");
            }
            if (video) video.classList.add("hidden");
            if (scannerOverlay) scannerOverlay.classList.add("hidden");

            stopCamera();

            // Toggle Controls to Review Mode
            if (shutterArea) shutterArea.classList.add("hidden");
            if (postCaptureActions) postCaptureActions.classList.remove("hidden");
            clearError();
        }, "image/jpeg", 0.92);
    }

    // 4. Native Camera Fallback Listener
    if (nativeCameraInput) {
        nativeCameraInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                capturedBlob = file;
                const imgUrl = URL.createObjectURL(file);

                if (preview) {
                    preview.src = imgUrl;
                    preview.classList.remove("hidden");
                }
                if (video) video.classList.add("hidden");
                if (loading) loading.classList.add("hidden");
                if (scannerOverlay) scannerOverlay.classList.add("hidden");

                if (shutterArea) shutterArea.classList.add("hidden");
                if (postCaptureActions) postCaptureActions.classList.remove("hidden");
                clearError();
            }
        });
    }

    // 5. Retake Action
    function retakePhoto() {
        capturedBlob = null;
        clearError();
        if (preview) {
            preview.classList.add("hidden");
            preview.src = "";
        }
        if (shutterArea) shutterArea.classList.remove("hidden");
        if (postCaptureActions) postCaptureActions.classList.add("hidden");

        startCamera();
    }

    // 6. Submit Selfie to Backend
    async function submitSelfie() {
        if (!capturedBlob) {
            showError("No photo captured to submit.");
            return;
        }

        try {
            clearError();
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Verifying & Uploading...";
            }
            if (retakeBtn) retakeBtn.disabled = true;

            // Show dedicated Biometric Analyzing Screen over the box
            if (scannerOverlay) scannerOverlay.classList.add("hidden");
            if (analyzingOverlay) analyzingOverlay.classList.remove("hidden");

            const formData = new FormData();
            formData.append("selfie", capturedBlob, "mobile_selfie.jpg");

            await apiRequest("/kyc/submit", {
                method: "POST",
                body: formData
            });

            if (analyzingOverlay) analyzingOverlay.classList.add("hidden");
            if (selfieMainContainer) selfieMainContainer.classList.add("hidden");
            if (successCard) successCard.classList.remove("hidden");
        } catch (err) {
            console.error("Selfie upload failed:", err);
            if (analyzingOverlay) analyzingOverlay.classList.add("hidden");
            showError(err.message || "Selfie verification failed. Please retake photo with clear lighting.");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit Selfie";
            }
            if (retakeBtn) retakeBtn.disabled = false;
        }
    }

    // Event Bindings
    if (captureSnapBtn) captureSnapBtn.addEventListener("click", captureLiveWebcamPhoto);
    if (fallbackCaptureBtn) {
        fallbackCaptureBtn.addEventListener("click", () => {
            if (nativeCameraInput) nativeCameraInput.click();
        });
    }
    if (retakeBtn) retakeBtn.addEventListener("click", retakePhoto);
    if (submitBtn) submitBtn.addEventListener("click", submitSelfie);
    if (inBoxRetryBtn) inBoxRetryBtn.addEventListener("click", retakePhoto);

    // Initialize on page ready
    window.addEventListener("DOMContentLoaded", async () => {
        const authenticated = await initAuthentication();
        if (authenticated) {
            startCamera();
        }
    });
})();

