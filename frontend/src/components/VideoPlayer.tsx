import { useEffect, useRef } from "react";
import { API_BASE_URL } from "../constants/api";

interface VideoPlayerProps {
    videoUrl: string;
    startSeconds: number;
    isPlaying: boolean;
    serverStartTime: number;
    muted?: boolean;
}

export default function VideoPlayer({ videoUrl, startSeconds, isPlaying, serverStartTime, muted = false }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const resolvedVideoUrl = (() => {
        if (!videoUrl) return "";

        if (videoUrl.startsWith("http://localhost:8080") || videoUrl.startsWith("https://localhost:8080")
            || videoUrl.startsWith("http://127.0.0.1:8080") || videoUrl.startsWith("https://127.0.0.1:8080")) {
            return videoUrl.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1):8080/, API_BASE_URL);
        }

        if (videoUrl.startsWith("/")) {
            return `${API_BASE_URL}${videoUrl}`;
        }

        return videoUrl;
    })();

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        video.muted = muted;

        if (isPlaying && resolvedVideoUrl) {
            const now = Date.now();
            const expectedVideoTime = startSeconds + ((now - serverStartTime) / 1000);

            video.currentTime = expectedVideoTime;
            video.play().catch(e => console.error("Trình duyệt chặn autoplay:", e));

            const syncInterval = setInterval(() => {
                const currentExpectedTime = startSeconds + ((Date.now() - serverStartTime) / 1000);

                if (Math.abs(video.currentTime - currentExpectedTime) > 0.5) {
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
        </div>
    );
}
