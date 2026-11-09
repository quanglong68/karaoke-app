package com.karaoke.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Component
public class OriginHandshakeInterceptor implements HandshakeInterceptor {
    private final List<String> allowedOrigins;

    public OriginHandshakeInterceptor(@Value("${app.allowed-origins:}") String origins) {
        this.allowedOrigins = Arrays.stream(origins.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .toList();
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String origin = request.getHeaders().getOrigin();
        if (origin == null || origin.isBlank()) {
            return true;
        }
        if (isAllowed(origin)) {
            return true;
        }
        response.setStatusCode(HttpStatus.FORBIDDEN);
        return false;
    }

    private boolean isAllowed(String origin) {
        for (String allowed : allowedOrigins) {
            if (allowed.equals(origin) || toPattern(allowed).matcher(origin).matches()) {
                return true;
            }
        }
        return false;
    }

    private static Pattern toPattern(String allowed) {
        StringBuilder regex = new StringBuilder();
        for (char c : allowed.toCharArray()) {
            switch (c) {
                case '*' -> regex.append(".*");
                case '[', ']' -> {
                    // Port-list brackets, e.g. http://host:[*] or http://host:[8080,8081].
                }
                default -> regex.append(Pattern.quote(String.valueOf(c)));
            }
        }
        return Pattern.compile(regex.toString());
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Exception exception) {
    }
}
