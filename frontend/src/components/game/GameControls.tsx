import type { GameState } from "../../types/game";
import PixelIcon from "../ui/PixelIcon";

interface GameControlsProps {
    gameState: GameState;
    isHost: boolean;
    isReady: boolean;
    allReady: boolean;
    onStart: () => void;
    onToggleReady: () => void;
}

export default function GameControls({ gameState, isHost, isReady, allReady, onStart, onToggleReady }: GameControlsProps) {
    if (gameState !== "LOBBY") {
        return (
            <div className="game-controls">
                <span className="game-controls-note">
                    <PixelIcon name="clock" size={16} />
                    Trò chơi đang diễn ra...
                </span>
            </div>
        );
    }

    return (
        <div className="game-controls">
            {isHost ? (
                <button
                    type="button"
                    className="pbtn pbtn--primary pbtn--xl"
                    onClick={onStart}
                    disabled={!allReady}
                >
                    <PixelIcon name="play" size={22} />
                    {allReady ? "Bắt đầu game" : "Chờ mọi người sẵn sàng..."}
                </button>
            ) : (
                <button
                    type="button"
                    className={`pbtn pbtn--xl ${isReady ? "pbtn--danger" : "pbtn--accent"}`}
                    onClick={onToggleReady}
                >
                    <PixelIcon name={isReady ? "close" : "check"} size={22} />
                    {isReady ? "Hủy sẵn sàng" : "Sẵn sàng"}
                </button>
            )}
        </div>
    );
}
