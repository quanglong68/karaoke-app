const USER_NAME_KEY = "userName";
const USER_ID_KEY = "userId";
const ROOM_NAME_KEY = "roomName";
const ROOM_ID_KEY = "roomId";
const SESSION_TOKEN_KEY = "sessionToken";
const LEGACY_ROOM_JOIN_TOKEN_KEY = "roomJoinToken";
const REMOTE_VOLUME_KEY = "karaokeRemoteVolume";
const PLAYER_VOLUMES_KEY = "karaokePlayerVolumes";
const REMOTE_VOLUME_DEFAULT = 150;

// Private mode / storage quota can make localStorage throw; the app must keep
// working with in-memory defaults instead of crashing during render.
const read = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const write = (key: string, value: string): void => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Best effort only.
    }
};

const remove = (key: string): void => {
    try {
        localStorage.removeItem(key);
    } catch {
        // Best effort only.
    }
};

export const storage = {
    getUserName(): string {
        return read(USER_NAME_KEY) || "";
    },
    setUserName(value: string): void {
        write(USER_NAME_KEY, value);
    },
    getUserId(): string {
        return read(USER_ID_KEY) || "";
    },
    setUserId(value: string): void {
        write(USER_ID_KEY, value);
    },
    getRoomName(): string {
        return read(ROOM_NAME_KEY) || "";
    },
    setRoomName(value: string): void {
        write(ROOM_NAME_KEY, value);
    },
    getRoomId(): string {
        return read(ROOM_ID_KEY) || "";
    },
    setRoomId(value: string): void {
        write(ROOM_ID_KEY, value);
    },
    getSessionToken(): string {
        return read(SESSION_TOKEN_KEY) || "";
    },
    setSessionToken(value: string): void {
        write(SESSION_TOKEN_KEY, value);
    },
    clearSessionToken(): void {
        remove(SESSION_TOKEN_KEY);
        remove(LEGACY_ROOM_JOIN_TOKEN_KEY);
    },
    getRemoteVolume(): number {
        const raw = read(REMOTE_VOLUME_KEY);
        if (raw === null) return REMOTE_VOLUME_DEFAULT;
        const value = Number(raw);
        if (!Number.isFinite(value)) return REMOTE_VOLUME_DEFAULT;
        return Math.min(300, Math.max(0, Math.round(value)));
    },
    setRemoteVolume(value: number): void {
        write(REMOTE_VOLUME_KEY, String(Math.round(value)));
    },
    getPlayerVolumes(): Record<string, number> {
        try {
            const raw = read(PLAYER_VOLUMES_KEY);
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
        write(PLAYER_VOLUMES_KEY, JSON.stringify(Object.fromEntries(entries)));
    },
};
