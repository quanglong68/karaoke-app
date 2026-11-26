package com.karaoke.backend.config;

import com.karaoke.backend.service.AdminAuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

@Component
@Profile("prod")
public class ProductionConfigValidator {
    private static final Set<String> PLACEHOLDERS = Set.of(
            "change-me", "change-me-strong", "changeme", "change_me", "admin123", "password", "postgres",
            "karaoke-dev-local-ai-crypto-key-change-in-prod");
    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1");
    private static final int MIN_ADMIN_PASSWORD_LENGTH = 12;
    private static final int MIN_AI_CRYPTO_KEY_LENGTH = 16;

    public ProductionConfigValidator(String allowedOrigins,
            boolean cookieSecure,
            String bootstrapPassword,
            String datasourcePassword,
            String cloudName,
            String apiKey,
            String apiSecret) {
        this(allowedOrigins, cookieSecure, bootstrapPassword, datasourcePassword,
                cloudName, apiKey, apiSecret, "");
    }

    @Autowired
    public ProductionConfigValidator(@Value("${app.allowed-origins:}") String allowedOrigins,
            @Value("${app.admin.cookie-secure:false}") boolean cookieSecure,
            @Value("${app.admin.bootstrap-password:}") String bootstrapPassword,
            @Value("${spring.datasource.password:}") String datasourcePassword,
            @Value("${cloudinary.cloud-name:}") String cloudName,
            @Value("${cloudinary.api-key:}") String apiKey,
            @Value("${cloudinary.api-secret:}") String apiSecret,
            @Value("${ai.crypto-key:}") String aiCryptoKey) {
        if (!cookieSecure) {
            throw new IllegalStateException("ADMIN_COOKIE_SECURE must be true in the prod profile");
        }
        if (allowedOrigins == null || allowedOrigins.isBlank()) {
            throw new IllegalStateException("APP_ALLOWED_ORIGINS must be set in the prod profile");
        }
        for (String raw : allowedOrigins.split(",")) {
            String origin = raw.trim();
            if (origin.isEmpty()) {
                continue;
            }
            if (origin.contains("*") || origin.contains("[") || origin.contains("]")) {
                throw new IllegalStateException("APP_ALLOWED_ORIGINS must not contain wildcards in prod: " + origin);
            }
            validateOrigin(origin);
        }
        requireRealSecret("DB_PASSWORD", datasourcePassword, 0);
        validateBootstrapPassword(bootstrapPassword);
        if (cloudName == null || cloudName.isBlank()
                || apiKey == null || apiKey.isBlank()
                || apiSecret == null || apiSecret.isBlank()) {
            throw new IllegalStateException(
                    "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set in the prod profile");
        }
        if (isPlaceholder(cloudName) || isPlaceholder(apiKey) || isPlaceholder(apiSecret)) {
            throw new IllegalStateException("Cloudinary credentials still contain an example value");
        }
        validateAiCryptoKey(aiCryptoKey);
    }

    private void validateAiCryptoKey(String aiCryptoKey) {
        if (aiCryptoKey == null || aiCryptoKey.isBlank()) {
            return;
        }
        String trimmed = aiCryptoKey.trim();
        if (isPlaceholder(trimmed)) {
            throw new IllegalStateException("AI_CRYPTO_KEY still uses a placeholder/dev value; set a real secret in prod");
        }
        if (trimmed.length() < MIN_AI_CRYPTO_KEY_LENGTH) {
            throw new IllegalStateException(
                    "AI_CRYPTO_KEY must be at least " + MIN_AI_CRYPTO_KEY_LENGTH + " characters in prod");
        }
    }

    private void requireRealSecret(String name, String value, int minLength) {
        if (value == null || value.isBlank() || isPlaceholder(value)) {
            throw new IllegalStateException(name + " must be set to a real value in the prod profile");
        }
        if (minLength > 0 && value.length() < minLength) {
            throw new IllegalStateException(name + " must be at least " + minLength + " characters in prod");
        }
    }

    private void validateBootstrapPassword(String password) {
        // Empty is fine: AdminBootstrapRunner fails fast when no admin exists yet.
        if (password == null || password.isBlank()) {
            return;
        }
        if (isPlaceholder(password)) {
            throw new IllegalStateException(
                    "ADMIN_BOOTSTRAP_PASSWORD still uses the example value; set a real password before deploying");
        }
        if (password.length() < MIN_ADMIN_PASSWORD_LENGTH) {
            throw new IllegalStateException(
                    "ADMIN_BOOTSTRAP_PASSWORD must be at least " + MIN_ADMIN_PASSWORD_LENGTH + " characters in prod");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > AdminAuthService.MAX_PASSWORD_UTF8_BYTES) {
            throw new IllegalStateException("ADMIN_BOOTSTRAP_PASSWORD must not exceed "
                    + AdminAuthService.MAX_PASSWORD_UTF8_BYTES + " UTF-8 bytes in prod");
        }
    }

    private boolean isPlaceholder(String value) {
        return PLACEHOLDERS.contains(value.trim().toLowerCase(Locale.ROOT));
    }

    private void validateOrigin(String origin) {
        URI uri;
        try {
            uri = URI.create(origin);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("APP_ALLOWED_ORIGINS contains invalid URI: " + origin, exception);
        }
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || host.isBlank()
                || uri.getUserInfo() != null
                || uri.getRawQuery() != null
                || uri.getRawFragment() != null
                || (uri.getRawPath() != null && !uri.getRawPath().isEmpty())
                || (uri.getPort() != -1 && (uri.getPort() < 1 || uri.getPort() > 65535))) {
            throw new IllegalStateException("APP_ALLOWED_ORIGINS contains invalid origin: " + origin);
        }
        String normalizedScheme = scheme.toLowerCase(Locale.ROOT);
        String normalizedHost = host.toLowerCase(Locale.ROOT);
        boolean isHttps = "https".equals(normalizedScheme);
        boolean isLocalHttp = "http".equals(normalizedScheme) && LOCAL_HOSTS.contains(normalizedHost);
        if (!isHttps && !isLocalHttp) {
            throw new IllegalStateException(
                    "APP_ALLOWED_ORIGINS must use https in prod (except localhost): " + origin);
        }
    }
}
