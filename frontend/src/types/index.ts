export interface User {
  userId: string;
  userName: string;
  score: number;
}
export interface Room {
  roomId: string;
  roomName: string;
  playing: boolean;
  currentVideoId: string | null;
  users: User[];
}