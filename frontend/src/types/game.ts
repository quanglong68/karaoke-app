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
    | "COUNTDOWN";
export interface MusicInfo {
    videoUrl: string;
    startSeconds: number;
    serverStartTime: number;
    isPlaying: boolean;
}
