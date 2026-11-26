package com.karaoke.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WebSocketSessionRegistry {
    private static final Logger log = LoggerFactory.getLogger(WebSocketSessionRegistry.class);

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    public void register(WebSocketSession session) {
        sessions.put(session.getId(), session);
    }

    public void unregister(String sessionId) {
        if (sessionId != null) {
            sessions.remove(sessionId);
        }
    }

    /**
     * Closing the socket is what actually revokes a kicked member: removing the
     * presence entry alone leaves the existing STOMP subscription receiving broadcasts.
     */
    public void closeSessions(Collection<String> sessionIds) {
        for (String sessionId : sessionIds) {
            WebSocketSession session = sessions.remove(sessionId);
            if (session == null || !session.isOpen()) {
                continue;
            }
            try {
                session.close(CloseStatus.POLICY_VIOLATION);
            } catch (IOException exception) {
                log.debug("Failed to close WebSocket session {}", sessionId, exception);
            }
        }
    }
}
