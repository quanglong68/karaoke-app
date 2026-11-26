import { renderHook, waitFor } from "@testing-library/react";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRoomEntry } from "./useRoomEntry";
import { roomService } from "../services/roomService";
import { storage } from "../utils/storage";
import { DEFAULT_GAME_SETTINGS } from "../constants/game";
import type { JoinRoomResponse } from "../types/room";

vi.mock("../services/roomService", async () => {
    const actual = await vi.importActual<typeof import("../services/roomService")>("../services/roomService");
    return {
        ...actual,
        roomService: {
            ...actual.roomService,
            rejoin: vi.fn(),
            joinRoom: vi.fn(),
            leaveRoom: vi.fn(),
        },
    };
});

function makeApiError(status: number, code: string) {
    return new axios.AxiosError(
        code,
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
            status,
            statusText: code,
            headers: {},
            config: { headers: new axios.AxiosHeaders() },
            data: { code, message: code },
        },
    );
}

describe("useRoomEntry", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it("falls back to fresh join when a stale token's previous room returns ROOM_NOT_FOUND", async () => {
        storage.setUserName("Alice");
        storage.setSessionToken("stale-token-from-closed-room");
        vi.mocked(roomService.rejoin).mockRejectedValueOnce(makeApiError(404, "ROOM_NOT_FOUND"));
        const joined: JoinRoomResponse = {
            room: {
                roomId: "room-new",
                roomName: "Phòng Mới",
                gameState: "LOBBY",
                playerCount: 1,
                maxPlayers: 5,
                upcomingVideoUrl: null,
            },
            user: { userId: "u1", userName: "Alice", score: 0, isHost: false, isReady: false },
            sessionToken: "fresh-token",
            settings: DEFAULT_GAME_SETTINGS,
        };
        vi.mocked(roomService.joinRoom).mockResolvedValueOnce(joined);

        const onSessionReady = vi.fn();
        const onSessionCleared = vi.fn();
        const onCanConnectChange = vi.fn();
        const showToast = vi.fn();

        renderHook(() =>
            useRoomEntry({
                roomId: "room-new",
                onSessionReady,
                onSessionCleared,
                onCanConnectChange,
                showToast,
            }),
        );

        await waitFor(() => {
            expect(onSessionReady).toHaveBeenCalledWith(joined);
        });
        expect(onSessionCleared).toHaveBeenCalledTimes(1);
        expect(roomService.joinRoom).toHaveBeenCalledWith("room-new", "Alice");
        expect(showToast).not.toHaveBeenCalled();
    });
});
