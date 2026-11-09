const USER_NAME_KEY = "userName";
const USER_ID_KEY = "userId";
const ROOM_NAME_KEY = "roomName";
const ROOM_ID_KEY = "roomId";
const SESSION_TOKEN_KEY = "sessionToken";
const LEGACY_ROOM_JOIN_TOKEN_KEY = "roomJoinToken";
const REMOTE_VOLUME_KEY = "karaokeRemoteVolume";
const PLAYER_VOLUMES_KEY = "karaokePlayerVolumes";
const REMOTE_VOLUME_DEFAULT = 150;

export const storage = {
    getUserName(): string {
        return localStorage.getItem(USER_NAME_KEY) || "";
    },
    setUserName(value: string): void {
        localStorage.setItem(USER_NAME_KEY, value);
    },
    getUserId(): string {
        return localStorage.getItem(USER_ID_KEY) || "";
    },
    setUserId(value: string): void {
        localStorage.setItem(USER_ID_KEY, value);
    },
    getRoomName(): string {
        return localStorage.getItem(ROOM_NAME_KEY) || "";
    },
    setRoomName(value: string): void {
        localStorage.setItem(ROOM_NAME_KEY, value);
    },
    getRoomId(): string {
        return localStorage.getItem(ROOM_ID_KEY) || "";
    },
    setRoomId(value: string): void {
        localStorage.setItem(ROOM_ID_KEY, value);
    },
    getSessionToken(): string {
        return localStorage.getItem(SESSION_TOKEN_KEY) || "";
    },
    setSessionToken(value: string): void {
        localStorage.setItem(SESSION_TOKEN_KEY, value);
    },
    clearSessionToken(): void {
        localStorage.removeItem(SESSION_TOKEN_KEY);
        localStorage.removeItem(LEGACY_ROOM_JOIN_TOKEN_KEY);
    },
    getRemoteVolume(): number {
        const raw = localStorage.getItem(REMOTE_VOLUME_KEY);
        if (raw === null) return REMOTE_VOLUME_DEFAULT;
        const value = Number(raw);
        if (!Number.isFinite(value)) return REMOTE_VOLUME_DEFAULT;
        return Math.min(300, Math.max(0, Math.round(value)));
    },
    setRemoteVolume(value: number): void {
        localStorage.setItem(REMOTE_VOLUME_KEY, String(Math.round(value)));
    },
    getPlayerVolumes(): Record<string, number> {
        try {
            const raw = localStorage.getItem(PLAYER_VOLUMES_KEY);
            if (!raw) return {};
            const parsed: unknown = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
            const result: Record<string, number> = {};
            Object.entries(parsed as Record<string, unknown>).forEach(([userId, value]) => {
                const numeric = Number(value);
                if (userId && Number.isFinite(numeric)) {
                    result[userId] = Math.min(300, Math.max(0, Math.round(numeric)));
                }
            });
            return result;
        } catch {
            return {};
        }
    },
    setPlayerVolumes(values: Record<string, number>): void {
        const entries = Object.entries(values).slice(-50);
        localStorage.setItem(PLAYER_VOLUMES_KEY, JSON.stringify(Object.fromEntries(entries)));
    },
};
