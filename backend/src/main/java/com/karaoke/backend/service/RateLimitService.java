package com.karaoke.backend.service;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RateLimitService {
    private record Window(long startedAt, int count) {
    }

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public boolean allow(String key, int limit, long windowMillis) {
        long now = System.currentTimeMillis();
        Window window = windows.compute(key, (ignored, current) -> {
            if (current == null || now - current.startedAt() >= windowMillis) {
                return new Window(now, 1);
            }
            return new Window(current.startedAt(), current.count() + 1);
        });
        if (windows.size() > 10_000) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().startedAt() > 10 * 60 * 1000L);
        }
        return window.count() <= limit;
    }
}
