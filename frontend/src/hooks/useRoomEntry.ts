import { useEffect } from "react";
import type { JoinRoomResponse } from "../types/room";
import { getApiErrorCode, getApiErrorMessage, roomService } from "../services/roomService";
import { storage } from "../utils/storage";

const REDIRECT_DELAY_MS = 1400;

const JOIN_ERROR_MESSAGES: Record<string, string> = {
    ROOM_NOT_FOUND: "Không tìm thấy phòng.",
    ROOM_FULL: "Phòng đã đầy.",
    ROOM_PLAYING: "Phòng đang chơi, bạn không thể vào lại lúc này.",
    RATE_LIMITED: "Bạn thao tác quá nhanh, vui lòng thử lại sau.",
};

interface UseRoomEntryOptions {
    roomId: string | undefined;
    onSessionReady: (data: JoinRoomResponse) => void;
    onSessionCleared: () => void;
    onCanConnectChange: (canConnect: boolean) => void;
    showToast: (type: "success" | "error" | "info", text: string) => void;
    onRedirectHome?: () => void;
}

const defaultRedirectHome = () => {
    window.location.href = "/";
};

/**
 * Handles the initial room entry handshake: attempts session rejoin first,
 * cleanly leaves a mismatched room token, or falls back to joining fresh.
 */
export function useRoomEntry({
    roomId,
    onSessionReady,
    onSessionCleared,
    onCanConnectChange,
    showToast,
    onRedirectHome = defaultRedirectHome,
}: UseRoomEntryOptions): void {
    useEffect(() => {
        if (!roomId) return;
        const storedName = storage.getUserName();
        if (!storedName) {
            onRedirectHome();
            return;
        }
        let active = true;
        let redirectTimer: number | null = null;

        const fail = (error: unknown) => {
            const code = getApiErrorCode(error);
            const message = (code && JOIN_ERROR_MESSAGES[code])
                || getApiErrorMessage(error, "Không thể vào phòng. Vui lòng thử lại.");
            showToast("error", message);
            onSessionCleared();
            redirectTimer = window.setTimeout(() => {
                onRedirectHome();
            }, REDIRECT_DELAY_MS);
        };

        const enterRoom = async () => {
            const token = storage.getSessionToken();
            if (token) {
                try {
                    const data = await roomService.rejoin(token);
                    if (!active) return;
                    if (data.room.roomId === roomId) {
                        onSessionReady(data);
                        return;
                    }
                    // The stored token belongs to another room: leave it first so this
                    // browser does not occupy a ghost player slot.
                    await roomService.leaveRoom(token).catch(() => undefined);
                    onSessionCleared();
                } catch (error) {
                    if (!active) return;
                    const code = getApiErrorCode(error);
                    // ROOM_NOT_FOUND from rejoin means the old token's room closed; clear
                    // the stale token and try joining the requested roomId fresh.
                    if (code !== "SESSION_INVALID" && code !== "ROOM_NOT_FOUND") {
                        fail(error);
                        return;
                    }
                    onSessionCleared();
                }
            }
            try {
                const data = await roomService.joinRoom(roomId, storedName);
                if (!active) return;
                onSessionReady(data);
            } catch (error) {
                if (!active) return;
                fail(error);
            }
        };

        onCanConnectChange(false);
        void enterRoom();

        return () => {
            active = false;
            if (redirectTimer !== null) {
                window.clearTimeout(redirectTimer);
            }
        };
    }, [roomId, onCanConnectChange, onRedirectHome, onSessionCleared, onSessionReady, showToast]);
}
