import VideoPlayer from "../VideoPlayer";
import type { MusicInfo } from "../../types/game";

interface VideoStageProps {
    musicInfo: MusicInfo;
    muted?: boolean;
}

export default function VideoStage({ musicInfo, muted = false }: VideoStageProps) {
    return (
        <VideoPlayer
            videoUrl={musicInfo.videoUrl}
            nextVideoUrl={musicInfo.nextVideoUrl ?? null}
            startSeconds={musicInfo.startSeconds}
            isPlaying={musicInfo.isPlaying}
            serverStartTime={musicInfo.serverStartTime}
            muted={muted}
        />
    );
}
