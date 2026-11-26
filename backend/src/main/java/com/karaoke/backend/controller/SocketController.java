package com.karaoke.backend.controller;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.MessageType;
import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.SocketMessage;
import com.karaoke.backend.model.User;
import com.karaoke.backend.service.GameService;
import com.karaoke.backend.service.PresenceRegistry;
import com.karaoke.backend.service.RateLimitService;
import com.karaoke.backend.service.RoomService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class SocketController {
    private static final Logger log = LoggerFactory.getLogger(SocketController.class);
    private static final int MAX_CHAT_LENGTH = 500;
    private static final int CHAT_LIMIT = 5;
    // Buzzer rounds are won by click count, while RTC signalling and room control
    // commands have tighter limits to prevent relay flooding and broadcast spam.
    private static final int BATTLE_MESSAGE_LIMIT = 300;
    private static final int RTC_SIGNAL_LIMIT = 60;
    private static final int CONTROL_MESSAGE_LIMIT = 20;
    private static final long WINDOW_MILLIS = 5_000L;

    private final GameService gameService;
    private final PresenceRegistry presenceRegistry;
    private final RoomService roomService;
    private final RateLimitService rateLimitService;
    private final SimpMessagingTemplate messagingTemplate;

    public SocketController(GameService gameService, PresenceRegistry presenceRegistry, RoomService roomService,
            RateLimitService rateLimitService, SimpMessagingTemplate messagingTemplate) {
        this.gameService = gameService;
        this.presenceRegistry = presenceRegistry;
        this.roomService = roomService;
        this.rateLimitService = rateLimitService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/room/{roomId}/chat")
    public void handleChat(@DestinationVariable String roomId, @Payload SocketMessage message,
            @Header("simpSessionId") String sessionId) {
        PresenceRegistry.PresenceInfo presence = presenceRegistry.get(sessionId);
        if (presence == null || !presence.getRoomId().equals(roomId)) {
            return;
        }
        if (!rateLimitService.allow("chat:" + presence.getUserId(), CHAT_LIMIT, WINDOW_MILLIS)) {
            return;
        }
        String content = sanitizeChat(message == null ? null : message.getContent());
        if (content.isEmpty()) {
            return;
        }
        Room room = roomService.getRoom(roomId);
        User sender = room == null ? null : room.getUserById(presence.getUserId());
        if (sender == null) {
            return;
        }
        SocketMessage chatMessage = new SocketMessage(MessageType.CHAT, content, sender.getUserId(),
                sender.getUserName(), roomId);
        messagingTemplate.convertAndSend("/topic/room/" + roomId, chatMessage);
    }

    @MessageMapping("/room/{roomId}")
    public void handleGame(@DestinationVariable String roomId, @Payload SocketMessage message,
            @Header("simpSessionId") String sessionId) {
        PresenceRegistry.PresenceInfo presence = presenceRegistry.get(sessionId);
        if (presence == null || !presence.getRoomId().equals(roomId)
                || message == null || message.getType() == null) {
            return;
        }
        String rateKey;
        int limit;
        switch (message.getType()) {
            case BATTLE -> {
                rateKey = "battle:" + presence.getUserId();
                limit = BATTLE_MESSAGE_LIMIT;
            }
            case RTC_SIGNAL -> {
                rateKey = "rtc:" + presence.getUserId();
                limit = RTC_SIGNAL_LIMIT;
            }
            default -> {
                rateKey = "game:" + presence.getUserId();
                limit = CONTROL_MESSAGE_LIMIT;
            }
        }
        if (!rateLimitService.allow(rateKey, limit, WINDOW_MILLIS)) {
            return;
        }
        gameService.handleGameMessage(roomId, message, presence.getUserId());
    }

    @MessageExceptionHandler(AppException.class)
    public void handleAppException(AppException exception) {
        log.debug("Rejected STOMP message: {}", exception.getCode());
    }

    private String sanitizeChat(Object rawContent) {
        if (!(rawContent instanceof String raw)) {
            return "";
        }
        StringBuilder builder = new StringBuilder(Math.min(raw.length(), MAX_CHAT_LENGTH));
        for (int i = 0; i < raw.length() && builder.length() < MAX_CHAT_LENGTH; i++) {
            char c = raw.charAt(i);
            if (!Character.isISOControl(c) || c == '\n') {
                builder.append(c);
            }
        }
        return builder.toString().trim();
    }
}
