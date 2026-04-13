import React, { useEffect, useRef } from 'react';

interface VideoPlayerProps {
    videoUrl: string;
    startSeconds: number;
    isPlaying: boolean;
    serverStartTime: number;
}

export default function VideoPlayer({ videoUrl, startSeconds, isPlaying, serverStartTime }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isPlaying && videoUrl) {
            // 1. Tính toán thời gian đáng lẽ video phải chạy tới đâu rồi
            const now = Date.now();
            const expectedVideoTime = startSeconds + ((now - serverStartTime) / 1000);

            // Tua video đến đúng vị trí đó
            video.currentTime = expectedVideoTime;
            video.play().catch(e => console.error("Trình duyệt chặn autoplay:", e));

            // 2. CẢNH SÁT TUẦN TRA (Heartbeat Sync): Chống lag và chống ẩn tab
            const syncInterval = setInterval(() => {
                const currentExpectedTime = startSeconds + ((Date.now() - serverStartTime) / 1000);

                // Nếu video bị chậm hoặc nhanh hơn Server quá 0.5 giây -> Ép tua lại cho chuẩn
                if (Math.abs(video.currentTime - currentExpectedTime) > 0.5) {
                    console.log(`Đồng bộ lại video! Lệch: ${video.currentTime - currentExpectedTime}s`);
                    video.currentTime = currentExpectedTime;
                }
            }, 1000); // Check mỗi 1 giây

            return () => clearInterval(syncInterval);
        } else {
            video.pause();
        }
    }, [isPlaying, serverStartTime, startSeconds, videoUrl]);

    if (!videoUrl) {
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
                src={videoUrl}
                width="100%"
                height="100%"
                style={{ objectFit: 'cover' }}
                autoPlay={false}
                controls={false} // Chặn người dùng tự ý tua video
            />
        </div>
    );
}