package com.karaoke.backend.config;

import com.karaoke.backend.model.MessageType;
import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.SocketMessage;
import com.karaoke.backend.service.PresenceRegistry;
import com.karaoke.backend.service.RoomService;
import jakarta.annotation.PreDestroy;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Component
public class WebSocketDisconnectListener {
    private static final String SERVER_SENDER = "server";
    private static final long RECONNECT_GRACE_MILLIS = 5_000L;

    private final PresenceRegistry presenceRegistry;
    private final RoomService roomService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "ws-disconnect");
        thread.setDaemon(true);
        return thread;
    });

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
        scheduler.schedule(() -> finalizeLeave(info), RECONNECT_GRACE_MILLIS, TimeUnit.MILLISECONDS);
    }

    private void finalizeLeave(PresenceRegistry.PresenceInfo info) {
        if (presenceRegistry.isUserOnline(info.getRoomId(), info.getUserId())) {
            return;
        }
        Room room = roomService.getRoom(info.getRoomId());
        if (room == null) {
            return;
        }
        roomService.leaveRoom(info.getRoomId(), info.getUserId());
        Room updated = roomService.getRoom(info.getRoomId());
        if (updated == null) {
            return;
        }
        SocketMessage message = new SocketMessage(MessageType.JOIN, updated.getUsers(), SERVER_SENDER,
                info.getRoomId());
        messagingTemplate.convertAndSend("/topic/room/" + info.getRoomId(), message);
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdownNow();
    }
}
