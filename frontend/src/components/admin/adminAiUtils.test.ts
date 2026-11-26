import { describe, expect, it } from "vitest";
import {
    buildPriorityMove,
    validateApiKeyInput,
    validateModelNameInput,
    validatePriorityInput,
} from "./adminAiUtils";

describe("adminAiUtils", () => {
    it("validates priority bounds", () => {
        expect(validatePriorityInput("10")).toEqual({ value: 10, error: "" });
        expect(validatePriorityInput("-1").error).not.toBe("");
        expect(validatePriorityInput("10001").error).not.toBe("");
        expect(validatePriorityInput("12.5").error).not.toBe("");
    });

    it("validates API key and model name patterns", () => {
        expect(validateApiKeyInput("")).not.toBe("");
        expect(validateApiKeyInput("AIzaSyValidKey123")).toBe("");
        expect(validateModelNameInput("gemini-2.5-flash")).toBe("");
        expect(validateModelNameInput("bad model!")).not.toBe("");
    });

    it("swaps distinct priorities and offsets tied priorities cleanly", () => {
        const distinct = [
            { id: 1, priority: 10 },
            { id: 2, priority: 20 },
        ];
        expect(buildPriorityMove(distinct, 1, "up")).toEqual([
            { id: 2, priority: 10 },
            { id: 1, priority: 20 },
        ]);

        const tied = [
            { id: 1, priority: 100 },
            { id: 2, priority: 100 },
        ];
        expect(buildPriorityMove(tied, 1, "up")).toEqual([{ id: 2, priority: 99 }]);
        expect(buildPriorityMove(tied, 0, "down")).toEqual([{ id: 1, priority: 101 }]);
    });
});
