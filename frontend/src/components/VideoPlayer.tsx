import React, { useEffect, useRef } from 'react';
// Import kiểu này để tránh lỗi TypeScript strict mode
import YouTube, { type YouTubeProps, type YouTubePlayer } from 'react-youtube';

interface VideoPlayerProps {
    videoId: string;
    start: number;
    end: number;
    isPlaying: boolean;
}

export default function VideoPlayer({ videoId, start, end, isPlaying }: VideoPlayerProps) {
    const playerRef = useRef<YouTubePlayer | null>(null);

    // Cấu hình Player
    const opts: YouTubeProps['opts'] = {
        height: '300',
        width: '500',
        playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            start: start, // Thông số start ban đầu
            end: end,
        },
    };

    // Khi player tải xong, ép nó nhảy đến đúng giây start
    const onPlayerReady: YouTubeProps['onReady'] = (event) => {
        playerRef.current = event.target;
        event.target.seekTo(start, true);
        event.target.playVideo();
    };

    // Khi server gửi lệnh mới (đổi bài, đổi giờ), ép player nhảy theo
    useEffect(() => {
        if (playerRef.current && isPlaying) {
            playerRef.current.seekTo(start, true);
            playerRef.current.playVideo();
        }
    }, [videoId, start, isPlaying]);

    // Nếu isPlaying = false thì hiện màn hình chờ
    if (!isPlaying) {
        return (
            <div style={{
                width: '500px', height: '300px', background: '#000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', border: '1px solid #333'
            }}>
                <h3>Đang chờ bài hát...</h3>
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', width: '500px', height: '300px', background: '#000' }}>
            {/* Lớp phủ chặn click chuột */}
            <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10
            }}></div>

            <YouTube videoId={videoId} opts={opts} onReady={onPlayerReady} />
        </div>
    );
}