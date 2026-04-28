import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import VideoPlayer from "../components/VideoPlayer";
import type { SocketMessage } from "../types/socket";
import type { GameState, MusicInfo } from "../types/game";
import { websocketService } from "../services/websocketService";
import type { User } from "../types/user";
import type { VoteResultPayload } from "../types/room";

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

    const [myScore, setMyScore] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);
    const [playerList, setPlayerList] = useState<User[]>([]);

    const [musicInfo, setMusicInfo] = useState<MusicInfo>({
        videoUrl: "",
        startSeconds: 0,
        isPlaying: false,
        serverStartTime: 0,
    });

    // Xử lý đếm ngược
    useEffect(() => {
        if (gameState === "COUNTDOWN") {
            setCountdownNum(3);
            const timer = setInterval(() => {
                setCountdownNum((prev) => (prev > 1 ? prev - 1 : 1));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState]);

    // Xử lý WebSocket
    useEffect(() => {
        if (roomId) {
            console.log("Connecting to WebSocket for room:", roomId);

            websocketService.connect(roomId, (message) => {
                if (message.type === "JOIN") {
                    setPlayerList(message.content as User[]);
                }
                else if (message.type === "CHAT") {
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
                    setMusicInfo((prevState) => ({ ...prevState, isPlaying: false }));
                } else if (message.type === "BATTLE") {
                    setGameState("BATTLE");
                    setMusicInfo(prev => ({ ...prev, isPlaying: false }));
                } else if (message.type === "WINNER_SHOW") {
                    setGameState("WINNER_SHOW");
                    if (typeof message.content !== "string" && "userName" in message.content) {
                        setWinnerUser(message.content as User);
                    }
                } else if (message.type === "COUNTDOWN") {
                    setGameState("COUNTDOWN");
                } else if (message.type === "PERFORMANCE") {
                    const newMusicInfo = message.content as MusicInfo;
                    setMusicInfo(newMusicInfo);
                    setGameState("PERFORMANCE");
                } else if (message.type === "VOTE") {
                    setHasVoted(false);
                    setGameState("VOTE");
                } else if (message.type === "SCORE_SHOW") {
                    setGameState("SCORE_SHOW");
                    const payload = message.content as VoteResultPayload;
                    const performanceUser = payload.user;
                    const isSuccess = payload.isSuccess;

                    if (performanceUser.userId === userId) {
                        setMyScore(performanceUser.score);
                    }

                    // Cập nhật lại điểm của người hát trong danh sách
                    setPlayerList((prevList) =>
                        prevList.map((user) =>
                            user.userId === performanceUser.userId
                                ? { ...user, score: performanceUser.score }
                                : user
                        )
                    );

                    if (isSuccess) {
                        setNotification(`Chúc mừng ${performanceUser.userName} đã được cộng 1 điểm! 🎉`);
                    } else {
                        setNotification(`Rất tiếc ${performanceUser.userName} chưa được cộng điểm. 😢`);
                    }
                }
                else if (message.type === "END_GAME") {
                    setGameState("END_GAME");

                }
                else if (message.type === "LOBBY") {
                    setPlayerList(message.content as User[]);
                    setMyScore(0);
                    setNotification(null);
                    setWinnerUser(null);
                    setHasVoted(false);
                    setGameState("LOBBY");
                }
                else if (message.type === "KICK_PLAYER") {
                    if (typeof message.content === "string" && message.content === userId) {
                        alert("Bạn đã bị chủ phòng đá khỏi phòng. 😢");
                        window.location.href = "/";
                    }
                }
            });

            // Gửi lời chào JOIN sau khi delay 1s để đảm bảo WS đã connect
            const joinTimeout = setTimeout(() => {
                websocketService.sendMessage(roomId, {
                    type: "JOIN",
                    content: "",
                    sender: userId,
                    roomId: roomId
                });
            }, 1000);

            return () => {
                clearTimeout(joinTimeout); // Dọn dẹp timeout nếu user thoát trang sớm
                websocketService.disconnect();
            }
        }
    }, [roomId, userId]);

    // Các hàm xử lý sự kiện
    const handleStartGame = () => {
        if (!roomId) return;
        websocketService.sendMessage(roomId, { type: "PLAY_SEGMENT", content: "", sender: userId, roomId });
    };

    const handleBuzzerClick = () => {
        if (!roomId) return;
        setClickCount(prev => prev + 1);
        websocketService.sendMessage(roomId, { type: "BATTLE", content: "", sender: userId, roomId });
    };

    const handleVoteClick = (isLike: boolean) => {
        if (!roomId) return;
        setHasVoted(true);
        websocketService.sendMessage(roomId, { type: "VOTE", content: isLike.toString(), sender: userId, roomId });
    };

    const handleSendMessage = () => {
        if (roomId && inputMessage.trim()) {
            websocketService.sendMessage(roomId, { type: "CHAT", content: inputMessage, sender: userName, roomId });
            setInputMessage("");
        }
    };

    // --- CÁC BIẾN & HÀM CHUẨN BỊ CHO LOBBY ---
    const me = playerList.find(u => u.userId === userId);
    const isHost = me?.isHost || false;
    const isReady = me?.isReady || false;

    // Điều kiện bắt đầu: Có nhiều hơn 1 người VÀ tất cả (trừ Host) đều đã ready
    const allReady = playerList.length > 1 && playerList.every(u => u.isHost || u.isReady);

    const handleToggleReady = () => {
        if (!roomId) return;
        websocketService.sendMessage(roomId, { type: "TOGGLE_READY", content: "", sender: userId, roomId });
    };

    const handleKickPlayer = (kickedId: string) => {
        if (!roomId) return;
        if (window.confirm("Bạn có chắc chắn muốn mời người này ra khỏi phòng?")) {
            websocketService.sendMessage(roomId, { type: "KICK_PLAYER", content: kickedId, sender: userId, roomId });
        }
    };

    // Thuật toán Xếp hạng (Tie-breaker)
    const sortedPlayers = [...playerList].sort((a, b) => b.score - a.score);
    let currentRank = 1;
    const rankedPlayers = sortedPlayers.map((user, index) => {
        if (index > 0 && user.score < sortedPlayers[index - 1].score) {
            currentRank = index + 1;
        }
        let rankIcon = `${currentRank}.`;
        if (currentRank === 1) rankIcon = '🥇';
        else if (currentRank === 2) rankIcon = '🥈';
        else if (currentRank === 3) rankIcon = '🥉';
        return { ...user, rankIcon };
    });

    // --- GIAO DIỆN CHÍNH ---
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100vh',
            width: '100vw', position: 'fixed', top: 0, left: 0,
            backgroundColor: '#0f0f1b', color: '#ffffff', fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            overflow: 'hidden'
        }}>
            {/* HEADER */}
            <div style={{
                padding: '15px 30px', textAlign: 'center', background: 'linear-gradient(90deg, #ff4757, #3742fa)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.6)', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <h1 style={{ margin: 0, fontSize: '28px', textShadow: '2px 2px 4px rgba(0,0,0,0.5)', letterSpacing: '2px' }}>
                    🎤 KARAOKE BATTLE
                </h1>
                <div style={{ display: 'flex', gap: '15px', fontSize: '18px', fontWeight: 'bold' }}>
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '5px 20px', borderRadius: '30px', border: '1px solid #2ed573' }}>
                        ⭐ Điểm của bạn: <span style={{ color: '#2ed573', fontSize: '22px' }}>{myScore}</span>
                    </div>
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '5px 20px', borderRadius: '30px' }}>
                        Phòng: <span style={{ color: '#FFD700' }}>{roomId}</span> | ID: {userName}
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT (Layout 3 cột) */}
            <div style={{ display: 'flex', flex: 1, padding: '20px', gap: '20px', overflow: 'hidden' }}>

                {/* CỘT TRÁI: Bảng Xếp Hạng */}
                <div style={{ width: '280px', backgroundColor: '#1e1e2f', borderRadius: '15px', border: '1px solid #2f3542', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                    <div style={{ padding: '15px', backgroundColor: '#2f3542', fontWeight: 'bold', textAlign: 'center', fontSize: '18px', borderBottom: '1px solid #1e1e2f', color: '#FFD700', letterSpacing: '1px' }}>
                        🏆 BẢNG XẾP HẠNG
                    </div>
                    <div style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {rankedPlayers.map((user) => {
                            const isMeUser = user.userId === userId;
                            return (
                                <div key={user.userId} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 15px', backgroundColor: isMeUser ? 'rgba(46, 213, 115, 0.15)' : '#2f3542',
                                    borderRadius: '10px', border: isMeUser ? '1px solid #2ed573' : '1px solid transparent',
                                    transition: 'transform 0.2s',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '20px', width: '25px', textAlign: 'center' }}>{user.rankIcon}</span>
                                        <span style={{ fontSize: '16px', fontWeight: isMeUser ? 'bold' : 'normal', color: isMeUser ? '#2ed573' : 'white' }}>
                                            {user.userName} {isMeUser && "(Bạn)"}
                                        </span>
                                    </div>
                                    <div style={{ fontWeight: 'bold', color: '#FFD700', fontSize: '18px' }}>
                                        {user.score} ⭐
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* CỘT GIỮA: Màn hình Game / Lobby */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

                    {/* KHU VỰC HIỂN THỊ CHÍNH */}
                    <div style={{
                        position: "relative", width: "100%", maxWidth: "900px", aspectRatio: '16/9',
                        backgroundColor: '#000', borderRadius: '15px', overflow: 'hidden',
                        boxShadow: '0 15px 40px rgba(0,0,0,0.8)', border: '2px solid #2f3542',
                        display: 'flex', flexDirection: 'column'
                    }}>

                        {/* HIỂN THỊ LOBBY NẾU CHƯA START */}
                        {gameState === "LOBBY" ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '30px', backgroundColor: '#1e1e2f', overflowY: 'auto' }}>
                                <h2 style={{ color: '#FFD700', textAlign: 'center', fontSize: '32px', marginBottom: '30px' }}>SẢNH CHỜ KHỞI ĐỘNG</h2>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                                    {playerList.map(user => (
                                        <div key={user.userId} style={{
                                            backgroundColor: '#2f3542', padding: '15px', borderRadius: '15px',
                                            border: user.isHost ? '2px solid #FFD700' : (user.isReady ? '2px solid #2ed573' : '2px solid #747d8c'),
                                            position: 'relative', textAlign: 'center'
                                        }}>
                                            <div style={{ fontSize: '40px', marginBottom: '10px' }}>{user.isHost ? '👑' : '👤'}</div>
                                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '10px' }}>{user.userName}</div>

                                            {/* TRẠNG THÁI SẴN SÀNG */}
                                            {user.isHost ? (
                                                <span style={{ color: '#FFD700', fontWeight: 'bold' }}>Chủ phòng</span>
                                            ) : (
                                                <span style={{ color: user.isReady ? '#2ed573' : '#a4b0be', fontWeight: 'bold' }}>
                                                    {user.isReady ? "✅ Đã sẵn sàng" : "⏳ Đang chờ..."}
                                                </span>
                                            )}

                                            {/* NÚT KICK CỦA CHỦ PHÒNG */}
                                            {isHost && !user.isHost && (
                                                <button
                                                    onClick={() => handleKickPlayer(user.userId)}
                                                    style={{
                                                        position: 'absolute', top: '-10px', right: '-10px', width: '30px', height: '30px',
                                                        borderRadius: '50%', backgroundColor: '#ff4757', color: 'white', border: 'none',
                                                        fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.5)'
                                                    }}
                                                >X</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            // HIỂN THỊ VIDEO KHI CHƠI
                            <VideoPlayer
                                videoUrl={musicInfo.videoUrl}
                                startSeconds={musicInfo.startSeconds}
                                isPlaying={musicInfo.isPlaying}
                                serverStartTime={musicInfo.serverStartTime}
                            />
                        )}

                        {/* --- CÁC LỚP PHỦ INGAME --- */}
                        {gameState === "BATTLE" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <button onClick={handleBuzzerClick} style={{ padding: '25px 60px', fontSize: '36px', fontWeight: 'bold', backgroundColor: '#ff4757', color: 'white', border: '4px solid white', borderRadius: '60px', cursor: 'pointer', boxShadow: '0 0 40px rgba(255, 71, 87, 0.8)' }}>
                                    ĐẬP NÚT! ({clickCount})
                                </button>
                            </div>
                        )}

                        {gameState === "WINNER_SHOW" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
                                <h2 style={{ fontSize: '40px', color: '#FFD700', textShadow: '0 0 20px #FFD700' }}>🎤 MIC THUỘC VỀ 🎤</h2>
                                <h1 style={{ fontSize: '70px', color: '#00ffcc', textShadow: '0 0 30px #00ffcc', margin: 0 }}>
                                    {winnerUser && winnerUser.userId === userId ? "BẠN!" : winnerUser?.userName}
                                </h1>
                            </div>
                        )}

                        {gameState === "COUNTDOWN" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <h1 style={{ fontSize: '150px', color: '#ff4757', animation: 'pulse 1s infinite', textShadow: '0 0 30px #ff4757', margin: 0 }}>{countdownNum}</h1>
                            </div>
                        )}

                        {gameState === "PERFORMANCE" && (
                            <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 20, backgroundColor: 'rgba(0,0,0,0.7)', padding: '10px 20px', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #ff4757' }}>
                                <div style={{ width: '15px', height: '15px', backgroundColor: '#ff4757', borderRadius: '50%', animation: 'blink 1s infinite' }} />
                                <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>
                                    {winnerUser && winnerUser.userId === userId ? "BẠN ĐANG HÁT" : `${winnerUser?.userName} ĐANG HÁT`}
                                </span>
                            </div>
                        )}

                        {gameState === "VOTE" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
                                {userId === winnerUser?.userId ? (
                                    <div style={{ textAlign: 'center' }}>
                                        <h2 style={{ color: '#FFD700', fontSize: '36px' }}>🎤 Đã biểu diễn xong!</h2>
                                        <p style={{ fontSize: '24px', color: '#aaa', animation: 'blink 1.5s infinite' }}>Đang chờ khán giả cho điểm... ⏳</p>
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center' }}>
                                        <h2 style={{ color: '#00ffcc', fontSize: '32px', marginBottom: '40px' }}>
                                            Bạn thấy <span style={{ color: '#FFD700' }}>{winnerUser?.userName}</span> hát thế nào?
                                        </h2>
                                        {hasVoted ? (
                                            <div style={{ padding: '20px 40px', backgroundColor: 'rgba(46, 213, 115, 0.1)', borderRadius: '15px', border: '2px dashed #2ed573' }}>
                                                <h3 style={{ color: '#2ed573', fontSize: '28px', margin: '0 0 10px 0' }}>✅ Đã gửi đánh giá!</h3>
                                                <p style={{ fontSize: '20px', color: '#ddd', animation: 'blink 1.5s infinite', margin: 0 }}>Đang chờ kết quả chung cuộc...</p>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '40px', justifyContent: 'center' }}>
                                                <button onClick={() => handleVoteClick(true)} style={{ padding: '20px 50px', fontSize: '28px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#2ed573', color: 'white', border: '4px solid white', borderRadius: '50px' }}>👍 QUÁ HAY!</button>
                                                <button onClick={() => handleVoteClick(false)} style={{ padding: '20px 50px', fontSize: '28px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#ff4757', color: 'white', border: '4px solid white', borderRadius: '50px' }}>👎 Ò Ó O...</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {gameState === "SCORE_SHOW" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                                <h1 style={{ color: notification?.includes('Chúc mừng') ? '#2ed573' : '#ff4757', fontSize: '45px', textAlign: 'center', textShadow: '0px 0px 30px currentColor' }}>
                                    {notification}
                                </h1>
                            </div>
                        )}

                        {gameState === "END_GAME" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
                                <h1 style={{ fontSize: '55px', color: '#FFD700', textShadow: '0 0 30px #FFD700', marginBottom: '20px', animation: 'pulse 1s infinite' }}>
                                    🎉 TỔNG KẾT GAME 🎉
                                </h1>
                                {rankedPlayers.length > 0 && (
                                    <div style={{ textAlign: 'center', backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '40px 60px', borderRadius: '20px', border: '2px solid #FFD700' }}>
                                        <h2 style={{ fontSize: '28px', color: '#fff', margin: '0 0 15px 0' }}>QUÁN QUÂN LÀ</h2>
                                        <h1 style={{ fontSize: '65px', color: '#2ed573', textShadow: '0 0 30px #2ed573', margin: '0' }}>
                                            🥇 {rankedPlayers[0].userName} 🥇
                                        </h1>
                                        <p style={{ fontSize: '24px', color: '#FFD700', margin: '20px 0 0 0', fontWeight: 'bold' }}>
                                            Đạt được {rankedPlayers[0].score} điểm!
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* KHU VỰC NÚT ĐIỀU KHIỂN BÊN DƯỚI */}
                    <div style={{ marginTop: '30px' }}>
                        {gameState === "LOBBY" ? (
                            isHost ? (
                                <button
                                    onClick={handleStartGame}
                                    disabled={!allReady}
                                    style={{
                                        padding: '15px 50px', fontSize: '24px', fontWeight: 'bold', cursor: allReady ? 'pointer' : 'not-allowed',
                                        background: allReady ? 'linear-gradient(45deg, #3742fa, #5f27cd)' : '#747d8c',
                                        color: 'white', border: 'none', borderRadius: '50px',
                                        boxShadow: allReady ? '0 8px 25px rgba(55, 66, 250, 0.5)' : 'none'
                                    }}>
                                    {allReady ? "🎮 BẮT ĐẦU GAME" : "⏳ CHỜ MỌI NGƯỜI SẴN SÀNG..."}
                                </button>
                            ) : (
                                <button
                                    onClick={handleToggleReady}
                                    style={{
                                        padding: '15px 50px', fontSize: '24px', fontWeight: 'bold', cursor: 'pointer',
                                        background: isReady ? '#ff4757' : '#2ed573',
                                        color: 'white', border: 'none', borderRadius: '50px',
                                        boxShadow: `0 8px 25px ${isReady ? 'rgba(255, 71, 87, 0.5)' : 'rgba(46, 213, 115, 0.5)'}`
                                    }}>
                                    {isReady ? "❌ HỦY SẴN SÀNG" : "✅ SẴN SÀNG"}
                                </button>
                            )
                        ) : (
                            <p style={{ color: '#a4b0be', fontSize: '18px' }}>Trò chơi đang diễn ra...</p>
                        )}
                    </div>
                </div>

                {/* CỘT PHẢI: Khung Chat */}
                <div style={{ width: '380px', backgroundColor: '#1e1e2f', borderRadius: '15px', border: '1px solid #2f3542', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                    <div style={{ padding: '15px', backgroundColor: '#2f3542', fontWeight: 'bold', textAlign: 'center', fontSize: '18px', borderBottom: '1px solid #1e1e2f' }}>💬 Kênh Chat Phòng</div>
                    <div style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {messages.map((msg, index) => {
                            const isMeChat = msg.sender === userName;
                            return (
                                <div key={index} style={{ alignSelf: isMeChat ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                    {!isMeChat && <div style={{ fontSize: '13px', color: '#a4b0be', marginBottom: '5px', marginLeft: '5px' }}>{msg.sender}</div>}
                                    <div style={{ backgroundColor: isMeChat ? '#3742fa' : '#4a69bd', padding: '12px 18px', fontSize: '15px', borderRadius: isMeChat ? '20px 20px 5px 20px' : '20px 20px 20px 5px', wordWrap: 'break-word', boxShadow: '0 3px 10px rgba(0,0,0,0.2)' }}>
                                        {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ padding: '15px', backgroundColor: '#2f3542', display: 'flex', gap: '10px' }}>
                        <input value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Nhập tin nhắn..." style={{ flex: 1, padding: '12px 20px', borderRadius: '30px', border: '1px solid #1e1e2f', backgroundColor: '#1e1e2f', color: 'white', outline: 'none', fontSize: '15px' }} />
                        <button onClick={handleSendMessage} style={{ padding: '10px 25px', borderRadius: '30px', border: 'none', fontSize: '15px', backgroundColor: '#ff4757', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Gửi</button>
                    </div>
                </div>
            </div>

            <style>
                {`
                @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
                @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: #1e1e2f; }
                ::-webkit-scrollbar-thumb { background: #2f3542; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: #57606f; }
                `}
            </style>
        </div>
    );
}