import { describe, expect, it } from "vitest";
import { autoCorrelate, medianOf } from "./pitchDetection";

function sineWave(frequency: number, sampleRate: number, size = 2048) {
    const buffer = new Float32Array(size);
    for (let i = 0; i < size; i += 1) {
        buffer[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    }
    return buffer;
}

describe("pitchDetection", () => {
    it("medianOf sorts and picks the middle value", () => {
        expect(medianOf([])).toBe(0);
        expect(medianOf([5, 1, 3])).toBe(3);
        expect(medianOf([4, 1, 3, 2])).toBe(3);
    });

    it("returns -1 for silence", () => {
        expect(autoCorrelate(new Float32Array(2048), 48_000)).toBe(-1);
    });

    it("detects a 440 Hz sine wave", () => {
        const hz = autoCorrelate(sineWave(440, 48_000), 48_000);
        expect(hz).toBeGreaterThan(420);
        expect(hz).toBeLessThan(460);
    });
});
