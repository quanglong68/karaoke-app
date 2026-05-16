export type GameState = 
    | "JOIN" 
    | "LOBBY" 
    | "PLAY_SEGMENT" 
    | "BATTLE" 
    | "PERFORMANCE" 
    | "VOTE" 
    | "CHAT" 
    | "PAUSE"
    | "WINNER_SHOW"
    | "COUNTDOWN"
    | "VOICE"
    | "RTC_SIGNAL"
    | "SCORE_SHOW"
    | "END_GAME"
    | "KICK_PLAYER"
    | "TOGGLE_READY";
export interface MusicInfo {
    videoUrl: string;
    startSeconds: number;
    serverStartTime: number;
    isPlaying: boolean;
}
