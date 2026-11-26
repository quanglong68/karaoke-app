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
    private static final Pattern IPV4_WILDCARD_PREFIX = Pattern.compile("^(?:[0-9]{1,3}\\.){1,3}$");

    private final List<String> allowedOrigins;
    private final List<Pattern> allowedPatterns;

    public OriginHandshakeInterceptor(@Value("${app.allowed-origins:}") String origins) {
        this.allowedOrigins = SecurityFilterSupport.parseOriginPatterns(origins);
        this.allowedPatterns = this.allowedOrigins.stream()
                .map(OriginHandshakeInterceptor::toPattern)
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
        for (int i = 0; i < allowedOrigins.size(); i++) {
            if (allowedOrigins.get(i).equals(origin) || allowedPatterns.get(i).matcher(origin).matches()) {
                return true;
            }
        }
        return false;
    }

    private static Pattern toPattern(String allowed) {
        int schemeEnd = allowed.indexOf("://");
        if (schemeEnd < 0) {
            return Pattern.compile("^" + Pattern.quote(allowed) + "$");
        }
        String scheme = allowed.substring(0, schemeEnd + 3);
        String authority = allowed.substring(schemeEnd + 3);
        boolean optionalWildcardPort = false;
        String portSuffix = "";
        if (authority.endsWith(":[*]")) {
            authority = authority.substring(0, authority.length() - 4);
            optionalWildcardPort = true;
        } else {
            int bracketStart = authority.indexOf(":[");
            if (bracketStart >= 0 && authority.endsWith("]")) {
                String list = authority.substring(bracketStart + 2, authority.length() - 1);
                authority = authority.substring(0, bracketStart);
                String alternatives = Arrays.stream(list.split(","))
                        .map(String::trim)
                        .filter(port -> !port.isEmpty())
                        .map(Pattern::quote)
                        .reduce((left, right) -> left + "|" + right)
                        .orElse("");
                if (!alternatives.isEmpty()) {
                    portSuffix = ":(?:" + alternatives + ")";
                }
            }
        }
        String hostRegex = buildHostRegex(authority);
        String portRegex = optionalWildcardPort ? "(?::[0-9]{1,5})?" : portSuffix;
        return Pattern.compile("^" + Pattern.quote(scheme) + hostRegex + portRegex + "$");
    }

    private static String buildHostRegex(String hostPattern) {
        int wildcardIndex = hostPattern.indexOf('*');
        if (wildcardIndex < 0) {
            return Pattern.quote(hostPattern);
        }
        StringBuilder regex = new StringBuilder();
        int cursor = 0;
        while (wildcardIndex >= 0) {
            String literalBefore = hostPattern.substring(cursor, wildcardIndex);
            regex.append(Pattern.quote(literalBefore));
            if (wildcardIndex == hostPattern.length() - 1
                    && IPV4_WILDCARD_PREFIX.matcher(hostPattern.substring(0, wildcardIndex)).matches()) {
                regex.append("[0-9]{1,3}(?:\\.[0-9]{1,3}){0,2}");
            } else {
                regex.append("[A-Za-z0-9-]+");
            }
            cursor = wildcardIndex + 1;
            wildcardIndex = hostPattern.indexOf('*', cursor);
        }
        if (cursor < hostPattern.length()) {
            regex.append(Pattern.quote(hostPattern.substring(cursor)));
        }
        return regex.toString();
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Exception exception) {
    }
}
