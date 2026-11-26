package com.karaoke.backend.controller;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.persistence.AdminEntity;
import com.karaoke.backend.persistence.AdminRepository;
import com.karaoke.backend.persistence.AdminRole;
import com.karaoke.backend.persistence.AdminSessionRepository;
import com.karaoke.backend.service.SmartSongDraftService;
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

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:adminsongdraft;DB_CLOSE_DELAY=-1",
        "app.allowed-origins=http://localhost:5173",
        "ai.crypto-key=test-ai-crypto-secret-key"
})
@AutoConfigureMockMvc
class AdminSongDraftApiTest {

    private static final String PASSWORD = "secret123456";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AdminRepository adminRepository;

    @Autowired
    private AdminSessionRepository adminSessionRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private Cookie session;

    @BeforeEach
    void setUp() throws Exception {
        adminSessionRepository.deleteAll();
        adminRepository.deleteAll();

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
    void anonymousIsRejectedOnDraftEndpoints() throws Exception {
        mockMvc.perform(post("/api/admin/song-drafts/youtube")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":\"https://youtu.be/dQw4w9WgXcQ\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("ADMIN_UNAUTHORIZED"));
    }

    @Test
    void invalidYoutubeUrlReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/api/admin/song-drafts/youtube").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":\"https://evil.example.com/video.mp4\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_YOUTUBE_URL"));
    }

    @Test
    void unknownDraftReturnsNotFoundAndBlocksPathTraversal() throws Exception {
        mockMvc.perform(get("/api/admin/song-drafts/00000000-0000-0000-0000-000000000000/media/source").cookie(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DRAFT_NOT_FOUND"));

        mockMvc.perform(get("/api/admin/song-drafts/not-a-uuid/media/source").cookie(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DRAFT_NOT_FOUND"));
    }

    @Test
    void segmentRangeValidationEnforcesBounds() {
        assertDoesNotThrow(() -> SmartSongDraftService.validateSegmentRanges(10.0, 25.0, 25.0, 45.0, 180.0));

        // Listen segment too short (< 3s)
        AppException tooShortListen = assertThrows(AppException.class,
                () -> SmartSongDraftService.validateSegmentRanges(10.0, 11.5, 12.0, 30.0, 180.0));
        assertEquals("INVALID_SEGMENT_RANGE", tooShortListen.getCode());

        // Sing segment too short (< 5s)
        AppException tooShortSing = assertThrows(AppException.class,
                () -> SmartSongDraftService.validateSegmentRanges(10.0, 22.0, 22.0, 25.0, 180.0));
        assertEquals("INVALID_SEGMENT_RANGE", tooShortSing.getCode());

        // Exceeds total duration
        AppException pastEnd = assertThrows(AppException.class,
                () -> SmartSongDraftService.validateSegmentRanges(10.0, 25.0, 25.0, 65.0, 50.0));
        assertEquals("INVALID_SEGMENT_RANGE", pastEnd.getCode());
    }
}
