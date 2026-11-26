package com.karaoke.backend.service;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.persistence.AdminEntity;
import com.karaoke.backend.persistence.AdminRepository;
import com.karaoke.backend.persistence.AdminRole;
import com.karaoke.backend.persistence.AdminSessionEntity;
import com.karaoke.backend.persistence.AdminSessionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class AdminAuthService {

    public static final String COOKIE_NAME = "admin_session";
    public static final int MAX_USERNAME_LENGTH = 64;
    public static final int MIN_NEW_PASSWORD_LENGTH = 12;
    public static final int MAX_PASSWORD_UTF8_BYTES = 72;

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final int LOCKOUT_THRESHOLD = 5;
    private static final long LOCKOUT_WINDOW_MILLIS = 15 * 60 * 1000L;
    private static final long LOCKOUT_DURATION_MILLIS = 15 * 60 * 1000L;
    private static final long LAST_SEEN_UPDATE_MILLIS = 5 * 60 * 1000L;
    private static final int MAX_FAILURE_ENTRIES = 10_000;

    public record AdminSession(String username, AdminRole role, OffsetDateTime expiresAt) {
    }

    public record LoginResult(String token, AdminSession session) {
    }

    private record Failures(int count, long windowStart, long lockedUntil) {
    }

    private final AdminRepository adminRepository;
    private final AdminSessionRepository sessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogger auditLogger;
    private final SecureRandom secureRandom = new SecureRandom();
    private final Map<String, Failures> failures = new ConcurrentHashMap<>();
    private final long sessionTtlSeconds;
    // Compared against when the username does not exist, so a miss costs the same
    // BCrypt work as a wrong password and cannot be distinguished by timing.
    private final String dummyPasswordHash;

    public AdminAuthService(AdminRepository adminRepository, AdminSessionRepository sessionRepository,
            PasswordEncoder passwordEncoder, AuditLogger auditLogger,
            @Value("${app.admin.session-days:7}") long sessionTtlDays) {
        this.adminRepository = adminRepository;
        this.sessionRepository = sessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditLogger = auditLogger;
        this.sessionTtlSeconds = Math.max(1, sessionTtlDays) * 24 * 60 * 60;
        this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    public long sessionTtlSeconds() {
        return sessionTtlSeconds;
    }

    @Transactional
    public LoginResult login(String username, String password, String ip, String userAgent) {
        String normalizedUsername = normalizeUsername(username);
        if (normalizedUsername.isEmpty() || normalizedUsername.length() > MAX_USERNAME_LENGTH
                || password == null || password.isEmpty()
                || password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_UTF8_BYTES) {
            throw AppException.unauthorized("INVALID_CREDENTIALS");
        }
        // Key by username + IP so an attacker cannot lock the only admin out of the
        // service just by submitting wrong passwords for the public username.
        String failureKey = failureKey(normalizedUsername, ip);
        try {
            ensureNotLocked(failureKey);
        } catch (AppException locked) {
            auditLogger.event("admin.login.locked", normalizedUsername, ip, "reason=lockout-active");
            throw locked;
        }

        AdminEntity admin = adminRepository.findByUsername(normalizedUsername)
                .filter(AdminEntity::isEnabled)
                .orElse(null);
        String passwordHash = admin == null ? dummyPasswordHash : admin.getPasswordHash();
        boolean passwordMatches = passwordEncoder.matches(password == null ? "" : password, passwordHash);
        if (admin == null || !passwordMatches) {
            try {
                registerFailure(failureKey);
            } catch (AppException locked) {
                auditLogger.event("admin.login.locked", normalizedUsername, ip, "reason=too-many-failures");
                throw locked;
            }
            auditLogger.event("admin.login.failure", normalizedUsername, ip, "reason=invalid-credentials");
            throw AppException.unauthorized("INVALID_CREDENTIALS");
        }
        failures.remove(failureKey);

        OffsetDateTime now = OffsetDateTime.now();
        String token = newToken();
        AdminSessionEntity session = new AdminSessionEntity();
        session.setTokenHash(hash(token));
        session.setAdmin(admin);
        session.setExpiresAt(now.plusSeconds(sessionTtlSeconds));
        session.setIp(truncate(ip, 64));
        session.setUserAgent(truncate(userAgent, 255));
        sessionRepository.save(session);

        admin.setLastLoginAt(now);
        adminRepository.save(admin);
        auditLogger.event("admin.login.success", admin.getUsername(), ip, "role=" + admin.getRole());

        return new LoginResult(token, new AdminSession(admin.getUsername(), admin.getRole(), session.getExpiresAt()));
    }

    @Transactional
    public Optional<AdminSession> authenticate(String rawToken) {
        if (!isValidTokenShape(rawToken)) {
            return Optional.empty();
        }
        AdminSessionEntity session = sessionRepository.findById(hash(rawToken)).orElse(null);
        if (session == null) {
            return Optional.empty();
        }
        AdminEntity admin = session.getAdmin();
        if (session.getExpiresAt().isBefore(OffsetDateTime.now()) || !admin.isEnabled()) {
            sessionRepository.delete(session);
            return Optional.empty();
        }
        touch(session);
        return Optional.of(new AdminSession(admin.getUsername(), admin.getRole(), session.getExpiresAt()));
    }

    @Transactional
    public String logout(String rawToken) {
        if (!isValidTokenShape(rawToken)) {
            return null;
        }
        String tokenHash = hash(rawToken);
        AdminSessionEntity session = sessionRepository.findById(tokenHash).orElse(null);
        String username = session == null ? null : session.getAdmin().getUsername();
        if (session != null) {
            sessionRepository.delete(session);
        }
        return username;
    }

    @Transactional
    public void changePassword(String username, String currentSessionToken, String currentPassword,
            String newPassword, String ip) {
        String normalizedUsername = normalizeUsername(username);
        if (currentPassword == null || currentPassword.isEmpty()
                || currentPassword.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_UTF8_BYTES) {
            throw AppException.badRequest("WRONG_CURRENT_PASSWORD");
        }
        if (newPassword == null
                || newPassword.length() < MIN_NEW_PASSWORD_LENGTH
                || newPassword.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_UTF8_BYTES
                || newPassword.equals(currentPassword)) {
            throw AppException.badRequest("INVALID_PASSWORD");
        }
        AdminEntity admin = adminRepository.findByUsername(normalizedUsername)
                .filter(AdminEntity::isEnabled)
                .orElseThrow(() -> AppException.unauthorized("ADMIN_UNAUTHORIZED"));
        if (!passwordEncoder.matches(currentPassword, admin.getPasswordHash())) {
            auditLogger.event("admin.password.failure", admin.getUsername(), ip, "reason=wrong-current-password");
            throw AppException.badRequest("WRONG_CURRENT_PASSWORD");
        }
        admin.setPasswordHash(passwordEncoder.encode(newPassword));
        adminRepository.save(admin);

        long revoked = isValidTokenShape(currentSessionToken)
                ? sessionRepository.deleteByAdminIdAndTokenHashNot(admin.getId(), hash(currentSessionToken))
                : sessionRepository.deleteByAdmin_Id(admin.getId());
        auditLogger.event("admin.password.change", admin.getUsername(), ip, "otherSessionsRevoked=" + revoked);
    }

    @Scheduled(fixedDelay = 3_600_000L)
    @Transactional
    public void purgeExpiredSessions() {
        sessionRepository.deleteByExpiresAtBefore(OffsetDateTime.now());
    }

    @Scheduled(fixedDelay = 300_000L)
    public void purgeExpiredFailures() {
        long now = System.currentTimeMillis();
        failures.entrySet().removeIf(entry -> {
            Failures state = entry.getValue();
            return state.lockedUntil() <= now && now - state.windowStart() >= LOCKOUT_WINDOW_MILLIS;
        });
    }

    private void touch(AdminSessionEntity session) {
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime lastSeen = session.getLastSeenAt();
        if (lastSeen == null || lastSeen.plusSeconds(LAST_SEEN_UPDATE_MILLIS / 1000).isBefore(now)) {
            session.setLastSeenAt(now);
            sessionRepository.save(session);
        }
    }

    private String failureKey(String username, String ip) {
        return username + "|" + (ip == null ? "" : ip);
    }

    private void ensureNotLocked(String key) {
        Failures state = failures.get(key);
        if (state != null && state.lockedUntil() > System.currentTimeMillis()) {
            throw locked();
        }
    }

    private void registerFailure(String key) {
        long now = System.currentTimeMillis();
        if (failures.size() >= MAX_FAILURE_ENTRIES && !failures.containsKey(key)) {
            purgeExpiredFailures();
            if (failures.size() >= MAX_FAILURE_ENTRIES) {
                evictOldestUnlockedFailure(now);
            }
            if (failures.size() >= MAX_FAILURE_ENTRIES) {
                throw locked();
            }
        }
        Failures state = failures.compute(key, (ignored, current) -> {
            boolean expired = current == null || now - current.windowStart() >= LOCKOUT_WINDOW_MILLIS;
            int count = (expired ? 0 : current.count()) + 1;
            long windowStart = expired ? now : current.windowStart();
            long lockedUntil = count >= LOCKOUT_THRESHOLD ? now + LOCKOUT_DURATION_MILLIS : 0L;
            return new Failures(count, windowStart, lockedUntil);
        });
        if (state.lockedUntil() > now) {
            throw locked();
        }
    }

    private AppException locked() {
        return new AppException(HttpStatus.LOCKED, "ACCOUNT_LOCKED");
    }

    private String newToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    public static boolean isValidTokenShape(String rawToken) {
        return rawToken != null && TOKEN_PATTERN.matcher(rawToken).matches();
    }

    private void evictOldestUnlockedFailure(long now) {
        String oldestKey = null;
        long oldestWindowStart = Long.MAX_VALUE;
        for (Map.Entry<String, Failures> entry : failures.entrySet()) {
            Failures state = entry.getValue();
            if (state.lockedUntil() <= now && state.windowStart() < oldestWindowStart) {
                oldestWindowStart = state.windowStart();
                oldestKey = entry.getKey();
            }
        }
        if (oldestKey != null) {
            failures.remove(oldestKey);
        }
    }

    private String normalizeUsername(String username) {
        return username == null ? "" : username.trim();
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }
}
