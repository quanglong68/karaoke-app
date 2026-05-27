import type { SocketMessage } from "../../types/socket";

interface ChatPanelProps {
    messages: SocketMessage[];
    inputMessage: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    userName: string;
}

export default function ChatPanel({ messages, inputMessage, onInputChange, onSend, userName }: ChatPanelProps) {
    return (
        <div style={{ width: "380px", background: "var(--game-panel)", borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 18px 40px rgba(0,0,0,0.45)", animation: "floatIn 0.6s ease" }}>
            <div style={{ padding: "16px", background: "rgba(12, 18, 36, 0.8)", fontWeight: 700, textAlign: "center", fontSize: "18px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>💬 Kênh Chat Phòng</div>
            <div style={{ flex: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>
                {messages.map((msg, index) => {
                    const isMeChat = msg.sender === userName;
                    return (
                        <div key={index} style={{ alignSelf: isMeChat ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                            {!isMeChat && <div style={{ fontSize: "13px", color: "#a4b0be", marginBottom: "5px", marginLeft: "5px" }}>{msg.sender}</div>}
                            <div style={{ backgroundColor: isMeChat ? "rgba(0, 245, 212, 0.18)" : "rgba(255, 122, 89, 0.18)", padding: "12px 18px", fontSize: "15px", borderRadius: isMeChat ? "20px 20px 5px 20px" : "20px 20px 20px 5px", wordWrap: "break-word", boxShadow: "0 6px 16px rgba(0,0,0,0.25)" }}>
                                {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{ padding: "14px", background: "rgba(12, 18, 36, 0.8)", display: "flex", gap: "10px" }}>
                <input
                    value={inputMessage}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSend()}
                    placeholder="Nhập tin nhắn..."
                    style={{ flex: 1, padding: "12px 20px", borderRadius: "30px", border: "1px solid rgba(255,255,255,0.12)", backgroundColor: "rgba(8, 12, 26, 0.8)", color: "white", outline: "none", fontSize: "15px" }}
                />
                <button onClick={onSend} style={{ padding: "10px 25px", borderRadius: "30px", border: "none", fontSize: "15px", background: "linear-gradient(135deg, #ff7a59, #f72585)", color: "white", fontWeight: 700, cursor: "pointer" }}>Gửi</button>
            </div>
        </div>
    );
}
