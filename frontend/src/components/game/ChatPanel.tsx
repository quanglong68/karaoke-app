import type { SocketMessage } from "../../types/socket";
import { MAX_CHAT_LENGTH } from "../../constants/game";
import PixelIcon from "../ui/PixelIcon";
import Mascot from "../ui/Mascot";

interface ChatPanelProps {
    messages: SocketMessage[];
    inputMessage: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    userId: string;
}

export default function ChatPanel({ messages, inputMessage, onInputChange, onSend, userId }: ChatPanelProps) {
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
                {messages.map((msg, index) => {
                    const isMeChat = msg.sender === userId;
                    const displayName = msg.senderName || msg.sender;
                    return (
                        <div key={index} className={`chat-msg${isMeChat ? " is-me" : ""}`}>
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
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            onSend();
                        }
                    }}
                    maxLength={MAX_CHAT_LENGTH}
                    placeholder="Nhập tin nhắn..."
                    aria-label="Tin nhắn"
                />
                <button
                    type="button"
                    className="pbtn pbtn--primary pbtn--icon"
                    onClick={onSend}
                    aria-label="Gửi tin nhắn"
                >
                    <PixelIcon name="send" size={16} />
                </button>
            </div>
        </aside>
    );
}
