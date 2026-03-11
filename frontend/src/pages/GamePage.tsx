import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import VideoPlayer from "../components/VideoPlayer";
import type { SocketMessage } from "../types/socket";
import type { GameState, MusicInfo } from "../types/game";
import { websocketService } from "../services/websocketService";

export default function GamePage() {
    const { roomId } = useParams();
    const [messages, setMessages] = useState<SocketMessage[]>([]);
    const [inputMessage, setInputMessage] = useState("");
    const userName = localStorage.getItem("userName") || "Người chơi ẩn danh";
    const userId = localStorage.getItem("userId") || "";
    const [gameState, setGameState] = useState<GameState>("LOBBY");
    const [clickCount, setClickCount] = useState(0);
    const [winner, setWinner] = useState<string | null>(null);

    const [musicInfo, setMusicInfo] = useState<MusicInfo>({
        videoId: "",
        startSeconds: 0,
        endSeconds: 0,
        isPlaying: false,
    });
    useEffect(() => {
        if (roomId) {
            console.log("Connecting to WebSocket for room:", roomId);
            websocketService.connect(roomId, (message) => {
                if (message.type === "CHAT") {
                    setMessages((prevMessages) => [...prevMessages, message]);
                } else if (message.type === "PLAY_SEGMENT") {
                    try {
                        const state = message.content as MusicInfo;
                        setMusicInfo(state);
                        setGameState("PLAY_SEGMENT");
                        setClickCount(0);
                    } catch (error) {
                        console.error("Failed to parse game state message", error);
                    }
                } else if (message.type === "PAUSE") {
                    setMusicInfo((prevState) => ({
                        ...prevState,
                        isPlaying: false,
                    }));
                } else if (message.type === "BATTLE") {
                    console.log("Bắt đầu vòng BATTLE!");
                    setGameState("BATTLE");
                    setMusicInfo(prev => ({ ...prev, isPlaying: false }));
                } else if (message.type === "PERFORMANCE") {
                    console.log("Người chiến thắng là:", message.content);
                    setGameState("PERFORMANCE");
                    if (typeof message.content !== "string" && "userName" in message.content) {
                        setWinner(message.content.userName);
                    }
                    setMusicInfo(prev => ({ ...prev, isPlaying: true }));
                }

            });

            return () => {
                websocketService.disconnect();
            }
        }
    }, [roomId]);
    const sendPlayCommand = (vid: string, s: number, e: number) => {
        const payload: MusicInfo = { videoId: vid, startSeconds: s, endSeconds: e, isPlaying: true };
        websocketService.sendMessage(roomId!, {
            type: "PLAY_SEGMENT",
            content: payload,
            sender: userName,
            roomId: roomId!
        });
    };
    const handleBuzzerClick = () => {
        if (!roomId) return;

        setClickCount(prev => prev + 1);
        websocketService.sendMessage(roomId, {
            type: "VOTE",
            content: "",
            sender: userId,
            roomId: roomId!
        });
    };

    const sendPauseCommand = () => {
        websocketService.sendMessage(roomId!, {
            type: "PAUSE",
            content: "",
            sender: userName,
            roomId: roomId!
        });
    };
    const handleSendMessage = () => {
        if (roomId && inputMessage.trim()) {
            websocketService.sendMessage(roomId, {
                type: "CHAT",
                content: inputMessage,
                sender: userName,
                roomId: roomId
            });
            setInputMessage("");
        }
    };
    return (
        <div>
            <h1>Phòng: {roomId}</h1>

            <hr />
            <h3>1. Màn hình Karaoke</h3>
            {/* {gameState === "BATTLE" ? (
                <div className="buzzer-container">
                    <button onClick={handleBuzzerClick}>BẤM NGAY!</button>
                </div>
            ) : (
                <VideoPlayer
                    videoId={musicInfo.videoId}
                    startSeconds={musicInfo.startSeconds}
                    endSeconds={musicInfo.endSeconds}
                    isPlaying={musicInfo.isPlaying}
                />
            )} */}
            <div style={{ position: "relative" }}>
                <VideoPlayer
                    videoId={musicInfo.videoId}
                    startSeconds={musicInfo.startSeconds}
                    endSeconds={musicInfo.endSeconds}
                    isPlaying={musicInfo.isPlaying}
                />
                {gameState === "BATTLE" && (
                    <div className="buzzer-container" style={{
                        position: 'absolute',  // Để nó nổi lên trên
                        top: 0, left: 0,       // Căn góc trên trái
                        width: '100%',         // Phủ kín chiều ngang
                        height: '100%',        // Phủ kín chiều dọc
                        backgroundColor: 'rgba(0,0,0,0.5)', // Màu đen mờ để làm tối video đi một chút
                        zIndex: 20,             // Đảm bảo nó nằm trên video (thường video là z-index thấp)
                        display: 'flex', justifyContent: 'center', alignItems: 'center' // Căn nút ra giữa
                    }}>
                        <button
                            onClick={handleBuzzerClick}
                            style={{
                                padding: '15px 30px',
                                fontSize: '24px',
                                fontWeight: 'bold',
                                backgroundColor: '#ff4757', // Luôn giữ màu đỏ rực
                                color: 'white',
                                border: '4px solid white',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                boxShadow: '0 4px 15px rgba(255, 71, 87, 0.5)' // Thêm chút bóng bẩy
                            }}
                        >
                            ĐẬP NÚT! ({clickCount})
                        </button>
                    </div>
                )}
                {gameState === "PERFORMANCE" && (
                    <div className="performance-container" style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        backgroundColor: 'rgba(0,0,0,0.6)', // Tối mờ để thấy mờ mờ video phía sau
                        zIndex: 20,
                        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                        color: 'white', textShadow: '2px 2px 8px #000',
                        pointerEvents: 'none' // Cho phép click xuyên qua nếu cần
                    }}>
                        <h2 style={{ fontSize: '30px', margin: '0', color: '#FFD700' }}>🎤 MIC THUỘC VỀ 🎤</h2>

                        {/* Hiện tên người thắng. Nếu là chính mình thì đổi thành chữ "BẠN" */}
                        <h1 style={{ fontSize: '50px', margin: '10px 0', color: '#00ffcc' }}>
                            {winner === userName ? "BẠN!" : winner}
                        </h1>

                        <p style={{ fontSize: '20px', animation: 'blink 1s infinite' }}>Đang biểu diễn...</p>
                    </div>
                )}
            </div>


            <hr />
            <h3>2. Bảng điều khiển (Test)</h3>
            <p>Bấm nút bên dưới để ra lệnh cho TOÀN BỘ người trong phòng:</p>
            <button onClick={() => sendPlayCommand("k2qgadSvNyU", 35, 45)}>
                [TEST] Phát bài Dua Lipa (35s - 45s)
            </button>
            &nbsp;
            <button onClick={() => sendPlayCommand("9bZkp7q19f0", 60, 70)}>
                [TEST] Phát bài Gangnam Style (60s - 70s)
            </button>
            &nbsp;
            <button onClick={sendPauseCommand}>
                [TEST] Dừng Nhạc
            </button>

            <hr />
            <h3>3. Chat</h3>
            <div style={{ border: "1px solid black", height: "200px", overflowY: "scroll" }}>
                {messages.map((msg, index) => (
                    <div key={index}>
                        <strong>{msg.sender}: </strong>

                        {typeof msg.content === "string"
                            ? msg.content
                            : JSON.stringify(msg.content)}
                    </div>
                ))}
            </div>
            <input value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} />
            <button onClick={handleSendMessage}>Gửi tin nhắn</button>
        </div>
    );
}