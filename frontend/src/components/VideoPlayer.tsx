import React, { useEffect, useRef } from 'react';
// Import kiểu này để tránh lỗi TypeScript strict mode
import YouTube, { type YouTubeProps, type YouTubePlayer } from 'react-youtube';

interface VideoPlayerProps {
    videoId: string;
    startSeconds: number;
    endSeconds: number;
    isPlaying: boolean;
}

export default function VideoPlayer({ videoId, startSeconds, endSeconds, isPlaying }: VideoPlayerProps) {
    const playerRef = useRef<YouTubePlayer | null>(null);

    // Cấu hình Player
    const opts: YouTubeProps['opts'] = {
        height: '300',
        width: '500',
        playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            start: startSeconds, // Thông số start ban đầu
            end: endSeconds,
        },
    };

    // Khi player tải xong, ép nó nhảy đến đúng giây start
    const onPlayerReady: YouTubeProps['onReady'] = (event) => {
        playerRef.current = event.target;
        event.target.seekTo(startSeconds, true);
        event.target.playVideo();
    };

    // NHIỆM VỤ 1: CHUYỂN BÀI HOẶC ĐỔI ĐOẠN NHẠC
    // Chỉ chạy khi Server gửi bài hát mới hoặc mốc thời gian mới (videoId, startSeconds thay đổi)
    useEffect(() => {
        if (playerRef.current && videoId) {
            // Có bài mới là bắt buộc phải tua đến đúng điểm xuất phát
            playerRef.current.seekTo(startSeconds, true);
        }
    }, [videoId, startSeconds]); // <-- Chỉ lắng nghe thời gian và id bài hát


    // NHIỆM VỤ 2: QUẢN LÝ CHẠY / DỪNG (BATTLE / PERFORMANCE)
    // Chỉ chạy khi Server ra lệnh dừng đập nút hoặc cho phép hát tiếp (isPlaying thay đổi)
    useEffect(() => {
        if (!playerRef.current) return;

        try {
            if (isPlaying) {
                // Chỉ ra lệnh hát tiếp từ vị trí hiện tại. KHÔNG TUA nữa!
                playerRef.current.playVideo();
            } else {
                // Lệnh dừng nhạc để đập nút
                playerRef.current.pauseVideo();
            }
        } catch (error) {
            console.warn("YouTube Player đang bận, bỏ qua nhịp này:", error);
        }
    }, [isPlaying]); // <-- Chỉ lắng nghe trạng thái Play/Pause

    // Nếu isPlaying = false thì hiện màn hình chờ
    if (!videoId) {
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