package com.karaoke.backend.controller;

import com.karaoke.backend.model.SocketMessage;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

@Controller
public class SocketController {

    @MessageMapping("/room/{roomId}/chat")
    @SendTo("/topic/room/{roomId}")
    public SocketMessage handleChat(@DestinationVariable String roomId, @Payload SocketMessage message) {
        System.out.println("Nhận tin nhắn từ phòng " + roomId + ": " + message.getContent());
        return message;
    }
}
