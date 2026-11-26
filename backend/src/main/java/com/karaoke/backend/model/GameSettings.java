package com.karaoke.backend.model;

/**
 * Immutable snapshot of the room rules. A room captures one instance when it is
 * created, so an admin edit never changes the clock of a game already in progress.
 */
public record GameSettings(
        int maxRounds,
        int maxPlayers,
        int buzzerSeconds,
        int countdownSeconds,
        int performanceSeconds,
        int minPerformanceSeconds,
        int evaluationSeconds,
        int nextPhaseDelaySeconds,
        int endGameDelaySeconds,
        int successScore,
        double lyricsWeight) {

    public static GameSettings defaults() {
        return new GameSettings(3, 5, 5, 3, 60, 15, 15, 3, 5, 70, 0.4);
    }

    public int performanceSecondsMillis() {
        return performanceSeconds * 1_000;
    }

    public long minPerformanceMillis() {
        return minPerformanceSeconds * 1_000L;
    }
}
