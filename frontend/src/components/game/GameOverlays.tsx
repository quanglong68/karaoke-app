import type { GameState } from "../../types/game";
import type { User } from "../../types/user";
import type { RankedUser } from "./Leaderboard";

interface GameOverlaysProps {
    gameState: GameState;
    clickCount: number;
    onBuzzer: () => void;
    winnerUser: User | null;
    userId: string;
    countdownNum: number;
    notification: string | null;
    noWinnerMessage: string | null;
    rankedPlayers: RankedUser[];
}

export default function GameOverlays({
    gameState,
    clickCount,
    onBuzzer,
    winnerUser,
    userId,
    countdownNum,
    notification,
    noWinnerMessage,
    rankedPlayers,
}: GameOverlaysProps) {
    const topRanks = (() => {
        const entries: Array<{ user: RankedUser; rank: number }> = [];
        let rank = 1;
        let prevScore: number | null = null;
        rankedPlayers.forEach((player) => {
            if (prevScore !== null && player.score < prevScore) {
                rank += 1;
            }
            if (rank > 3) return;
            entries.push({ user: player, rank });
            prevScore = player.score;
        });
        return entries;
    })();
    return (
        <>
            {noWinnerMessage && (
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.8)", zIndex: 30, display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <h1 style={{ color: "#ffd166", fontSize: "46px", textAlign: "center", textShadow: "0 0 20px rgba(255, 209, 102, 0.7)" }}>
                        {noWinnerMessage}
                    </h1>
                </div>
            )}
            {gameState === "BATTLE" && !noWinnerMessage && (
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(2,6,23,0.75)", zIndex: 20, display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <button onClick={onBuzzer} style={{ padding: "25px 60px", fontSize: "36px", fontWeight: 800, background: "linear-gradient(135deg, #ff7a59, #f72585)", color: "white", border: "2px solid rgba(255,255,255,0.6)", borderRadius: "60px", cursor: "pointer", boxShadow: "0 0 40px rgba(247, 37, 133, 0.6)" }}>
                        ĐẬP NÚT! ({clickCount})
                    </button>
                </div>
            )}

            {gameState === "WINNER_SHOW" && (
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(2,6,23,0.85)", zIndex: 20, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "white" }}>
                    <h2 style={{ fontSize: "40px", color: "#ffd166", textShadow: "0 0 20px rgba(255, 209, 102, 0.8)" }}>🎤 MIC THUỘC VỀ 🎤</h2>
                    <h1 style={{ fontSize: "70px", color: "#00f5d4", textShadow: "0 0 30px rgba(0, 245, 212, 0.7)", margin: 0 }}>
                        {winnerUser && winnerUser.userId === userId ? "BẠN!" : winnerUser?.userName}
                    </h1>
                </div>
            )}

            {gameState === "COUNTDOWN" && (
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(2,6,23,0.7)", zIndex: 20, display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <h1 style={{ fontSize: "150px", color: "#ff7a59", animation: "pulse 1s infinite", textShadow: "0 0 30px rgba(255, 122, 89, 0.7)", margin: 0 }}>{countdownNum}</h1>
                </div>
            )}

            {gameState === "PERFORMANCE" && (
                <div style={{ position: "absolute", top: "20px", right: "20px", zIndex: 20, backgroundColor: "rgba(10, 16, 34, 0.7)", padding: "10px 20px", borderRadius: "30px", display: "flex", alignItems: "center", gap: "10px", border: "1px solid rgba(255, 122, 89, 0.8)" }}>
                    <div style={{ width: "15px", height: "15px", backgroundColor: "#ff7a59", borderRadius: "50%", animation: "blink 1s infinite" }} />
                    <span style={{ fontSize: "18px", fontWeight: "bold", color: "white" }}>
                        {winnerUser && winnerUser.userId === userId ? "BẠN ĐANG HÁT" : `${winnerUser?.userName} ĐANG HÁT`}
                    </span>
                </div>
            )}

            {gameState === "PERFORMANCE_EVALUATION" && (
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(2,6,23,0.92)", zIndex: 40, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "white" }}>
                    <div style={{ textAlign: "center" }}>
                        <h2 style={{ color: "#ffd166", fontSize: "36px" }}>🎤 Đã biểu diễn xong!</h2>
                        <p style={{ fontSize: "24px", color: "#00f5d4", animation: "blink 1.5s infinite" }}>
                            🤖 AI đang phân tích và chấm điểm giọng hát... ⏳
                        </p>
                    </div>
                </div>
            )}

            {gameState === "SCORE_SHOW" && (
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(2,6,23,0.95)", zIndex: 50, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
                    <h1 style={{ color: notification?.includes("Chúc mừng") ? "#2ed573" : "#ff4757", fontSize: "45px", textAlign: "center", textShadow: "0px 0px 30px currentColor" }}>
                        {notification}
                    </h1>
                </div>
            )}

            {gameState === "END_GAME" && (
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(2,6,23,0.95)", zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "white" }}>
                    <h1 style={{ fontSize: "55px", color: "#ffd166", textShadow: "0 0 30px rgba(255, 209, 102, 0.7)", marginBottom: "20px", animation: "pulse 1s infinite" }}>
                        🎉 TỔNG KẾT GAME 🎉
                    </h1>
                    {topRanks.length > 0 && (
                        <div style={{ textAlign: "center", backgroundColor: "rgba(255, 255, 255, 0.08)", padding: "30px 50px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.2)", minWidth: "320px" }}>
                            <h2 style={{ fontSize: "26px", color: "#fff", margin: "0 0 18px 0" }}>BẢNG VINH DANH</h2>
                            <div style={{ display: "grid", gap: "12px", justifyItems: "center" }}>
                                {topRanks.map((entry, index) => {
                                    const icon = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉";
                                    return (
                                        <div key={`${entry.user.userId}-${index}`} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "22px", fontWeight: 700 }}>
                                            <span style={{ fontSize: "26px" }}>{icon}</span>
                                            <span style={{ color: "#f8f8ff" }}>{entry.user.userName}</span>
                                            <span style={{ color: "#ffd166", fontSize: "18px" }}>({entry.user.score}đ)</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
