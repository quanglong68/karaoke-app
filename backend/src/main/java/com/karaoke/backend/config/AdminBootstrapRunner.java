package com.karaoke.backend.config;

import com.karaoke.backend.persistence.AdminEntity;
import com.karaoke.backend.persistence.AdminRepository;
import com.karaoke.backend.persistence.AdminRole;
import com.karaoke.backend.service.AdminAuthService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

@Component
public class AdminBootstrapRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminBootstrapRunner.class);
    private static final int MIN_PASSWORD_LENGTH = 8;
    private static final int GENERATED_PASSWORD_LENGTH = 16;
    private static final char[] PASSWORD_ALPHABET =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789".toCharArray();

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final Environment environment;
    private final String bootstrapUsername;
    private final String bootstrapPassword;
    private final SecureRandom secureRandom = new SecureRandom();

    public AdminBootstrapRunner(AdminRepository adminRepository, PasswordEncoder passwordEncoder,
            Environment environment,
            @Value("${app.admin.bootstrap-username:}") String bootstrapUsername,
            @Value("${app.admin.bootstrap-password:}") String bootstrapPassword) {
        this.adminRepository = adminRepository;
        this.passwordEncoder = passwordEncoder;
        this.environment = environment;
        this.bootstrapUsername = bootstrapUsername;
        this.bootstrapPassword = bootstrapPassword;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (adminRepository.count() > 0) {
            return;
        }
        boolean production = environment.matchesProfiles("prod");
        String username = bootstrapUsername == null ? "" : bootstrapUsername.trim();
        String password = bootstrapPassword == null ? "" : bootstrapPassword;
        if (username.isEmpty()) {
            if (production) {
                throw new IllegalStateException(
                        "No admin account exists. Set ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD on first boot.");
            }
            log.warn("No admin account exists. Set ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD on first boot.");
            return;
        }
        if (password.isEmpty()) {
            if (production) {
                throw new IllegalStateException(
                        "No admin account exists. Set ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD on first boot.");
            }
            // Never ship a known default password, even in dev. A one-time random
            // password is printed so a fresh local database remains usable.
            password = generatePassword();
            log.warn("ADMIN_BOOTSTRAP_PASSWORD is empty; generated a one-time dev password for admin '{}': {}",
                    username, password);
        }
        if (password.length() < MIN_PASSWORD_LENGTH) {
            if (production) {
                throw new IllegalStateException(
                        "ADMIN_BOOTSTRAP_PASSWORD must be at least " + MIN_PASSWORD_LENGTH + " characters.");
            }
            log.error("ADMIN_BOOTSTRAP_PASSWORD must be at least {} characters; bootstrap admin not created.",
                    MIN_PASSWORD_LENGTH);
            return;
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > AdminAuthService.MAX_PASSWORD_UTF8_BYTES) {
            if (production) {
                throw new IllegalStateException("ADMIN_BOOTSTRAP_PASSWORD must not exceed "
                        + AdminAuthService.MAX_PASSWORD_UTF8_BYTES + " UTF-8 bytes.");
            }
            log.error("ADMIN_BOOTSTRAP_PASSWORD must not exceed {} UTF-8 bytes; bootstrap admin not created.",
                    AdminAuthService.MAX_PASSWORD_UTF8_BYTES);
            return;
        }

        AdminEntity admin = new AdminEntity();
        admin.setUsername(username);
        admin.setPasswordHash(passwordEncoder.encode(password));
        admin.setRole(AdminRole.ADMIN);
        admin.setEnabled(true);
        adminRepository.save(admin);
        log.info("Created bootstrap admin '{}'", username);
    }

    private String generatePassword() {
        StringBuilder builder = new StringBuilder(GENERATED_PASSWORD_LENGTH);
        for (int i = 0; i < GENERATED_PASSWORD_LENGTH; i++) {
            builder.append(PASSWORD_ALPHABET[secureRandom.nextInt(PASSWORD_ALPHABET.length)]);
        }
        return builder.toString();
    }
}
