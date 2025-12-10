package com.karaoke.backend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SocketMessage {
    // Loại tin nhắn: "JOIN", "CHAT", "START", "VOTE", "BUZZER" (Bấm chuông)
    private String type;

    // Nội dung: Tên người chơi, hoặc ID bài hát...
    private String content;

    // Người gửi
    private String sender;

    // ID phòng (để biết gửi vào phòng nào)
    private String roomId;
}