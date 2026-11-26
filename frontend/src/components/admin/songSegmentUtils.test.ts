import { describe, expect, it } from "vitest";
import {
    applySegmentChange,
    cleanClientFilenameTitle,
    computeDefaultSegments,
    isLikelyYoutubeUrl,
    parseFlexibleSeconds,
    validateSegments,
} from "./songSegmentUtils";

describe("songSegmentUtils", () => {
    it("computes sensible default listen & sing segments for long and short videos", () => {
        const fullMv = computeDefaultSegments(210);
        expect(fullMv.listenStart).toBe(20);
        expect(fullMv.listenEnd).toBe(35);
        expect(fullMv.singStart).toBe(35);
        expect(fullMv.singEnd).toBe(55);

        const shortClip = computeDefaultSegments(14);
        expect(shortClip.listenStart).toBe(0);
        expect(validateSegments(shortClip, 14)).toBe("");
    });

    it("parses flexible decimal seconds and mm:ss.d formats", () => {
        expect(parseFlexibleSeconds("44.5")).toBe(44.5);
        expect(parseFlexibleSeconds("44,5")).toBe(44.5);
        expect(parseFlexibleSeconds("01:14.5")).toBe(74.5);
        expect(parseFlexibleSeconds("1:04,25")).toBe(64.25);
        expect(parseFlexibleSeconds("abc")).toBeNull();
    });

    it("keeps listenEnd and singStart linked seamlessly with decimal precision", () => {
        const base = { listenStart: 20, listenEnd: 35, singStart: 35, singEnd: 55 };
        const updated = applySegmentChange(base, "listenEnd", 44.5, 180, true);
        expect(updated).toEqual({
            listenStart: 20,
            listenEnd: 44.5,
            singStart: 44.5,
            singEnd: 55,
        });
    });

    it("enforces segment duration and total bounds", () => {
        expect(
            validateSegments({ listenStart: 10, listenEnd: 11, singStart: 11, singEnd: 25 }, 120),
        ).toContain("Đoạn mồi");
        expect(
            validateSegments({ listenStart: 10, listenEnd: 25, singStart: 25, singEnd: 28 }, 120),
        ).toContain("Đoạn hát");
        expect(
            validateSegments({ listenStart: 10, listenEnd: 25, singStart: 25, singEnd: 65 }, 50),
        ).toContain("vượt quá");
    });

    it("cleans filename noise and validates YouTube URLs", () => {
        expect(cleanClientFilenameTitle("1779788712975_main_Khong_Buong [Official MV].mp4")).toBe(
            "Khong Buong",
        );
        expect(isLikelyYoutubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
        expect(isLikelyYoutubeUrl("https://evil.example.com/watch?v=123")).toBe(false);
    });
});
