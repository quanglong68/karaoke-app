export interface User {
  userId: string;
  userName: string;
  score: number;
  isHost?: boolean;
  isReady?: boolean;
}