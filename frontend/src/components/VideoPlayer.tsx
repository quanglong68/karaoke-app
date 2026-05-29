import { useEffect, useRef } from "react";

interface VideoPlayerProps {
    videoUrl: string;
    nextVideoUrl?: string | null;
    startSeconds: number;
    isPlaying: boolean;
    serverStartTime: number;
    muted?: boolean;
}

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
            preloadVideo.preload = "auto";
            preloadVideo.load();
        }
    }, [resolvedNextVideoUrl]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        video.muted = muted;
        video.preload = "auto";

        if (resolvedVideoUrl) {
            video.load();
        }

        if (isPlaying && resolvedVideoUrl) {
            const startPlayback = () => {
                const now = Date.now();
                const expectedVideoTime = startSeconds + ((now - serverStartTime) / 1000);

                if (Number.isFinite(expectedVideoTime) && expectedVideoTime >= 0) {
                    video.currentTime = expectedVideoTime;
                }

                video.play().catch(e => console.error("Trình duyệt chặn autoplay:", e));
            };

            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                startPlayback();
            } else {
                video.addEventListener("canplay", startPlayback, { once: true });
            }

            const syncInterval = setInterval(() => {
                const currentExpectedTime = startSeconds + ((Date.now() - serverStartTime) / 1000);

                if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Math.abs(video.currentTime - currentExpectedTime) > 0.5) {
                    console.log(`Đồng bộ lại video! Lệch: ${video.currentTime - currentExpectedTime}s`);
                    video.currentTime = currentExpectedTime;
                }
            }, 1000);

            return () => clearInterval(syncInterval);
        } else {
            video.pause();
        }
    }, [isPlaying, serverStartTime, startSeconds, resolvedVideoUrl, muted]);

    if (!resolvedVideoUrl) {
        return (
            <div style={{
                width: '100%', height: '100%', background: '#000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', border: '1px solid #333', borderRadius: '8px'
            }}>
                <h3>Đang chờ bài hát...</h3>
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
            <video
                ref={videoRef}
                src={resolvedVideoUrl}
                width="100%"
                height="100%"
                style={{ objectFit: 'cover' }}
                muted={muted}
                autoPlay={false}
                controls={false}
            />
            <video
                ref={preloadRef}
                aria-hidden="true"
                tabIndex={-1}
                style={{ display: 'none' }}
                muted
                playsInline
                preload="auto"
            />
        </div>
    );
}
