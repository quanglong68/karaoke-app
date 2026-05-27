const USER_NAME_KEY = "userName";
const USER_ID_KEY = "userId";
const ROOM_NAME_KEY = "roomName";
const ROOM_ID_KEY = "roomId";
const ROOM_JOIN_TOKEN_KEY = "roomJoinToken";

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
    getRoomJoinToken(): string {
        return localStorage.getItem(ROOM_JOIN_TOKEN_KEY) || "";
    },
    setRoomJoinToken(value: string): void {
        localStorage.setItem(ROOM_JOIN_TOKEN_KEY, value);
    },
    clearRoomJoinToken(): void {
        localStorage.removeItem(ROOM_JOIN_TOKEN_KEY);
    },
};
