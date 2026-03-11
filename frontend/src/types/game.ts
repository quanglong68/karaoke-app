export type GameState = 
    | "JOIN" 
    | "LOBBY" 
    | "PLAY_SEGMENT" 
    | "BATTLE" 
    | "PERFORMANCE" 
    | "VOTE" 
    | "CHAT" 
    | "PAUSE";
export interface MusicInfo {
    videoId: string;
    startSeconds: number;
    endSeconds: number;
    isPlaying: boolean;
}
