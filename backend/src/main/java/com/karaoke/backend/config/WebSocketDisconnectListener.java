package com.karaoke.backend.config;

import com.karaoke.backend.model.MessageType;
import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.SocketMessage;
import com.karaoke.backend.service.PresenceRegistry;
import com.karaoke.backend.service.RoomService;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
public class WebSocketDisconnectListener {
    private static final String SERVER_SENDER = "server";

    private final PresenceRegistry presenceRegistry;
    private final RoomService roomService;
    private final SimpMessagingTemplate messagingTemplate;

    public WebSocketDisconnectListener(PresenceRegistry presenceRegistry, RoomService roomService,
            SimpMessagingTemplate messagingTemplate) {
        this.presenceRegistry = presenceRegistry;
        this.roomService = roomService;
        this.messagingTemplate = messagingTemplate;
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        PresenceRegistry.PresenceInfo info = presenceRegistry.remove(event.getSessionId());
        if (info == null) {
            return;
        }

        roomService.leaveRoom(info.getRoomId(), info.getUserId());
        Room room = roomService.getRoom(info.getRoomId());
        if (room == null) {
            return;
        }

        SocketMessage message = new SocketMessage(MessageType.JOIN, room.getUsers(), SERVER_SENDER, info.getRoomId());
        messagingTemplate.convertAndSend("/topic/room/" + info.getRoomId(), message);
    }
}
