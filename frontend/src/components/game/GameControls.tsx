import type { GameState } from "../../types/game";

interface GameControlsProps {
    gameState: GameState;
    isHost: boolean;
    isReady: boolean;
    allReady: boolean;
    onStart: () => void;
    onToggleReady: () => void;
}

export default function GameControls({ gameState, isHost, isReady, allReady, onStart, onToggleReady }: GameControlsProps) {
    return (
        <div style={{ marginTop: "30px" }}>
            {gameState === "LOBBY" ? (
                isHost ? (
                    <button
                        onClick={onStart}
                        disabled={!allReady}
                        style={{
                            padding: "15px 50px",
                            fontSize: "24px",
                            fontWeight: 700,
                            cursor: allReady ? "pointer" : "not-allowed",
                            background: allReady ? "linear-gradient(135deg, #00f5d4, #118ab2)" : "rgba(120, 130, 160, 0.4)",
                            color: allReady ? "#001219" : "#d9dee7",
                            border: "none",
                            borderRadius: "50px",
                            boxShadow: allReady ? "0 8px 25px rgba(0, 245, 212, 0.35)" : "none"
                        }}>
                        {allReady ? "BẮT ĐẦU GAME" : "CHỜ MỌI NGƯỜI SẴN SÀNG..."}
                    </button>
                ) : (
                    <button
                        onClick={onToggleReady}
                        style={{
                            padding: "15px 50px",
                            fontSize: "24px",
                            fontWeight: 700,
                            cursor: "pointer",
                            background: isReady ? "linear-gradient(135deg, #ff7a59, #f72585)" : "linear-gradient(135deg, #00f5d4, #118ab2)",
                            color: isReady ? "#fff" : "#001219",
                            border: "none",
                            borderRadius: "50px",
                            boxShadow: `0 8px 25px ${isReady ? "rgba(247, 37, 133, 0.4)" : "rgba(0, 245, 212, 0.4)"}`
                        }}>
                        {isReady ? "HỦY SẴN SÀNG" : "SẴN SÀNG"}
                    </button>
                )
            ) : (
                <p style={{ color: "#a4b0be", fontSize: "18px" }}>Trò chơi đang diễn ra...</p>
            )}
        </div>
    );
}
