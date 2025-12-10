import SockJS from "sockjs-client";
import Stomp from "stompjs";
export interface SocketMessage {
    type: string;
    content: string;
    sender: string;
    roomId: string;
}

interface StompFrame {
    body: string;
}

let stompClient: Stomp.Client | null = null;

export const websocketService = {
    connect: (roomId: string, onMessageReceived: (message: SocketMessage) => void) => {
        const socket = new SockJS('http://localhost:8080/ws-karaoke');

        stompClient = Stomp.over(socket);

        stompClient.debug = () => {};

        stompClient.connect(
            {}, 
            () => { 
                console.log('Đã kết nối WebSocket thành công!');
                stompClient?.subscribe(`/topic/room/${roomId}`, (payload: StompFrame) => {
                    const message: SocketMessage = JSON.parse(payload.body);
                    onMessageReceived(message); 
                });
            }, 
            (error: string | StompFrame) => { 
                console.error('Lỗi kết nối WebSocket:', error);
            }
        );
    },

    sendMessage: (roomId: string, message: SocketMessage) => {
        if (stompClient && stompClient.connected) {
            stompClient.send(`/app/room/${roomId}/chat`, {}, JSON.stringify(message));
        } else {
            console.error('Chưa kết nối WebSocket, không thể gửi tin!');
        }
    },

    disconnect: () => {
        if (stompClient) {
            stompClient.disconnect(() => {
                console.log("Đã ngắt kết nối WebSocket");
            });
        }
    }
};