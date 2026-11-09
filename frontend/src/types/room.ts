import type { GameState } from "./game";
import type { User } from "./user";

export interface RoomSummary {
  roomId: string;
  roomName: string;
  gameState: GameState;
  playerCount: number;
  maxPlayers: number;
  upcomingVideoUrl: string | null;
}

export interface JoinRoomResponse {
  room: RoomSummary;
  user: User;
  sessionToken: string;
}

export interface PerformanceResultPayload {
    user: User;
    isSuccess: boolean;
}
