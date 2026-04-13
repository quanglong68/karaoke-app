import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import VideoPlayer from "../components/VideoPlayer";
import type { SocketMessage } from "../types/socket";
import type { GameState, MusicInfo } from "../types/game";
import { websocketService } from "../services/websocketService";
import type { User } from "../types/user";

export default function GamePage() {
    const { roomId } = useParams();
    const [messages, setMessages] = useState<SocketMessage[]>([]);
    const [inputMessage, setInputMessage] = useState("");
    const userName = localStorage.getItem("userName") || "Người chơi ẩn danh";
    const userId = localStorage.getItem("userId") || "";
    const [gameState, setGameState] = useState<GameState>("LOBBY");
    const [clickCount, setClickCount] = useState(0);
    const [winnerUser, setWinnerUser] = useState<User | null>(null);
    const [notification, setNotification] = useState<string | null>(null);
    const [countdownNum, setCountdownNum] = useState(3);

    const [musicInfo, setMusicInfo] = useState<MusicInfo>({
        videoUrl: "",
        startSeconds: 0,
        isPlaying: false,
        serverStartTime: 0,
    });

    useEffect(() => {
        if (gameState === "COUNTDOWN") {
            // THÊM DÒNG NÀY ĐỂ RESET VỀ 3 MỖI LẦN GỌI:
            setCountdownNum(3);

            const timer = setInterval(() => {
                setCountdownNum((prev) => (prev > 1 ? prev - 1 : 1));
            }, 1000);

            // Dọn dẹp đồng hồ khi đổi vòng
            return () => clearInterval(timer);
        }
    }, [gameState]);

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
                } else if (message.type === "WINNER_SHOW") {
                    console.log("Người chiến thắng là:", message.content);
                    setGameState("WINNER_SHOW");
                    if (typeof message.content !== "string" && "userName" in message.content) {
                        setWinnerUser(message.content);
                    }
                } else if (message.type === "COUNTDOWN") {
                    setGameState("COUNTDOWN");
                }

                else if (message.type === "PERFORMANCE") {
                    const newMusicInfo = message.content as MusicInfo;
                    setMusicInfo(newMusicInfo)
                    setGameState("PERFORMANCE");
                } else if (message.type === "VOTE") {
                    setGameState("VOTE");
                }

            });

            return () => {
                websocketService.disconnect();
            }
        }
    }, [roomId]);
    const handleStartGame = () => {
        if (!roomId) return;
        websocketService.sendMessage(roomId, {
            type: "PLAY_SEGMENT",
            content: "",
            sender: userId,
            roomId: roomId
        });
    };
    const handleBuzzerClick = () => {
        if (!roomId) return;

        setClickCount(prev => prev + 1);
        websocketService.sendMessage(roomId, {
            type: "BATTLE",
            content: "",
            sender: userId,
            roomId: roomId!
        });
    };
    const handleVoteClick = (isLike: boolean) => {
        if (!roomId) return;

        websocketService.sendMessage(roomId, {
            type: "VOTE",
            content: isLike.toString(),
            sender: userId,
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
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100vh',
            width: '100vw', position: 'fixed', top: 0, left: 0,
            backgroundColor: '#0f0f1b', color: '#ffffff', fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            overflow: 'hidden'
        }}>
            {/* --- HEADER --- */}
            <div style={{
                padding: '15px 30px', textAlign: 'center', background: 'linear-gradient(90deg, #ff4757, #3742fa)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.6)', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <h1 style={{ margin: 0, fontSize: '28px', textShadow: '2px 2px 4px rgba(0,0,0,0.5)', letterSpacing: '2px' }}>
                    🎤 KARAOKE BATTLE
                </h1>
                <div style={{ fontSize: '18px', fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.3)', padding: '5px 15px', borderRadius: '20px' }}>
                    Phòng: <span style={{ color: '#FFD700' }}>{roomId}</span> | ID: {userName}
                </div>
            </div>

            {/* --- MAIN CONTENT (Chia 2 cột) --- */}
            <div style={{ display: 'flex', flex: 1, padding: '20px', gap: '20px', overflow: 'hidden' }}>

                {/* CỘT TRÁI: Khu vực Game & Điều khiển */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

                    {/* Màn hình Video Player */}
                    <div style={{
                        position: "relative", width: "100%", maxWidth: "900px", aspectRatio: '16/9',
                        backgroundColor: '#000', borderRadius: '15px', overflow: 'hidden',
                        boxShadow: '0 15px 40px rgba(0,0,0,0.8)', border: '2px solid #2f3542'
                    }}>
                        <VideoPlayer
                            videoUrl={musicInfo.videoUrl}
                            startSeconds={musicInfo.startSeconds}
                            isPlaying={musicInfo.isPlaying}
                            serverStartTime={musicInfo.serverStartTime}
                        />

                        {/* 1. LỚP PHỦ: ĐẬP NÚT */}
                        {gameState === "BATTLE" && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center'
                            }}>
                                <button
                                    onClick={handleBuzzerClick}
                                    style={{
                                        padding: '25px 60px', fontSize: '36px', fontWeight: 'bold', letterSpacing: '2px',
                                        backgroundColor: '#ff4757', color: 'white', border: '4px solid white',
                                        borderRadius: '60px', cursor: 'pointer', textTransform: 'uppercase',
                                        boxShadow: '0 0 40px rgba(255, 71, 87, 0.8)', transition: 'transform 0.1s'
                                    }}
                                    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
                                    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    ĐẬP NÚT! ({clickCount})
                                </button>
                            </div>
                        )}

                        {/* 2. LỚP PHỦ: HIỆN NGƯỜI THẮNG (Mới) */}
                        {gameState === "WINNER_SHOW" && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 20,
                                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white'
                            }}>
                                <h2 style={{ fontSize: '40px', color: '#FFD700', textShadow: '0 0 20px #FFD700', margin: '0 0 20px 0' }}>🎤 MIC THUỘC VỀ 🎤</h2>
                                <h1 style={{ fontSize: '70px', color: '#00ffcc', textShadow: '0 0 30px #00ffcc', margin: 0 }}>
                                    {winnerUser && winnerUser.userId === userId ? "BẠN!" : winnerUser?.userName}
                                </h1>
                            </div>
                        )}

                        {/* 3. LỚP PHỦ: ĐẾM NGƯỢC (Mới) */}
                        {gameState === "COUNTDOWN" && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 20,
                                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white'
                            }}>
                                <h1 style={{
                                    fontSize: '120px', color: '#ff4757',
                                    animation: 'pulse 1s infinite', textShadow: '0 0 30px #ff4757', margin: 0
                                }}>
                                    {countdownNum}
                                </h1>
                            </div>
                        )}

                        {/* 4. LỚP PHỦ: ĐANG HÁT (Trong suốt, chỉ hiện icon rec) */}
                        {gameState === "PERFORMANCE" && (
                            <div style={{
                                position: 'absolute', top: '20px', right: '20px', zIndex: 20,
                                backgroundColor: 'rgba(0,0,0,0.7)', padding: '10px 20px', borderRadius: '30px',
                                display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #ff4757'
                            }}>
                                <div style={{ width: '15px', height: '15px', backgroundColor: '#ff4757', borderRadius: '50%', animation: 'blink 1s infinite', boxShadow: '0 0 10px #ff4757' }} />
                                <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>
                                    {winnerUser && winnerUser.userId === userId ? "BẠN ĐANG HÁT" : `${winnerUser?.userName} ĐANG HÁT`}
                                </span>
                            </div>
                        )}

                        {/* 5. LỚP PHỦ: VOTE */}
                        {gameState === "VOTE" && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 40,
                                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white'
                            }}>
                                {userId === winnerUser?.userId ? (
                                    <div style={{ textAlign: 'center' }}>
                                        <h2 style={{ color: '#FFD700', fontSize: '36px', marginBottom: '15px' }}>🎤 Đã biểu diễn xong!</h2>
                                        <p style={{ fontSize: '24px', color: '#aaa', animation: 'blink 1.5s infinite' }}>Đang chờ khán giả cho điểm... ⏳</p>
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center' }}>
                                        <h2 style={{ color: '#00ffcc', fontSize: '32px', marginBottom: '40px' }}>
                                            Bạn thấy <span style={{ color: '#FFD700' }}>{winnerUser?.userName}</span> hát thế nào?
                                        </h2>
                                        <div style={{ display: 'flex', gap: '40px', justifyContent: 'center' }}>
                                            <button onClick={() => handleVoteClick(true)} style={{
                                                padding: '20px 50px', fontSize: '28px', fontWeight: 'bold', cursor: 'pointer',
                                                backgroundColor: '#2ed573', color: 'white', border: '4px solid white',
                                                borderRadius: '50px', boxShadow: '0 10px 30px rgba(46, 213, 115, 0.6)', transition: 'transform 0.1s'
                                            }} onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                                                👍 QUÁ HAY!
                                            </button>
                                            <button onClick={() => handleVoteClick(false)} style={{
                                                padding: '20px 50px', fontSize: '28px', fontWeight: 'bold', cursor: 'pointer',
                                                backgroundColor: '#ff4757', color: 'white', border: '4px solid white',
                                                borderRadius: '50px', boxShadow: '0 10px 30px rgba(255, 71, 87, 0.6)', transition: 'transform 0.1s'
                                            }} onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                                                👎 Ò Ó O...
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 6. LỚP PHỦ: THÔNG BÁO LOBBY KẾT QUẢ */}
                        {notification && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 50,
                                display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px'
                            }}>
                                <h1 style={{
                                    color: notification.includes('Chúc mừng') ? '#2ed573' : '#ff4757',
                                    fontSize: '40px', lineHeight: '1.5', textAlign: 'center', textShadow: '0px 0px 20px currentColor'
                                }}>
                                    {notification}
                                </h1>
                            </div>
                        )}
                    </div>

                    {/* Bảng điều khiển */}
                    <div style={{ marginTop: '40px' }}>
                        <button onClick={handleStartGame} style={{
                            padding: '15px 40px', fontSize: '22px', fontWeight: 'bold', cursor: 'pointer',
                            background: 'linear-gradient(45deg, #3742fa, #5f27cd)', color: 'white', border: 'none',
                            borderRadius: '50px', boxShadow: '0 8px 25px rgba(55, 66, 250, 0.5)', transition: 'transform 0.2s'
                        }} onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                            🎮 CHƠI RANDOM NGAY
                        </button>
                    </div>
                </div>

                {/* CỘT PHẢI: Khung Chat */}
                <div style={{
                    width: '380px', backgroundColor: '#1e1e2f', borderRadius: '15px', border: '1px solid #2f3542',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                }}>
                    <div style={{ padding: '15px', backgroundColor: '#2f3542', fontWeight: 'bold', textAlign: 'center', fontSize: '18px', borderBottom: '1px solid #1e1e2f' }}>
                        💬 Kênh Chat Phòng
                    </div>

                    <div style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {messages.map((msg, index) => {
                            const isMe = msg.sender === userName;
                            return (
                                <div key={index} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                    {!isMe && <div style={{ fontSize: '13px', color: '#a4b0be', marginBottom: '5px', marginLeft: '5px' }}>{msg.sender}</div>}
                                    <div style={{
                                        backgroundColor: isMe ? '#3742fa' : '#4a69bd', padding: '12px 18px', fontSize: '15px',
                                        borderRadius: isMe ? '20px 20px 5px 20px' : '20px 20px 20px 5px',
                                        wordWrap: 'break-word', boxShadow: '0 3px 10px rgba(0,0,0,0.2)'
                                    }}>
                                        {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ padding: '15px', backgroundColor: '#2f3542', display: 'flex', gap: '10px' }}>
                        <input
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Nhập tin nhắn..."
                            style={{
                                flex: 1, padding: '12px 20px', borderRadius: '30px', border: '1px solid #1e1e2f',
                                backgroundColor: '#1e1e2f', color: 'white', outline: 'none', fontSize: '15px'
                            }}
                        />
                        <button
                            onClick={handleSendMessage}
                            style={{
                                padding: '10px 25px', borderRadius: '30px', border: 'none', fontSize: '15px',
                                backgroundColor: '#ff4757', color: 'white', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(255, 71, 87, 0.4)'
                            }}
                        >
                            Gửi
                        </button>
                    </div>
                </div>
            </div>

            {/* --- CSS Animations (Nhúng trực tiếp vào đây để không phải tạo file css ngoài) --- */}
            <style>
                {`
                @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
                @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
                /* Tùy chỉnh thanh cuộn cho khu vực Chat */
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: #1e1e2f; }
                ::-webkit-scrollbar-thumb { background: #2f3542; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: #57606f; }
                `}
            </style>
        </div>
    );
}