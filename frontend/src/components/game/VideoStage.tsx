import VideoPlayer from "../VideoPlayer";
import type { MusicInfo } from "../../types/game";

interface VideoStageProps {
    musicInfo: MusicInfo;
}

export default function VideoStage({ musicInfo }: VideoStageProps) {
    return (
        <VideoPlayer
            videoUrl={musicInfo.videoUrl}
            nextVideoUrl={musicInfo.nextVideoUrl ?? null}
            startSeconds={musicInfo.startSeconds}
            isPlaying={musicInfo.isPlaying}
            serverStartTime={musicInfo.serverStartTime}
            muted={false}
        />
    );
}
