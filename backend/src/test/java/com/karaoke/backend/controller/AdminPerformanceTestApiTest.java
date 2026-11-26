package com.karaoke.backend.controller;

import com.karaoke.backend.model.Song;
import com.karaoke.backend.persistence.AdminEntity;
import com.karaoke.backend.persistence.AdminRepository;
import com.karaoke.backend.persistence.AdminRole;
import com.karaoke.backend.persistence.AdminSessionRepository;
import com.karaoke.backend.service.SongCatalog;
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

import java.util.List;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.lessThan;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:adminperftest;DB_CLOSE_DELAY=-1",
        "app.allowed-origins=http://localhost:5173",
        "ai.crypto-key=test-ai-crypto-secret-key"
})
@AutoConfigureMockMvc
class AdminPerformanceTestApiTest {

    private static final String PASSWORD = "secret123456";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AdminRepository adminRepository;

    @Autowired
    private AdminSessionRepository adminSessionRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private SongCatalog songCatalog;

    private Cookie session;
    private Song testSong;

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

        List<Double> melody = List.of(
                220.0, 246.94, 261.63, 293.66, 329.63, 293.66, 261.63, 246.94,
                220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0);
        testSong = songCatalog.addSong(
                "Bài Hát Thử",
                "https://res.cloudinary.com/demo/video/upload/test.mp4",
                "https://res.cloudinary.com/demo/video/upload/vocal.wav",
                15.0,
                "Em xin lỗi đã bỏ anh một mình",
                melody,
                "boss");
    }

    @Test
    void rejectsAnonymousRequests() throws Exception {
        mockMvc.perform(post("/api/admin/songs/" + testSong.getId() + "/test-score")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userLyrics\":\"test\",\"pitchContour\":[220.0]}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void distinguishesAccurateSingingFromIntentionallyBadAttempt() throws Exception {
        String goodPayload = """
                {
                  "userLyrics": "Em xin lỗi đã bỏ anh một mình",
                  "pitchContour": [110.0, 123.47, 130.81, 146.83, 164.81, 146.83, 130.81, 123.47, 110.0, 123.47, 130.81, 146.83, 164.81, 174.61, 196.0, 220.0]
                }
                """;
        mockMvc.perform(post("/api/admin/songs/" + testSong.getId() + "/test-score")
                        .cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(goodPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passed").value(true))
                .andExpect(jsonPath("$.toneScore").value(greaterThanOrEqualTo(90.0)))
                .andExpect(jsonPath("$.lyricsScore").value(greaterThanOrEqualTo(95.0)))
                .andExpect(jsonPath("$.finalScore").value(greaterThanOrEqualTo(90.0)));

        // Intentionally monotone drone + wrong words -> must fail!
        String badPayload = """
                {
                  "userLyrics": "hát linh tinh sai hết lời rồi",
                  "pitchContour": [200.0, 200.0, 200.0, 200.0, 200.0, 200.0, 200.0, 200.0, 200.0, 200.0, 200.0, 200.0]
                }
                """;
        mockMvc.perform(post("/api/admin/songs/" + testSong.getId() + "/test-score")
                        .cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(badPayload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passed").value(false))
                .andExpect(jsonPath("$.toneScore").value(lessThan(20.0)))
                .andExpect(jsonPath("$.finalScore").value(lessThan(50.0)));
    }
}
