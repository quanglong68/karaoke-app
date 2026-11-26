import axios from "axios";
import type { JoinRoomResponse, RoomSummary } from "../types/room";
import { API_BASE_URL } from "../constants/api";
export { getApiErrorCode, getApiErrorMessage } from "./apiError";

const API = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
});

export const roomService = {
    createRoom: async (roomName: string, userName: string): Promise<JoinRoomResponse> => {
        const response = await API.post("/api/rooms/create", { roomName, userName });
        return response.data;
    },
    joinRoom: async (roomId: string, userName: string): Promise<JoinRoomResponse> => {
        const response = await API.post("/api/rooms/join", { roomId, userName });
        return response.data;
    },
    rejoin: async (sessionToken: string): Promise<JoinRoomResponse> => {
        const response = await API.post("/api/rooms/rejoin", null, {
            headers: { "X-Session-Token": sessionToken },
        });
        return response.data;
    },
    listRooms: async (): Promise<RoomSummary[]> => {
        const response = await API.get("/api/rooms/list");
        return response.data;
    },
    leaveRoom: async (sessionToken: string): Promise<void> => {
        await API.post("/api/rooms/leave", null, {
            headers: { "X-Session-Token": sessionToken },
        });
    },
};
