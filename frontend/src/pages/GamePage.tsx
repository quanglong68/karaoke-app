import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { websocketService, type SocketMessage } from "../services/websocketService";
import VideoPlayer from "../components/VideoPlayer";
interface GameState {
    videoId: string;
    start: number;
    end: number;
    isPlaying: boolean;
}
export default function GamePage() {
    const { roomId } = useParams();
    const [messages, setMessages] = useState<SocketMessage[]>([]);
    const [inputMessage, setInputMessage] = useState("");
    const userName = localStorage.getItem("userName") || "Người chơi ẩn danh";

    const [gameState, setGameState] = useState<GameState>({
        videoId: "",
        start: 0,
        end: 0,
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
                        const state: GameState = JSON.parse(message.content);
                        setGameState(state);
                    } catch (error) {
                        console.error("Failed to parse game state message", error);
                    }
                } else if (message.type === "PAUSE") {
                    setGameState((prevState) => ({
                        ...prevState,
                        isPlaying: false,
                    }));
                }

            });

            return () => {
                websocketService.disconnect();
            }
        }
    }, [roomId]);
    const sendPlayCommand = (vid: string, s: number, e: number) => {
        const payload = { videoId: vid, start: s, end: e, isPlaying: true };
        websocketService.sendMessage(roomId!, {
            type: "PLAY_SEGMENT",
            content: JSON.stringify(payload),
            sender: userName,
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
            const message = {
                type: "CHAT",
                content: inputMessage,
                sender: userName,
                roomId: roomId
            };
            websocketService.sendMessage(roomId, message);
            setInputMessage("");
        }
    };
    return (
        <div>
            <h1>Phòng: {roomId}</h1>

            <hr />
            <h3>1. Màn hình Karaoke</h3>
            <VideoPlayer
                videoId={gameState.videoId}
                start={gameState.start}
                end={gameState.end}
                isPlaying={gameState.isPlaying}
            />

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
                    <div key={index}><strong>{msg.sender}: </strong> {msg.content}</div>
                ))}
            </div>
            <input value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} />
            <button onClick={handleSendMessage}>Gửi tin nhắn</button>
        </div>
    );
}