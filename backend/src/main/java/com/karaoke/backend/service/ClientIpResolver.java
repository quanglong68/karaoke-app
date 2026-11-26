package com.karaoke.backend.service;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

@Component
public class ClientIpResolver {

    private static final Pattern IP_LITERAL = Pattern.compile("[0-9A-Fa-f:.]+");
    private static final int MAX_IP_LENGTH = 45;

    private final boolean trustForwardedHeaders;

    public ClientIpResolver(@Value("${app.trust-forwarded-headers:false}") boolean trustForwardedHeaders) {
        this.trustForwardedHeaders = trustForwardedHeaders;
    }

    public String resolve(HttpServletRequest request) {
        if (trustForwardedHeaders) {
            String clientIp = firstForwardedHop(request.getHeader("X-Forwarded-For"));
            if (clientIp != null) {
                return clientIp;
            }
        }
        return request.getRemoteAddr();
    }

    private String firstForwardedHop(String forwarded) {
        if (forwarded == null || forwarded.isBlank()) {
            return null;
        }
        String candidate = forwarded.split(",")[0].trim();
        if (candidate.isEmpty() || "unknown".equalsIgnoreCase(candidate)) {
            return null;
        }
        if (candidate.length() > MAX_IP_LENGTH || !IP_LITERAL.matcher(candidate).matches()) {
            return null;
        }
        return candidate;
    }
}
