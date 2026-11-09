import type { GameState } from "../../types/game";
import type { User } from "../../types/user";
import type { RankedUser } from "./Leaderboard";
import PixelIcon from "../ui/PixelIcon";

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
        rankedPlayers.forEach((player, index) => {
            if (index > 0 && player.score < rankedPlayers[index - 1].score) {
                rank = index + 1;
            }
            if (rank <= 3) {
                entries.push({ user: player, rank });
            }
        });
        return entries;
    })();

    const isSuccess = Boolean(notification?.includes("Chúc mừng"));

    return (
        <>
            {noWinnerMessage && (
                <div className="stage-overlay">
                    <div className="overlay-card">
                        <PixelIcon name="clock" size={30} />
                        <span className="overlay-kicker">Hết thời gian</span>
                        <h2 className="overlay-title">{noWinnerMessage}</h2>
                    </div>
                </div>
            )}

            {gameState === "BATTLE" && !noWinnerMessage && (
                <div className="stage-overlay">
                    <div className="overlay-card">
                        <span className="overlay-kicker">Ai cầm mic đây?</span>
                        <h2 className="overlay-title">Đập nút thật nhanh!</h2>
                        <button
                            type="button"
                            className="buzzer-btn"
                            onClick={onBuzzer}
                        >
                            {clickCount > 0 ? `ĐẬP NÚT! (${clickCount})` : "ĐẬP NÚT!"}
                        </button>
                        <p className="overlay-text">Bấm liên tục! Ai bấm nhiều nhất sẽ giành mic.</p>
                    </div>
                </div>
            )}

            {gameState === "WINNER_SHOW" && (
                <div className="stage-overlay">
                    <div className="overlay-card">
                        <span className="overlay-kicker">Mic thuộc về</span>
                        <PixelIcon name="mic" size={34} />
                        <div className="winner-name">
                            {winnerUser && winnerUser.userId === userId ? "Bạn!" : winnerUser?.userName}
                        </div>
                        <p className="overlay-text">Chuẩn bị tinh thần nào...</p>
                    </div>
                </div>
            )}

            {gameState === "COUNTDOWN" && (
                <div className="stage-overlay">
                    <div className="countdown-digit">{countdownNum > 0 ? countdownNum : "HÁT!"}</div>
                </div>
            )}

            {gameState === "PERFORMANCE_EVALUATION" && (
                <div className="stage-overlay">
                    <div className="overlay-card">
                        <PixelIcon name="sparkles" size={32} />
                        <span className="overlay-kicker">Đang chấm điểm</span>
                        <h2 className="overlay-title">Đã biểu diễn xong!</h2>
                        <p className="overlay-text">AI đang phân tích và chấm điểm giọng hát...</p>
                    </div>
                </div>
            )}

            {gameState === "SCORE_SHOW" && (
                <div className="stage-overlay">
                    <div className="overlay-card">
                        <PixelIcon name={isSuccess ? "trophy" : "heart"} size={32} />
                        <span className="overlay-kicker">Kết quả lượt hát</span>
                        <h2 className={`overlay-title ${isSuccess ? "overlay-score--success" : "overlay-score--fail"}`}>
                            {notification}
                        </h2>
                    </div>
                </div>
            )}

            {gameState === "END_GAME" && (
                <div className="stage-overlay">
                    <div className="overlay-card">
                        <span className="overlay-kicker">Tổng kết game</span>
                        <h2 className="overlay-title">Bảng vinh danh</h2>
                        {topRanks.length > 0 ? (
                            <div className="champion-list">
                                {topRanks.map((entry, index) => (
                                    <div key={`${entry.user.userId}-${index}`} className="champion-row">
                                        <span className={`rank-badge${entry.rank <= 3 ? ` rank-badge--${entry.rank}` : ""}`}>
                                            {entry.rank}
                                        </span>
                                        <span className="rank-name">{entry.user.userName}</span>
                                        <span className="rank-score">
                                            <PixelIcon name="star" size={12} />
                                            {entry.user.score} điểm
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="overlay-text">Chưa có ai ghi điểm.</p>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
