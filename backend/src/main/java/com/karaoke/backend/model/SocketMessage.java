package com.karaoke.backend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SocketMessage {
    private MessageType type;
    private Object content;
    private String sender;
    private String senderName;
    private String roomId;

    public SocketMessage(MessageType type, Object content, String sender, String roomId) {
        this(type, content, sender, null, roomId);
    }
}
