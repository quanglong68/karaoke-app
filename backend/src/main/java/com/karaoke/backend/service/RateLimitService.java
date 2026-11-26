package com.karaoke.backend.service;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RateLimitService {
    public record Decision(boolean allowed, long retryAfterSeconds) {
    }

    private record Window(long startedAt, long expiresAt, int count) {
    }

    private static final int CLEANUP_THRESHOLD = 10_000;
    private static final int FORCE_CLEANUP_THRESHOLD = 50_000;
    private static final long CLEANUP_INTERVAL_MILLIS = 60_000L;

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private volatile long lastCleanupAt = 0L;

    public boolean allow(String key, int limit, long windowMillis) {
        return check(key, limit, windowMillis).allowed();
    }

    public Decision check(String key, int limit, long windowMillis) {
        long now = System.currentTimeMillis();
        Window window = windows.compute(key, (ignored, current) -> {
            if (current == null || now >= current.expiresAt()) {
                return new Window(now, now + windowMillis, 1);
            }
            return new Window(current.startedAt(), current.expiresAt(), current.count() + 1);
        });
        int size = windows.size();
        if (size > FORCE_CLEANUP_THRESHOLD
                || (size > CLEANUP_THRESHOLD && now - lastCleanupAt > CLEANUP_INTERVAL_MILLIS)) {
            lastCleanupAt = now;
            windows.entrySet().removeIf(entry -> now >= entry.getValue().expiresAt());
        }
        if (window.count() <= limit) {
            return new Decision(true, 0L);
        }
        long retryAfterSeconds = Math.max(1L, (window.expiresAt() - now + 999L) / 1000L);
        return new Decision(false, retryAfterSeconds);
    }
}
