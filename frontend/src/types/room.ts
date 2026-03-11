import type { User } from "./user";

export interface Room {
  roomId: string;
  roomName: string;
  playing: boolean;
  currentVideoId: string | null;
  users: User[];
}