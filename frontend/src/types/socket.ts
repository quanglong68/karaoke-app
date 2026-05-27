import type { MusicInfo } from "./game";
import type { MessageType } from "./message";
import type { User } from "./user";
import type { PerformanceResultPayload } from "./room";

export interface RtcSignalPayload {
    action: "offer" | "answer" | "candidate";
    from: string;
    to?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
}

export interface UserLyricsPayload {
    lyrics: string;
    pitchContour: number[];
}

export interface RenamePayload {
    userName: string;
}

export interface SocketMessage {
    type: MessageType;
    content: string | MusicInfo | User | PerformanceResultPayload | User[] | RtcSignalPayload | UserLyricsPayload | RenamePayload;
    sender: string;
    roomId: string;
}
