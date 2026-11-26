import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_SETTINGS } from "../../constants/game";
import type { GameConfigLimit } from "../../services/adminService";
import {
    formValuesToSettings,
    settingsToFormValues,
    validateGameConfigValues,
} from "./gameConfigSchema";

const LIMITS: Record<string, GameConfigLimit> = {
    maxRounds: { min: 1, max: 10, step: 1 },
    maxPlayers: { min: 2, max: 8, step: 1 },
    buzzerSeconds: { min: 3, max: 10, step: 1 },
    countdownSeconds: { min: 2, max: 5, step: 1 },
    performanceSeconds: { min: 30, max: 180, step: 5 },
    minPerformanceSeconds: { min: 5, max: 175, step: 1 },
    evaluationSeconds: { min: 10, max: 30, step: 1 },
    nextPhaseDelaySeconds: { min: 1, max: 10, step: 1 },
    endGameDelaySeconds: { min: 3, max: 15, step: 1 },
    successScore: { min: 50, max: 100, step: 1 },
    lyricsWeight: { min: 0.1, max: 0.9, step: 0.05 },
};

describe("gameConfigSchema", () => {
    it("round-trips GameSettings through string form values", () => {
        const values = settingsToFormValues(DEFAULT_GAME_SETTINGS);
        expect(formValuesToSettings(values)).toEqual(DEFAULT_GAME_SETTINGS);
        expect(validateGameConfigValues(values, LIMITS)).toEqual({});
    });

    it("rejects out-of-range fields and enforces the 5s performance buffer", () => {
        const values = {
            ...settingsToFormValues(DEFAULT_GAME_SETTINGS),
            maxPlayers: "99",
            performanceSeconds: "40",
            minPerformanceSeconds: "38",
        };
        const errors = validateGameConfigValues(values, LIMITS);
        expect(errors.maxPlayers).toContain("2–8");
        expect(errors.minPerformanceSeconds).toContain("35");
    });

    it("rejects decimal inputs for integer fields while allowing decimal lyricsWeight", () => {
        const values = {
            ...settingsToFormValues(DEFAULT_GAME_SETTINGS),
            maxRounds: "3.5",
            lyricsWeight: "0.45",
        };
        const errors = validateGameConfigValues(values, LIMITS);
        expect(errors.maxRounds).toContain("số nguyên");
        expect(errors.lyricsWeight).toBeUndefined();
    });
});
