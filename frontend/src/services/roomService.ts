import axios from "axios";
import type { JoinRoomResponse} from "../types/room";




const API = axios.create({
  baseURL:'http://localhost:8080',
});
export const roomService = {
    createRoom: async (roomName: string, userName: string): Promise<JoinRoomResponse> => {
        const response = await API.post('/api/rooms/create', null, { params: { roomName, userName } });
        return response.data;
    },
    joinRoom: async (roomId: string, userName: string): Promise<JoinRoomResponse> => {
        const response = await API.post('/api/rooms/join', null, { params: { roomId, userName } });
        return response.data;
    },



}