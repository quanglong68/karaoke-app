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

export interface GameSettings {
  maxRounds: number;
  maxPlayers: number;
  buzzerSeconds: number;
  countdownSeconds: number;
  performanceSeconds: number;
  minPerformanceSeconds: number;
  evaluationSeconds: number;
  nextPhaseDelaySeconds: number;
  endGameDelaySeconds: number;
  successScore: number;
  lyricsWeight: number;
}

export interface JoinRoomResponse {
  room: RoomSummary;
  user: User;
  sessionToken: string;
  settings: GameSettings;
}

export interface PerformanceResultPayload {
    user: User;
    isSuccess: boolean;
}
