package com.karaoke.backend.controller;

import com.karaoke.backend.persistence.AdminEntity;
import com.karaoke.backend.persistence.AdminRepository;
import com.karaoke.backend.persistence.AdminRole;
import com.karaoke.backend.persistence.AdminSessionRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:adminauth;DB_CLOSE_DELAY=-1",
        "app.allowed-origins=http://localhost:5173"
})
@AutoConfigureMockMvc
class AdminAuthTest {

    private static final String PASSWORD = "secret123";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AdminRepository adminRepository;

    @Autowired
    private AdminSessionRepository adminSessionRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void seedAdmins() {
        adminSessionRepository.deleteAll();
        adminRepository.deleteAll();
        saveAdmin("boss");
        saveAdmin("victim");
    }

    @Test
    void adminEndpointsRejectAnonymous() throws Exception {
        mockMvc.perform(get("/api/admin/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("ADMIN_UNAUTHORIZED"));

        mockMvc.perform(post("/api/admin/upload-song"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginMeLogoutFlow() throws Exception {
        MvcResult login = mockMvc.perform(post("/api/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("boss"))
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andReturn();

        Cookie sessionCookie = login.getResponse().getCookie("admin_session");
        org.junit.jupiter.api.Assertions.assertNotNull(sessionCookie, "login must set admin_session cookie");
        org.junit.jupiter.api.Assertions.assertTrue(sessionCookie.isHttpOnly());
        org.junit.jupiter.api.Assertions.assertEquals("/api/admin", sessionCookie.getPath());
        String setCookie = login.getResponse().getHeader("Set-Cookie");
        org.junit.jupiter.api.Assertions.assertNotNull(setCookie);
        org.junit.jupiter.api.Assertions.assertTrue(setCookie.contains("SameSite=Strict"));

        mockMvc.perform(get("/api/admin/me").cookie(sessionCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("boss"));

        // Cookie-authenticated mutating requests without X-Requested-With or from cross-site must be rejected.
        mockMvc.perform(post("/api/admin/logout").cookie(sessionCookie))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_FORBIDDEN"));

        mockMvc.perform(post("/api/admin/logout").cookie(sessionCookie)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .header("Sec-Fetch-Site", "cross-site"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_FORBIDDEN"));

        mockMvc.perform(post("/api/admin/logout").cookie(sessionCookie)
                        .header("X-Requested-With", "XMLHttpRequest"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/admin/me").cookie(sessionCookie))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginFromAllowedOriginIsNotBlockedByCors() throws Exception {
        mockMvc.perform(post("/api/admin/login")
                        .header("Origin", "http://localhost:5173")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/admin/login")
                        .header("Origin", "http://evil.example")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void wrongPasswordIsRejected() throws Exception {
        mockMvc.perform(post("/api/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void repeatedFailuresLockTheAccount() throws Exception {
        for (int attempt = 1; attempt < 5; attempt++) {
            mockMvc.perform(post("/api/admin/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"victim\",\"password\":\"wrong-password\"}"))
                    .andExpect(status().isUnauthorized());
        }
        mockMvc.perform(post("/api/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"victim\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isLocked())
                .andExpect(jsonPath("$.code").value("ACCOUNT_LOCKED"));

        mockMvc.perform(post("/api/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"victim\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isLocked());
    }

    @Test
    void overlongCredentialsAndOversizedBodiesAreRejected() throws Exception {
        String longUsername = "a".repeat(65);
        String longPassword = "p".repeat(73);
        mockMvc.perform(post("/api/admin/login")
                        .with(req -> {
                            req.setRemoteAddr("10.0.0.21");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + longUsername + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

        mockMvc.perform(post("/api/admin/login")
                        .with(req -> {
                            req.setRemoteAddr("10.0.0.21");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"" + longPassword + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

        String oversizedJson = "{\"username\":\"boss\",\"password\":\"" + "x".repeat(263_000) + "\"}";
        mockMvc.perform(post("/api/admin/login")
                        .with(req -> {
                            req.setRemoteAddr("10.0.0.22");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(oversizedJson))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));
    }

    @Test
    void rateLimitedLoginIncludesRetryAfterHeader() throws Exception {
        for (int i = 0; i < 10; i++) {
            mockMvc.perform(post("/api/admin/login")
                            .with(req -> {
                                req.setRemoteAddr("10.0.0.31");
                                return req;
                            })
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"boss\",\"password\":\"" + PASSWORD + "\"}"));
        }

        mockMvc.perform(post("/api/admin/login")
                        .with(req -> {
                            req.setRemoteAddr("10.0.0.31");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(header().string("Retry-After", containsString("")));
    }

    @Test
    void changePasswordValidatesInputUpdatesHashAndRevokesOtherSessions() throws Exception {
        MvcResult firstLogin = mockMvc.perform(post("/api/admin/login")
                        .with(req -> {
                            req.setRemoteAddr("10.0.0.41");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie firstSession = firstLogin.getResponse().getCookie("admin_session");

        MvcResult secondLogin = mockMvc.perform(post("/api/admin/login")
                        .with(req -> {
                            req.setRemoteAddr("10.0.0.42");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie otherBrowserSession = secondLogin.getResponse().getCookie("admin_session");

        // Wrong current password -> 400 WRONG_CURRENT_PASSWORD (keeps session open).
        mockMvc.perform(post("/api/admin/change-password").cookie(firstSession)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"wrong\",\"newPassword\":\"new-strong-password-123\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("WRONG_CURRENT_PASSWORD"));

        // Too-short new password -> 400 INVALID_PASSWORD.
        mockMvc.perform(post("/api/admin/change-password").cookie(firstSession)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"short123\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));

        // Valid change -> 204, current session stays valid, other session is revoked.
        String updatedPassword = "updated-admin-password-2026";
        mockMvc.perform(post("/api/admin/change-password").cookie(firstSession)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"" + updatedPassword + "\"}"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/admin/me").cookie(firstSession))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/admin/me").cookie(otherBrowserSession))
                .andExpect(status().isUnauthorized());

        // Old password no longer works; new password succeeds.
        mockMvc.perform(post("/api/admin/login")
                        .with(req -> {
                            req.setRemoteAddr("10.0.0.43");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/admin/login")
                        .with(req -> {
                            req.setRemoteAddr("10.0.0.44");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"" + updatedPassword + "\"}"))
                .andExpect(status().isOk());
    }

    private void saveAdmin(String username) {
        AdminEntity admin = new AdminEntity();
        admin.setUsername(username);
        admin.setPasswordHash(passwordEncoder.encode(PASSWORD));
        admin.setRole(AdminRole.ADMIN);
        admin.setEnabled(true);
        adminRepository.save(admin);
    }
}
