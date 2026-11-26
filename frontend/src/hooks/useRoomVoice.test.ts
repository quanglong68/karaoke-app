import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseIceServers, useRoomVoice } from "./useRoomVoice";

describe("useRoomVoice", () => {
    const originalMediaDevices = navigator.mediaDevices;

    afterEach(() => {
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: originalMediaDevices,
        });
    });

    it("keeps isMutedAll referentially stable across re-renders", () => {
        const sendRtcSignal = vi.fn();
        const showToast = vi.fn();

        const { result, rerender } = renderHook(
            ({ gameState }) =>
                useRoomVoice({
                    userId: "u1",
                    playerList: [],
                    gameState,
                    winnerUser: null,
                    sendRtcSignal,
                    showToast,
                }),
            { initialProps: { gameState: "LOBBY" as const } },
        );

        const firstIsMutedAll = result.current.isMutedAll;
        rerender({ gameState: "LOBBY" as const });
        expect(result.current.isMutedAll).toBe(firstIsMutedAll);
    });

    it("stops microphone tracks if getUserMedia resolves after unmount", async () => {
        let resolveStream!: (stream: MediaStream) => void;
        const stopTrack = vi.fn();
        const fakeStream = {
            getTracks: () => [{ stop: stopTrack, kind: "audio", enabled: true }],
            getAudioTracks: () => [{ stop: stopTrack, kind: "audio", enabled: true }],
        } as unknown as MediaStream;

        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                getUserMedia: vi.fn(
                    () => new Promise<MediaStream>((resolve) => { resolveStream = resolve; }),
                ),
            },
        });

        const { result, unmount } = renderHook(() =>
            useRoomVoice({
                userId: "u1",
                playerList: [],
                gameState: "LOBBY",
                winnerUser: null,
                sendRtcSignal: vi.fn(),
                showToast: vi.fn(),
            }),
        );

        const pending = result.current.ensureLocalStream();
        unmount();

        await act(async () => {
            resolveStream(fakeStream);
            const resolved = await pending;
            expect(resolved).toBeNull();
        });

        expect(stopTrack).toHaveBeenCalledTimes(1);
    });

    it("parses custom ICE/TURN server JSON and falls back safely on invalid input", () => {
        expect(parseIceServers(undefined)).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
        expect(parseIceServers("not-json")).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);

        const custom = parseIceServers(
            JSON.stringify([
                { urls: "stun:stun.l.google.com:19302" },
                { urls: ["turns:turn.example.com:5349"], username: "u", credential: "p" },
            ]),
        );
        expect(custom).toHaveLength(2);
        expect(custom[1]).toMatchObject({ username: "u", credential: "p" });
    });
});
