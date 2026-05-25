const USER_NAME_KEY = "userName";
const USER_ID_KEY = "userId";
const ROOM_NAME_KEY = "roomName";

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
    }
};
