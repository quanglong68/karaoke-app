import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { websocketService } from "../services/websocketService";
interface ChatMessage {
    sender: string;
    content: string;
    type: string;
}
export default function GamePage() {
    const { roomId } = useParams();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputMessage, setInputMessage] = useState("");
    const userName = localStorage.getItem("userName") || "Người chơi ẩn danh";

    useEffect(() => {
        if (roomId) {
            console.log("Connecting to WebSocket for room:", roomId);
            websocketService.connect(roomId, (message) => {
                setMessages((prevMessages) => [...prevMessages, message]);
            });

            return () => {
                websocketService.disconnect();
            }
        }
    }, [roomId]);
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
        <div className="game-container" style={{ padding: "20px" }}>
            <h1>Phòng: {roomId}</h1>
            <p>Xin chào, <strong>{userName}</strong></p>

            {/* KHUNG CHAT TEST */}
            <div style={{
                border: "1px solid #ccc",
                height: "300px",
                overflowY: "scroll",
                marginBottom: "10px",
                padding: "10px"
            }}>
                {messages.map((msg, index) => (
                    <div key={index} style={{ marginBottom: "5px" }}>
                        <strong>{msg.sender}: </strong> {msg.content}
                    </div>
                ))}
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
                <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Nhập tin nhắn..."
                    style={{ flex: 1, padding: "5px" }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button onClick={handleSendMessage} style={{ padding: "5px 15px" }}>Gửi</button>
            </div>
        </div>
    );
}