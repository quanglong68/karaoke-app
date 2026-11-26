import { memo, useState } from "react";
import type { SocketMessage } from "../../types/socket";
import { MAX_CHAT_LENGTH } from "../../constants/game";
import PixelIcon from "../ui/PixelIcon";
import Mascot from "../ui/Mascot";

export interface ChatEntry {
    id: number;
    message: SocketMessage;
}

interface ChatPanelProps {
    messages: ChatEntry[];
    onSend: (content: string) => void;
    userId: string;
}

function ChatPanel({ messages, onSend, userId }: ChatPanelProps) {
    const [inputMessage, setInputMessage] = useState("");

    const handleSend = () => {
        const trimmed = inputMessage.trim().slice(0, MAX_CHAT_LENGTH);
        if (!trimmed) return;
        onSend(trimmed);
        setInputMessage("");
    };

    return (
        <aside className="p-panel chat-panel" aria-label="Kênh chat phòng">
            <div className="p-panel-head">
                <PixelIcon name="chat" size={16} />
                Kênh chat phòng
            </div>
            <div className="chat-log">
                {messages.length === 0 && (
                    <div className="chat-empty">
                        <Mascot size={64} className="chat-empty-mascot" />
                        Chưa có tin nhắn nào.
                        <br />
                        Gửi lời chào đầu tiên nhé!
                    </div>
                )}
                {messages.map(({ id, message: msg }) => {
                    const isMeChat = msg.sender === userId;
                    const displayName = msg.senderName || msg.sender;
                    return (
                        <div key={id} className={`chat-msg${isMeChat ? " is-me" : ""}`}>
                            <span className="chat-author">{isMeChat ? "Bạn" : displayName}</span>
                            <div className="chat-bubble">
                                {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="chat-form">
                <input
                    className="p-input"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            handleSend();
                        }
                    }}
                    maxLength={MAX_CHAT_LENGTH}
                    placeholder="Nhập tin nhắn..."
                    aria-label="Tin nhắn"
                />
                <button
                    type="button"
                    className="pbtn pbtn--primary pbtn--icon"
                    onClick={handleSend}
                    aria-label="Gửi tin nhắn"
                >
                    <PixelIcon name="send" size={16} />
                </button>
            </div>
        </aside>
    );
}

export default memo(ChatPanel);
