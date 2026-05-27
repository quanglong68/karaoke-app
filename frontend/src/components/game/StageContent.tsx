import type { GameState, MusicInfo } from "../../types/game";
import type { User } from "../../types/user";
import LobbyPanel from "./LobbyPanel";
import PerformancePanel from "./PerformancePanel";
import VideoStage from "./VideoStage";

interface StageContentProps {
    gameState: GameState;
    playerList: User[];
    isHost: boolean;
    onKick: (userId: string) => void;
    perfCountdown: number;
    lyrics: string;
    isSinger: boolean;
    onFinishPerformance: () => void;
    musicInfo: MusicInfo;
}

export default function StageContent({
    gameState,
    playerList,
    isHost,
    onKick,
    perfCountdown,
    lyrics,
    isSinger,
    onFinishPerformance,
    musicInfo,
}: StageContentProps) {
    if (gameState === "LOBBY") {
        return <LobbyPanel playerList={playerList} isHost={isHost} onKick={onKick} />;
    }

    if (gameState === "PERFORMANCE") {
        return (
            <PerformancePanel
                perfCountdown={perfCountdown}
                lyrics={lyrics}
                isSinger={isSinger}
                onFinish={onFinishPerformance}
            />
        );
    }

    return <VideoStage musicInfo={musicInfo} />;
}
