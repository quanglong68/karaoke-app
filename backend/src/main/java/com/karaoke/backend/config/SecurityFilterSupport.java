package com.karaoke.backend.config;

import com.karaoke.backend.service.AdminAuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Shared HTTP filter and origin-parsing utilities for the security configuration layer.
 */
final class SecurityFilterSupport {

    static final String ADMIN_LOGIN_PATH = "/api/admin/login";

    private SecurityFilterSupport() {
    }

    static String requestPath(HttpServletRequest request) {
        String path = request.getServletPath();
        return (path == null || path.isEmpty()) ? request.getRequestURI() : path;
    }

    static boolean isAdminLoginRequest(HttpServletRequest request) {
        return "POST".equalsIgnoreCase(request.getMethod()) && ADMIN_LOGIN_PATH.equals(requestPath(request));
    }

    static String readAdminSessionCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (AdminAuthService.COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    static void writeJsonError(HttpServletResponse response, int status, String body) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(body);
    }

    static List<String> parseOriginPatterns(String rawOrigins) {
        if (rawOrigins == null || rawOrigins.isBlank()) {
            return List.of();
        }
        // Respect bracketed port lists such as http://localhost:[5173,3000] so commas
        // inside [...] are not split into invalid origin patterns.
        List<String> result = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int bracketDepth = 0;
        for (int i = 0; i < rawOrigins.length(); i++) {
            char c = rawOrigins.charAt(i);
            if (c == '[') {
                bracketDepth++;
            } else if (c == ']' && bracketDepth > 0) {
                bracketDepth--;
            } else if (c == ',' && bracketDepth == 0) {
                String trimmed = current.toString().trim();
                if (!trimmed.isEmpty()) {
                    result.add(trimmed);
                }
                current.setLength(0);
                continue;
            }
            current.append(c);
        }
        String trimmed = current.toString().trim();
        if (!trimmed.isEmpty()) {
            result.add(trimmed);
        }
        return List.copyOf(result);
    }
}
