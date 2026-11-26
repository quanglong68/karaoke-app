import type { GameSettings } from "../types/room";

// Fallback while the room is still loading; the server sends the real snapshot
// with the join response and keeps it fixed for the whole game.
export const DEFAULT_GAME_SETTINGS: GameSettings = {
    maxRounds: 3,
    maxPlayers: 5,
    buzzerSeconds: 5,
    countdownSeconds: 3,
    performanceSeconds: 60,
    minPerformanceSeconds: 15,
    evaluationSeconds: 15,
    nextPhaseDelaySeconds: 3,
    endGameDelaySeconds: 5,
    successScore: 70,
    lyricsWeight: 0.4,
};

export const MAX_CHAT_LENGTH = 500;
export const MAX_MESSAGES = 200;
export const MAX_USER_NAME_LENGTH = 24;
