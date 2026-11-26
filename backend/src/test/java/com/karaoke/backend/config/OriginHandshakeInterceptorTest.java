package com.karaoke.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OriginHandshakeInterceptorTest {

    private final OriginHandshakeInterceptor interceptor = new OriginHandshakeInterceptor(
            "https://karaoke.example.com,http://192.168.*:[*],http://localhost:[5173,3000]");

    @Test
    void allowsExactAndValidLanPatterns() {
        assertTrue(handshake("https://karaoke.example.com"));
        assertTrue(handshake("http://192.168.1.25:5173"));
        assertTrue(handshake("http://localhost:5173"));
    }

    @Test
    void rejectsSpoofedHostnamesAndPorts() {
        assertFalse(handshake("http://192.168.evil.com:80"));
        assertFalse(handshake("http://localhost.evil.com:5173"));
        assertFalse(handshake("http://localhost:9999"));
        assertFalse(handshake("https://karaoke.example.com.evil.com"));
    }

    @Test
    void parseOriginPatternsPreservesBracketedPortLists() {
        List<String> parsed = SecurityFilterSupport.parseOriginPatterns(
                "https://karaoke.example.com, http://localhost:[5173,3000], http://192.168.*:[*]");
        assertEquals(
                List.of("https://karaoke.example.com", "http://localhost:[5173,3000]", "http://192.168.*:[*]"),
                parsed);
    }

    private boolean handshake(String origin) {
        ServerHttpRequest request = mock(ServerHttpRequest.class);
        ServerHttpResponse response = mock(ServerHttpResponse.class);
        HttpHeaders headers = new HttpHeaders();
        headers.setOrigin(origin);
        when(request.getHeaders()).thenReturn(headers);
        boolean allowed = interceptor.beforeHandshake(request, response, mock(WebSocketHandler.class), Map.of());
        if (!allowed) {
            verify(response).setStatusCode(HttpStatus.FORBIDDEN);
        }
        return allowed;
    }
}
