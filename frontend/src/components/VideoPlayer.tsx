import { useEffect, useRef } from "react";
import Mascot from "./ui/Mascot";

interface VideoPlayerProps {
    videoUrl: string;
    nextVideoUrl?: string | null;
    startSeconds: number;
    isPlaying: boolean;
    serverStartTime: number;
    muted?: boolean;
}

const clampToDuration = (video: HTMLVideoElement, seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return 0;
    }
    if (Number.isFinite(video.duration) && video.duration > 0) {
        return Math.min(seconds, video.duration);
    }
    return seconds;
};

export default function VideoPlayer({ videoUrl, nextVideoUrl, startSeconds, isPlaying, serverStartTime, muted = false }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const preloadRef = useRef<HTMLVideoElement>(null);
    const resolvedVideoUrl = videoUrl || "";
    const resolvedNextVideoUrl = nextVideoUrl || "";

    useEffect(() => {
        const preloadVideo = preloadRef.current;
        if (!preloadVideo) return;

        preloadVideo.pause();
        preloadVideo.removeAttribute("src");
        preloadVideo.load();

        if (resolvedNextVideoUrl) {
            preloadVideo.src = resolvedNextVideoUrl;
            // Phones share one WiFi link with the video that is actually playing, so
            // downloading the whole next song up front starves the current audio.
            preloadVideo.preload = "metadata";
            preloadVideo.load();
        }
    }, [resolvedNextVideoUrl]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        video.pause();
        if (resolvedVideoUrl) {
            video.load();
        }

        return () => {
            video.pause();
        };
    }, [resolvedVideoUrl]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = muted;
    }, [muted]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (!isPlaying || !resolvedVideoUrl) {
            video.pause();
            return;
        }

        // Take the time reference locally instead of comparing against the server clock:
        // phones are frequently seconds off from the server, which made the drift check
        // seek the video every 2 s and chopped up the audio.
        const localStart = Date.now();
        const expectedTime = () => clampToDuration(
            video,
            startSeconds + (Date.now() - localStart) / 1000,
        );

        let cancelled = false;
        // Mobile browsers refuse unmuted autoplay without a gesture, which leaves the
        // song silent. Retry on the first touch/keypress instead of leaving it dead.
        const retryOnGesture = () => {
            video.play().catch(() => undefined);
        };
        const playWithGestureFallback = () => {
            if (cancelled) return;
            video.play().catch(error => {
                console.error("Trình duyệt chặn autoplay:", error);
                document.addEventListener("pointerdown", retryOnGesture, { once: true });
                document.addEventListener("keydown", retryOnGesture, { once: true });
            });
        };
        const startPlayback = () => {
            if (cancelled) return;
            video.currentTime = expectedTime();
            playWithGestureFallback();
        };

        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            startPlayback();
        } else {
            video.addEventListener("canplay", startPlayback, { once: true });
        }

        const syncInterval = setInterval(() => {
            if (cancelled || video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
            const drift = video.currentTime - expectedTime();
            if (Math.abs(drift) > 4) {
                // Large drift means a real stall, so one hard jump is unavoidable.
                video.currentTime = expectedTime();
                video.playbackRate = 1;
            } else if (drift < -0.5) {
                video.playbackRate = 1.05;
            } else if (drift > 0.5) {
                video.playbackRate = 0.95;
            } else if (video.playbackRate !== 1) {
                video.playbackRate = 1;
            }
        }, 1000);

        return () => {
            cancelled = true;
            video.removeEventListener("canplay", startPlayback);
            document.removeEventListener("pointerdown", retryOnGesture);
            document.removeEventListener("keydown", retryOnGesture);
            video.playbackRate = 1;
            clearInterval(syncInterval);
        };
    }, [isPlaying, serverStartTime, startSeconds, resolvedVideoUrl]);

    if (!resolvedVideoUrl) {
        return (
            <div className="stage-placeholder">
                <div className="stage-placeholder-card">
                    <Mascot size={72} />
                    <h3 style={{ fontSize: "1.05rem" }}>Đang chờ bài hát...</h3>
                    <p className="p-muted p-tiny">Chủ phòng sẽ bắt đầu lượt chơi ngay thôi.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="video-surface">
            <video
                ref={videoRef}
                src={resolvedVideoUrl}
                width="100%"
                height="100%"
                muted={muted}
                autoPlay={false}
                controls={false}
                playsInline
                preload="auto"
            />
            <video
                ref={preloadRef}
                aria-hidden="true"
                tabIndex={-1}
                style={{ display: "none" }}
                muted
                playsInline
                preload="auto"
            />
        </div>
    );
}
