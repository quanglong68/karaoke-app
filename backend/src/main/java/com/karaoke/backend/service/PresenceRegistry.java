package com.karaoke.backend.service;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PresenceRegistry {
    public static class PresenceInfo {
        private final String roomId;
        private final String userId;

        public PresenceInfo(String roomId, String userId) {
            this.roomId = roomId;
            this.userId = userId;
        }

        public String getRoomId() {
            return roomId;
        }

        public String getUserId() {
            return userId;
        }
    }

    private final Map<String, PresenceInfo> sessions = new ConcurrentHashMap<>();

    public void register(String sessionId, String roomId, String userId) {
        sessions.put(sessionId, new PresenceInfo(roomId, userId));
    }

    public PresenceInfo get(String sessionId) {
        return sessions.get(sessionId);
    }

    public PresenceInfo remove(String sessionId) {
        return sessions.remove(sessionId);
    }

    public void removeUser(String roomId, String userId) {
        sessions.entrySet().removeIf(entry -> {
            PresenceInfo info = entry.getValue();
            return info.getRoomId().equals(roomId) && info.getUserId().equals(userId);
        });
    }

    public boolean isUserOnline(String roomId, String userId) {
        return sessions.values().stream()
                .anyMatch(info -> info.getRoomId().equals(roomId) && info.getUserId().equals(userId));
    }

    public boolean hasRoomPresence(String roomId) {
        return sessions.values().stream()
                .anyMatch(info -> info.getRoomId().equals(roomId));
    }
}
