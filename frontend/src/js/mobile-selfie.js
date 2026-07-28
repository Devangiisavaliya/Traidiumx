"use strict";

(function () {
    const video = document.getElementById("webcam");
    const preview = document.getElementById("selfiePreview");
    const loading = document.getElementById("cameraLoading");
    const errorEl = document.getElementById("selfieError");
    const loadingMsg = document.getElementById("loadingMsg");
    
    const captureBtn = document.getElementById("captureBtn");
    const retakeBtn = document.getElementById("retakeBtn");
    const submitBtn = document.getElementById("submitBtn");
    
    const selfieCard = document.getElementById("selfieCard");
    const successCard = document.getElementById("successCard");
    
    const nativeCameraInput = document.getElementById("nativeCameraInput");

    let localStream = null;
    let capturedBlob = null;
    let isFallbackMode = false;

    // 1. Process Authentication Token from URL Query Params
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    if (token) {
        localStorage.setItem("traidiumx_auth_token", token);
    }

    // Check if token exists
    const authToken = localStorage.getItem("traidiumx_auth_token");
    if (!authToken) {
        showError("Authentication token is missing. Please scan the QR code again.");
        if (loading) loading.classList.add("hidden");
        if (captureBtn) captureBtn.disabled = true;
        return;
    }

    // 2. Start Mobile Camera or Switch to Insecure Context Fallback
    async function startCamera() {
        // Detect insecure context (HTTP local IP) where browser disables WebRTC cameras
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("webcam stream is not supported in this context (requires HTTPS or localhost). Falling back to native device camera.");
            isFallbackMode = true;
            
            if (loading) loading.classList.add("hidden");
            if (video) video.classList.add("hidden");
            if (preview) {
                preview.src = "";
                preview.classList.add("hidden");
            }
            if (captureBtn) {
                captureBtn.textContent = "Open Device Camera";
            }
            showError("Webcam stream is restricted on HTTP connections. Using native camera fallback instead.");
            return;
        }

        try {
            if (loading) {
                loading.classList.remove("hidden");
                if (loadingMsg) loadingMsg.textContent = "Requesting camera access...";
            }
            if (errorEl) errorEl.textContent = "";

            localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "user",
                    width: { ideal: 640 },
                    height: { ideal: 800 }
                },
                audio: false
            });

            if (video) {
                video.srcObject = localStream;
                video.classList.remove("hidden");
            }
            if (preview) preview.classList.add("hidden");
            if (loading) loading.classList.add("hidden");
        } catch (err) {
            console.error("Camera access error:", err);
            isFallbackMode = true;
            if (loading) loading.classList.add("hidden");
            if (video) video.classList.add("hidden");
            if (captureBtn) {
                captureBtn.textContent = "Open Device Camera";
            }
            showError("Unable to access live webcam. Please use the native camera fallback.");
        }
    }

    function stopCamera() {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
    }

    function showError(msg) {
        if (errorEl) errorEl.textContent = msg;
    }

    // 3. Capture Action Selector
    function handleCaptureAction() {
        if (isFallbackMode) {
            if (nativeCameraInput) {
                nativeCameraInput.click();
            }
        } else {
            captureLiveWebcamPhoto();
        }
    }

    // 4. Capture Live Webcam Photo
    function captureLiveWebcamPhoto() {
        if (!video || !video.videoWidth || !video.videoHeight) {
            showError("Webcam feed is not ready. Try again.");
            return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        // Mirror snap
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
            if (video) {
                video.classList.add("hidden");
            }
            
            stopCamera();

            // Toggle buttons
            if (captureBtn) captureBtn.classList.add("hidden");
            if (retakeBtn) retakeBtn.classList.remove("hidden");
            if (submitBtn) submitBtn.classList.remove("hidden");
        }, "image/jpeg", 0.90);
    }

    // 5. Native Camera Input Event Listener
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

                if (captureBtn) captureBtn.classList.add("hidden");
                if (retakeBtn) retakeBtn.classList.remove("hidden");
                if (submitBtn) submitBtn.classList.remove("hidden");
                
                if (errorEl) errorEl.textContent = "";
            }
        });
    }

    // 6. Retake Snapshot Action
    function retakePhoto() {
        capturedBlob = null;
        if (preview) {
            preview.classList.add("hidden");
            preview.src = "";
        }
        if (captureBtn) captureBtn.classList.remove("hidden");
        if (retakeBtn) retakeBtn.classList.add("hidden");
        if (submitBtn) submitBtn.classList.add("hidden");
        
        startCamera();
    }

    // 7. Submit Snapshot to Backend
    async function submitSelfie() {
        if (!capturedBlob) {
            showError("No photo captured to submit.");
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Uploading...";
            }
            if (retakeBtn) retakeBtn.disabled = true;
            showError("");

            const formData = new FormData();
            formData.append("selfie", capturedBlob, "mobile_selfie.jpg");

            await apiRequest("/kyc/submit", {
                method: "POST",
                body: formData
            });

            if (selfieCard) selfieCard.classList.add("hidden");
            if (successCard) successCard.classList.remove("hidden");
        } catch (err) {
            console.error("Selfie upload failed:", err);
            showError(err.message || "Failed to upload selfie. Check connection and try again.");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit Selfie";
            }
            if (retakeBtn) retakeBtn.disabled = false;
        }
    }

    // Event Bindings
    if (captureBtn) captureBtn.addEventListener("click", handleCaptureAction);
    if (retakeBtn) retakeBtn.addEventListener("click", retakePhoto);
    if (submitBtn) submitBtn.addEventListener("click", submitSelfie);

    // Initialize Camera on load
    window.addEventListener("DOMContentLoaded", startCamera);
})();
