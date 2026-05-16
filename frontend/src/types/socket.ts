import type { GameState, MusicInfo } from "./game";
import type { VoteResultPayload } from "./room";
import type { User } from "./user";

export interface VoicePayload {
    data: string;
    mimeType: string;
    streamId?: number;
}

export interface RtcSignalPayload {
    action: "offer" | "answer" | "candidate";
    from: string;
    to?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
}

export interface SocketMessage {
    type: GameState;
    content: string | MusicInfo | User | VoteResultPayload | User[] | VoicePayload | RtcSignalPayload;
    sender: string;
    roomId: string;
}
