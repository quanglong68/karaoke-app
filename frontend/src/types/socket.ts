import type { GameState, MusicInfo } from "./game";
import type { VoteResultPayload } from "./room";
import type { User } from "./user";

export interface SocketMessage {
    type: GameState;
    content: string | MusicInfo | User | VoteResultPayload | User[];
    sender: string;
    roomId: string;
}
