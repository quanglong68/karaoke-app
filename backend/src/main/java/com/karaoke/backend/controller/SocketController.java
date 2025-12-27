package com.karaoke.backend.controller;

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
        //video id đang sài code cứng
        if(message.getType().equalsIgnoreCase("START")) {
            gameService.startGame(roomId, "P-AoULl-dkU");
        }
        if(message.getType().equalsIgnoreCase("CLICK")) {
            gameService.handleUserClick(roomId, message.getSender());
        }
        System.out.println("Nhận tin nhắn từ phòng " + roomId + ": " + message.getContent());
        return message;
    }
}
