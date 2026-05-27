import axios from "axios";
import type { JoinRoomResponse, Room } from "../types/room";
import { API_BASE_URL } from "../constants/api";

const API = axios.create({
    baseURL: API_BASE_URL,
});

export const roomService = {
    createRoom: async (roomName: string, userName: string): Promise<JoinRoomResponse> => {
        const response = await API.post("/api/rooms/create", null, { params: { roomName, userName } });
        return response.data;
    },
    joinRoom: async (roomId: string, userName: string): Promise<JoinRoomResponse> => {
        const response = await API.post("/api/rooms/join", null, { params: { roomId, userName } });
        return response.data;
    },
    listRooms: async (): Promise<Room[]> => {
        const response = await API.get("/api/rooms/list");
        return response.data;
    },
    leaveRoom: async (roomId: string, userId: string): Promise<void> => {
        await API.post("/api/rooms/leave", null, { params: { roomId, userId } });
    },
};