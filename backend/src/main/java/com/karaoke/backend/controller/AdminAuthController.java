package com.karaoke.backend.controller;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.service.AdminAuthService;
import com.karaoke.backend.service.AuditLogger;
import com.karaoke.backend.service.ClientIpResolver;
import com.karaoke.backend.service.RateLimitService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/admin")
public class AdminAuthController {

    private static final int LOGIN_LIMIT = 10;
    private static final int PASSWORD_CHANGE_LIMIT = 10;
    private static final long LOGIN_WINDOW_MILLIS = 10 * 60 * 1000L;

    public record LoginRequest(String username, String password) {
    }

    public record ChangePasswordRequest(String currentPassword, String newPassword) {
    }

    public record AdminMeResponse(String username, String role, OffsetDateTime expiresAt) {
    }

    private final AdminAuthService adminAuthService;
    private final RateLimitService rateLimitService;
    private final ClientIpResolver clientIpResolver;
    private final AuditLogger auditLogger;
    private final boolean cookieSecure;

    public AdminAuthController(AdminAuthService adminAuthService, RateLimitService rateLimitService,
            ClientIpResolver clientIpResolver, AuditLogger auditLogger,
            @Value("${app.admin.cookie-secure:true}") boolean cookieSecure) {
        this.adminAuthService = adminAuthService;
        this.rateLimitService = rateLimitService;
        this.clientIpResolver = clientIpResolver;
        this.auditLogger = auditLogger;
        this.cookieSecure = cookieSecure;
    }

    @PostMapping("/login")
    public ResponseEntity<AdminMeResponse> login(@RequestBody(required = false) LoginRequest body,
            HttpServletRequest request) {
        String clientIp = clientIpResolver.resolve(request);
        RateLimitService.Decision decision = rateLimitService.check("admin-login:" + clientIp, LOGIN_LIMIT,
                LOGIN_WINDOW_MILLIS);
        if (!decision.allowed()) {
            throw AppException.tooManyRequests("RATE_LIMITED", decision.retryAfterSeconds());
        }
        if (body == null || body.username() == null || body.username().isBlank()
                || body.username().trim().length() > AdminAuthService.MAX_USERNAME_LENGTH
                || body.password() == null || body.password().isEmpty()
                || body.password().getBytes(StandardCharsets.UTF_8).length > AdminAuthService.MAX_PASSWORD_UTF8_BYTES) {
            throw AppException.unauthorized("INVALID_CREDENTIALS");
        }

        AdminAuthService.LoginResult result = adminAuthService.login(
                body.username(), body.password(), clientIp, request.getHeader("User-Agent"));
        AdminAuthService.AdminSession session = result.session();

        ResponseCookie cookie = ResponseCookie.from(AdminAuthService.COOKIE_NAME, result.token())
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Strict")
                .path("/api/admin")
                .maxAge(Duration.ofSeconds(adminAuthService.sessionTtlSeconds()))
                .build();

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(toResponse(session));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = AdminAuthService.COOKIE_NAME, required = false) String token,
            HttpServletRequest request) {
        String username = adminAuthService.logout(token);
        if (username != null) {
            auditLogger.event("admin.logout", username, clientIpResolver.resolve(request), "session=revoked");
        }
        ResponseCookie cleared = ResponseCookie.from(AdminAuthService.COOKIE_NAME, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Strict")
                .path("/api/admin")
                .maxAge(Duration.ZERO)
                .build();
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cleared.toString())
                .build();
    }

    @PostMapping("/change-password")
    public ResponseEntity<Void> changePassword(
            @RequestBody(required = false) ChangePasswordRequest body,
            @CookieValue(name = AdminAuthService.COOKIE_NAME, required = false) String token,
            Authentication authentication,
            HttpServletRequest request) {
        if (authentication == null
                || !(authentication.getDetails() instanceof AdminAuthService.AdminSession session)) {
            throw AppException.unauthorized("ADMIN_UNAUTHORIZED");
        }
        String clientIp = clientIpResolver.resolve(request);
        RateLimitService.Decision decision = rateLimitService.check(
                "admin-pwd:" + session.username(), PASSWORD_CHANGE_LIMIT, LOGIN_WINDOW_MILLIS);
        if (!decision.allowed()) {
            throw AppException.tooManyRequests("RATE_LIMITED", decision.retryAfterSeconds());
        }
        if (body == null) {
            throw AppException.badRequest("INVALID_PASSWORD");
        }
        adminAuthService.changePassword(
                session.username(), token, body.currentPassword(), body.newPassword(), clientIp);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public AdminMeResponse me(Authentication authentication) {
        if (authentication == null
                || !(authentication.getDetails() instanceof AdminAuthService.AdminSession session)) {
            throw AppException.unauthorized("ADMIN_UNAUTHORIZED");
        }
        return toResponse(session);
    }

    private AdminMeResponse toResponse(AdminAuthService.AdminSession session) {
        return new AdminMeResponse(session.username(), session.role().name(), session.expiresAt());
    }
}
