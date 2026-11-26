package com.karaoke.backend.config;

import com.karaoke.backend.model.GameState;
import com.karaoke.backend.model.Room;
import com.karaoke.backend.service.GameService;
import com.karaoke.backend.service.PresenceRegistry;
import com.karaoke.backend.service.RoomService;
import jakarta.annotation.PreDestroy;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Component
public class WebSocketDisconnectListener {
    private static final long RECONNECT_GRACE_MILLIS = 5_000L;
    // A browser refresh or a short Wi-Fi drop must not cost the player their turn.
    // While a game is running the membership is kept long enough for the client to
    // reconnect and rejoin with the same session token.
    private static final long RECONNECT_GRACE_IN_GAME_MILLIS = 60_000L;

    private final PresenceRegistry presenceRegistry;
    private final RoomService roomService;
    private final GameService gameService;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "ws-disconnect");
        thread.setDaemon(true);
        return thread;
    });

    public WebSocketDisconnectListener(PresenceRegistry presenceRegistry, RoomService roomService,
            GameService gameService) {
        this.presenceRegistry = presenceRegistry;
        this.roomService = roomService;
        this.gameService = gameService;
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        PresenceRegistry.PresenceInfo info = presenceRegistry.remove(event.getSessionId());
        if (info == null) {
            return;
        }
        Room room = roomService.getRoom(info.getRoomId());
        long grace = room != null && room.getGameState() != GameState.LOBBY
                ? RECONNECT_GRACE_IN_GAME_MILLIS
                : RECONNECT_GRACE_MILLIS;
        scheduler.schedule(() -> finalizeLeave(info), grace, TimeUnit.MILLISECONDS);
    }

    private void finalizeLeave(PresenceRegistry.PresenceInfo info) {
        if (presenceRegistry.isUserOnline(info.getRoomId(), info.getUserId())) {
            return;
        }
        Room room = roomService.getRoom(info.getRoomId());
        if (room == null) {
            return;
        }
        // Route through GameService so a singer who never came back releases the
        // performance phase instead of stalling it until the 60s timer.
        gameService.handleUserLeave(info.getRoomId(), info.getUserId());
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdownNow();
    }
}
