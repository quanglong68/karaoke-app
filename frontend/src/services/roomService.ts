import axios from "axios";
import type { Room } from "../types";




const API = axios.create({
  baseURL:'http://localhost:8080',
});
export const roomService = {
    createRoom: async (roomName: string): Promise<Room> => {
        const response = await API.post('/api/rooms/create', null, { params: { roomName } });
        return response.data;
    },
    joinRoom: async (roomId: string, userName: string): Promise<Room> => {
        const response = await API.post('/api/rooms/join', null, { params: { roomId, userName } });
        return response.data;
    },



}