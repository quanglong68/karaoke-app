import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePitchCapture } from "./usePitchCapture";

class FakeSpeechRecognition {
    static latest: FakeSpeechRecognition | null = null;
    continuous = false;
    interimResults = false;
    lang = "";
    onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null = null;
    onerror: ((event: { error?: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn();

    constructor() {
        FakeSpeechRecognition.latest = this;
    }
}

describe("usePitchCapture", () => {
    const speechWindow = window as Window & {
        SpeechRecognition?: typeof FakeSpeechRecognition;
        webkitSpeechRecognition?: typeof FakeSpeechRecognition;
    };
    const originalSpeech = speechWindow.SpeechRecognition;
    const originalWebkitSpeech = speechWindow.webkitSpeechRecognition;

    beforeEach(() => {
        vi.useFakeTimers();
        FakeSpeechRecognition.latest = null;
        speechWindow.SpeechRecognition = FakeSpeechRecognition;
        speechWindow.webkitSpeechRecognition = undefined;
    });

    afterEach(() => {
        vi.useRealTimers();
        speechWindow.SpeechRecognition = originalSpeech;
        speechWindow.webkitSpeechRecognition = originalWebkitSpeech;
    });

    it("preserves earlier transcript when SpeechRecognition restarts mid-performance", async () => {
        const onSubmit = vi.fn();
        const { rerender } = renderHook(
            ({ enabled, sendLyricsOnFinish }) =>
                usePitchCapture({
                    enabled,
                    sendLyricsOnFinish,
                    getStream: () => null,
                    ensureStream: () => Promise.resolve(null),
                    onSubmit,
                }),
            { initialProps: { enabled: true, sendLyricsOnFinish: false } },
        );

        await act(async () => {
            await Promise.resolve();
        });

        const recognition = FakeSpeechRecognition.latest!;
        expect(recognition).not.toBeNull();
        expect(recognition.start).toHaveBeenCalledTimes(1);

        // First recognition session before Chrome stops.
        act(() => {
            recognition.onresult?.({ results: [[{ transcript: "đêm đông" }]] });
            recognition.onend?.();
        });

        // Advance past restart delay so recognition restarts with fresh event.results.
        act(() => {
            vi.advanceTimersByTime(650);
        });
        expect(recognition.start).toHaveBeenCalledTimes(2);

        // Second recognition session produces only the new phrase.
        act(() => {
            recognition.onresult?.({ results: [[{ transcript: "đi đâu về đâu" }]] });
        });

        // Transition to evaluation -> must submit BOTH halves.
        rerender({ enabled: false, sendLyricsOnFinish: true });

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit.mock.calls[0][0]).toBe("đêm đông đi đâu về đâu");
    });
});
