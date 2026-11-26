package com.karaoke.backend.controller;

import com.karaoke.backend.persistence.AdminEntity;
import com.karaoke.backend.persistence.AdminRepository;
import com.karaoke.backend.persistence.AdminRole;
import com.karaoke.backend.persistence.AdminSessionRepository;
import com.karaoke.backend.service.GameConfigService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:admingameconfig;DB_CLOSE_DELAY=-1",
        "app.allowed-origins=http://localhost:5173"
})
@AutoConfigureMockMvc
class AdminGameConfigApiTest {

    private static final String PASSWORD = "secret123";
    private static final String VALID_BODY = """
            {
              "maxRounds": 4,
              "maxPlayers": 6,
              "buzzerSeconds": 7,
              "countdownSeconds": 4,
              "performanceSeconds": 90,
              "minPerformanceSeconds": 20,
              "evaluationSeconds": 20,
              "nextPhaseDelaySeconds": 4,
              "endGameDelaySeconds": 8,
              "successScore": 75,
              "lyricsWeight": 0.6
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AdminRepository adminRepository;

    @Autowired
    private AdminSessionRepository adminSessionRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private GameConfigService gameConfigService;

    private Cookie session;

    @BeforeEach
    void seed() throws Exception {
        adminSessionRepository.deleteAll();
        adminRepository.deleteAll();
        gameConfigService.reset("test");

        AdminEntity admin = new AdminEntity();
        admin.setUsername("boss");
        admin.setPasswordHash(passwordEncoder.encode(PASSWORD));
        admin.setRole(AdminRole.ADMIN);
        admin.setEnabled(true);
        adminRepository.save(admin);

        MvcResult login = mockMvc.perform(post("/api/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        session = login.getResponse().getCookie("admin_session");
    }

    @Test
    void anonymousIsRejected() throws Exception {
        mockMvc.perform(get("/api/admin/game-config"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("ADMIN_UNAUTHORIZED"));
    }

    @Test
    void getReturnsSettingsDefaultsAndLimits() throws Exception {
        mockMvc.perform(get("/api/admin/game-config").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings.maxRounds").value(3))
                .andExpect(jsonPath("$.settings.performanceSeconds").value(60))
                .andExpect(jsonPath("$.settings.lyricsWeight").value(0.4))
                .andExpect(jsonPath("$.defaults.maxRounds").value(3))
                .andExpect(jsonPath("$.limits.performanceSeconds.min").value(30))
                .andExpect(jsonPath("$.limits.performanceSeconds.max").value(180))
                .andExpect(jsonPath("$.limits.lyricsWeight.min").value(0.1));
    }

    @Test
    void updateSavesTheNewSettings() throws Exception {
        mockMvc.perform(put("/api/admin/game-config").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.maxRounds").value(4))
                .andExpect(jsonPath("$.performanceSeconds").value(90));

        mockMvc.perform(get("/api/admin/game-config").cookie(session))
                .andExpect(jsonPath("$.settings.maxRounds").value(4))
                .andExpect(jsonPath("$.settings.maxPlayers").value(6))
                .andExpect(jsonPath("$.settings.successScore").value(75));
    }

    @Test
    void updateRejectsValuesOutsideTheLimits() throws Exception {
        mockMvc.perform(put("/api/admin/game-config").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY.replace("\"performanceSeconds\": 90", "\"performanceSeconds\": 5")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_GAME_CONFIG"));

        mockMvc.perform(get("/api/admin/game-config").cookie(session))
                .andExpect(jsonPath("$.settings.performanceSeconds").value(60));
    }

    @Test
    void updateRejectsMissingFields() throws Exception {
        mockMvc.perform(put("/api/admin/game-config").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"maxRounds\": 4}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_GAME_CONFIG"));
    }

    @Test
    void updateRejectsMinimumPerformanceTooCloseToTheMaximum() throws Exception {
        mockMvc.perform(put("/api/admin/game-config").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY.replace("\"minPerformanceSeconds\": 20",
                                "\"minPerformanceSeconds\": 88")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_GAME_CONFIG"));
    }

    @Test
    void resetRestoresTheDefaults() throws Exception {
        mockMvc.perform(put("/api/admin/game-config").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/admin/game-config/reset").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.maxRounds").value(3))
                .andExpect(jsonPath("$.performanceSeconds").value(60));
    }
}
