package com.karaoke.backend.controller;

import com.karaoke.backend.model.GameState;
import com.karaoke.backend.model.SocketMessage;
import com.karaoke.backend.service.GameService;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

@Controller
public class SocketController {
    GameService gameService;
    public SocketController(GameService gameService) {
        this.gameService = gameService;
    }
    @MessageMapping("/room/{roomId}/chat")
    @SendTo("/topic/room/{roomId}")
    public SocketMessage handleChat(@DestinationVariable String roomId, @Payload SocketMessage message) {
        System.out.println("Nhận tin nhắn từ phòng " + roomId + ": " + message.getContent());
        return message;
    }

    @MessageMapping("/room/{roomId}")
    public void handleGame(@DestinationVariable String roomId, @Payload SocketMessage message) {
        System.out.println("LOG SERVER - Nhận lệnh type: " + message.getType());
        gameService.handleGameMessage(roomId, message);
    }

}
