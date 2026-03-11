import type { GameState, MusicInfo } from "./game";
import type { User } from "./user";

export interface SocketMessage {
    type: GameState;
    content: string | MusicInfo | User;
    sender: string;
    roomId: string;
}
