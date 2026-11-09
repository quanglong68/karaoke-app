import axios from "axios";
import type { JoinRoomResponse, RoomSummary } from "../types/room";
import { API_BASE_URL } from "../constants/api";

interface ApiErrorBody {
    code?: string;
    message?: string;
}

const API = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
});

export const getApiErrorCode = (error: unknown): string => {
    if (axios.isAxiosError<ApiErrorBody>(error)) {
        return error.response?.data?.code ?? "";
    }
    return "";
};

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
    if (axios.isAxiosError<ApiErrorBody>(error)) {
        return error.response?.data?.message || fallback;
    }
    return fallback;
};

export const roomService = {
    createRoom: async (roomName: string, userName: string): Promise<JoinRoomResponse> => {
        const response = await API.post("/api/rooms/create", null, { params: { roomName, userName } });
        return response.data;
    },
    joinRoom: async (roomId: string, userName: string): Promise<JoinRoomResponse> => {
        const response = await API.post("/api/rooms/join", null, { params: { roomId, userName } });
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
            params: { sessionToken },
        });
    },
};
