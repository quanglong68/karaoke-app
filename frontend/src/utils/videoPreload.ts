const PRELOAD_VIDEO_ID = "preload-video";
const DEFAULT_PRELOAD_WAIT_MS = 5000;

export const preloadVideo = (videoUrl: string): void => {
    if (!videoUrl) return;

    try {
        let existing = document.getElementById(PRELOAD_VIDEO_ID) as HTMLVideoElement | null;
        if (!existing) {
            existing = document.createElement("video");
            existing.id = PRELOAD_VIDEO_ID;
            existing.preload = "auto";
            existing.muted = true;
            existing.playsInline = true;
            existing.style.display = "none";
            document.body.appendChild(existing);
        }

        existing.pause();
        existing.removeAttribute("src");
        existing.load();
        existing.src = videoUrl;
        existing.load();
    } catch (error) {
        console.warn("Failed to preload video:", error);
    }
};

export const pausePreloadVideo = (): void => {
    const preloadEl = document.getElementById(PRELOAD_VIDEO_ID) as HTMLVideoElement | null;
    preloadEl?.pause();
};

/**
 * Waits briefly for the preloaded video to buffer enough to start, without
 * stalling the host indefinitely if the remote asset fails or times out.
 */
export const waitForPreloadReady = (onReady: () => void, timeoutMs = DEFAULT_PRELOAD_WAIT_MS): void => {
    const preloadEl = document.getElementById(PRELOAD_VIDEO_ID) as HTMLVideoElement | null;
    if (!preloadEl || preloadEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        onReady();
        return;
    }

    let settled = false;
    const cleanup = () => {
        preloadEl.removeEventListener("canplay", finish);
        preloadEl.removeEventListener("loadeddata", finish);
        preloadEl.removeEventListener("error", finish);
        window.clearTimeout(timer);
    };
    const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        onReady();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    preloadEl.addEventListener("canplay", finish);
    preloadEl.addEventListener("loadeddata", finish);
    preloadEl.addEventListener("error", finish);
};
