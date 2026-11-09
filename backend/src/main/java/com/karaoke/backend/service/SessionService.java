package com.karaoke.backend.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SessionService {
    public record SessionInfo(String token, String roomId, String userId, long expiresAt) {
    }

    private static final long SESSION_TTL_MILLIS = 12 * 60 * 60 * 1000L;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Map<String, SessionInfo> sessions = new ConcurrentHashMap<>();

    public String issue(String roomId, String userId) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        sessions.put(token, new SessionInfo(token, roomId, userId, System.currentTimeMillis() + SESSION_TTL_MILLIS));
        return token;
    }

    public SessionInfo validate(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        SessionInfo info = sessions.get(token);
        if (info == null) {
            return null;
        }
        if (info.expiresAt() < System.currentTimeMillis()) {
            sessions.remove(token);
            return null;
        }
        return info;
    }

    public void revoke(String token) {
        if (token != null) {
            sessions.remove(token);
        }
    }

    public void revokeUser(String roomId, String userId) {
        sessions.entrySet().removeIf(entry -> {
            SessionInfo info = entry.getValue();
            return info.roomId().equals(roomId) && info.userId().equals(userId);
        });
    }

    @Scheduled(fixedDelay = 10 * 60 * 1000)
    public void cleanupExpired() {
        long now = System.currentTimeMillis();
        sessions.entrySet().removeIf(entry -> entry.getValue().expiresAt() < now);
    }
}
