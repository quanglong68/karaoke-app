package com.karaoke.backend.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ProductionConfigValidatorTest {

    private static ProductionConfigValidator validator(String origins, boolean cookieSecure,
            String bootstrapPassword, String dbPassword) {
        return new ProductionConfigValidator(origins, cookieSecure, bootstrapPassword, dbPassword,
                "demo-cloud", "api-key", "api-secret");
    }

    private static ProductionConfigValidator validValidator() {
        return validator("https://karaoke.example.com,http://localhost:8088", true, "", "real-db-password");
    }

    @Test
    void rejectsMissingOrigins() {
        assertThrows(IllegalStateException.class,
                () -> validator("", true, "", "real-db-password"));
    }

    @Test
    void rejectsWildcardOrigins() {
        assertThrows(IllegalStateException.class,
                () -> validator("https://192.168.*:[*]", true, "", "real-db-password"));
    }

    @Test
    void rejectsPlainHttpPublicOrigins() {
        assertThrows(IllegalStateException.class,
                () -> validator("http://karaoke.example.com", true, "", "real-db-password"));
    }

    @Test
    void rejectsInsecureCookie() {
        assertThrows(IllegalStateException.class,
                () -> validator("https://karaoke.example.com", false, "", "real-db-password"));
    }

    @Test
    void acceptsHttpsOriginsAndLocalhost() {
        assertDoesNotThrow(() -> validValidator());
    }

    @Test
    void rejectsExampleDatabasePassword() {
        assertThrows(IllegalStateException.class,
                () -> validator("https://karaoke.example.com", true, "", "change-me"));
    }

    @Test
    void rejectsExampleBootstrapPassword() {
        assertThrows(IllegalStateException.class,
                () -> validator("https://karaoke.example.com", true, "change-me-strong", "real-db-password"));
    }

    @Test
    void rejectsShortBootstrapPassword() {
        assertThrows(IllegalStateException.class,
                () -> validator("https://karaoke.example.com", true, "short-pass", "real-db-password"));
    }

    @Test
    void acceptsLongBootstrapPassword() {
        assertDoesNotThrow(() -> validator(
                "https://karaoke.example.com", true, "a-very-long-password", "real-db-password"));
    }

    @Test
    void rejectsMissingCloudinaryCredentials() {
        assertThrows(IllegalStateException.class, () -> new ProductionConfigValidator(
                "https://karaoke.example.com", true, "", "real-db-password", "", "", ""));
    }

    @Test
    void rejectsSpoofedLocalhostAndPathOriginsAndOverlongPassword() {
        assertThrows(IllegalStateException.class,
                () -> validator("http://localhost.evil.com", true, "", "real-db-password"));
        assertThrows(IllegalStateException.class,
                () -> validator("https://karaoke.example.com/admin", true, "", "real-db-password"));
        assertThrows(IllegalStateException.class,
                () -> validator("https://karaoke.example.com", true, "a".repeat(73), "real-db-password"));
    }
}
