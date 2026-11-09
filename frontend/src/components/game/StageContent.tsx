import type { GameState, LyricsStatus, MusicInfo } from "../../types/game";
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
    singerName?: string | null;
    onFinishPerformance: () => void;
    musicInfo: MusicInfo;
    muted?: boolean;
    lyricsStatus?: LyricsStatus;
}

export default function StageContent({
    gameState,
    playerList,
    isHost,
    onKick,
    perfCountdown,
    lyrics,
    isSinger,
    singerName = null,
    onFinishPerformance,
    musicInfo,
    muted = false,
    lyricsStatus = "idle",
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
                singerName={singerName}
                onFinish={onFinishPerformance}
                lyricsStatus={lyricsStatus}
            />
        );
    }

    return <VideoStage musicInfo={musicInfo} muted={muted} />;
}
