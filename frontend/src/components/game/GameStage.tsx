import type { GameState } from "../../types/game";
import type { MusicInfo } from "../../types/game";
import type { User } from "../../types/user";
import type { RankedUser } from "./Leaderboard";
import GameOverlays from "./GameOverlays";
import StageContent from "./StageContent";
import StageFrame from "./StageFrame";

interface GameStageProps {
    gameState: GameState;
    playerList: User[];
    isHost: boolean;
    onKick: (userId: string) => void;
    perfCountdown: number;
    lyrics: string;
    isSinger: boolean;
    onFinishPerformance: () => void;
    musicInfo: MusicInfo;
    clickCount: number;
    onBuzzer: () => void;
    winnerUser: User | null;
    userId: string;
    countdownNum: number;
    notification: string | null;
    noWinnerMessage: string | null;
    rankedPlayers: RankedUser[];
    muted?: boolean;
}

export default function GameStage({
    gameState,
    playerList,
    isHost,
    onKick,
    perfCountdown,
    lyrics,
    isSinger,
    onFinishPerformance,
    musicInfo,
    clickCount,
    onBuzzer,
    winnerUser,
    userId,
    countdownNum,
    notification,
    noWinnerMessage,
    rankedPlayers,
    muted = false,
}: GameStageProps) {
    return (
        <StageFrame>
            <StageContent
                gameState={gameState}
                playerList={playerList}
                isHost={isHost}
                onKick={onKick}
                perfCountdown={perfCountdown}
                lyrics={lyrics}
                isSinger={isSinger}
                onFinishPerformance={onFinishPerformance}
                musicInfo={musicInfo}
                muted={muted}
            />
            <GameOverlays
                gameState={gameState}
                clickCount={clickCount}
                onBuzzer={onBuzzer}
                winnerUser={winnerUser}
                userId={userId}
                countdownNum={countdownNum}
                notification={notification}
                noWinnerMessage={noWinnerMessage}
                rankedPlayers={rankedPlayers}
            />
        </StageFrame>
    );
}
