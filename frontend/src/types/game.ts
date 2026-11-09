export type GameState =
    | "LOBBY"
    | "PLAY_SEGMENT"
    | "BATTLE"
    | "PERFORMANCE"
    | "PERFORMANCE_EVALUATION"
    | "WINNER_SHOW"
    | "COUNTDOWN"
    | "SCORE_SHOW"
    | "END_GAME";
export type LyricsStatus = "idle" | "listening" | "unsupported" | "error";
export interface MusicInfo {
    videoUrl: string;
    startSeconds: number;
    serverStartTime: number;
    isPlaying: boolean;
    nextVideoUrl?: string | null;
    songId?: string | null;
    nextSongId?: string | null;
}
