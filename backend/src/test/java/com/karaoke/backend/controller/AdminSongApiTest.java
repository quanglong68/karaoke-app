package com.karaoke.backend.controller;

import com.karaoke.backend.persistence.AdminEntity;
import com.karaoke.backend.persistence.AdminRepository;
import com.karaoke.backend.persistence.AdminRole;
import com.karaoke.backend.persistence.AdminSessionRepository;
import com.karaoke.backend.persistence.PitchContourRepository;
import com.karaoke.backend.persistence.SongRepository;
import com.karaoke.backend.service.CloudinaryMediaService;
import com.karaoke.backend.service.SongCatalog;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.springframework.mock.web.MockMultipartFile;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:adminsongs;DB_CLOSE_DELAY=-1",
        "app.allowed-origins=http://localhost:5173"
})
@AutoConfigureMockMvc
class AdminSongApiTest {

    private static final String ADMIN_PASSWORD = "secret123";
    private static final List<Double> CONTOUR = List.of(0.1, 0.2, 0.3, 0.4);
    private static final String VOCAL_URL =
            "https://res.cloudinary.com/demo/video/upload/v1/karaoke/vocals/bai-ba.mp3";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AdminRepository adminRepository;

    @Autowired
    private AdminSessionRepository adminSessionRepository;

    @Autowired
    private SongRepository songRepository;

    @Autowired
    private PitchContourRepository pitchContourRepository;

    @Autowired
    private SongCatalog songCatalog;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @MockitoBean
    private CloudinaryMediaService cloudinaryMediaService;

    private static final AtomicInteger LOGIN_COUNTER = new AtomicInteger();
    private Cookie session;

    @BeforeEach
    void seed() throws Exception {
        adminSessionRepository.deleteAll();
        adminRepository.deleteAll();
        pitchContourRepository.deleteAll();
        songRepository.deleteAll();

        AdminEntity admin = new AdminEntity();
        admin.setUsername("boss");
        admin.setPasswordHash(passwordEncoder.encode(ADMIN_PASSWORD));
        admin.setRole(AdminRole.ADMIN);
        admin.setEnabled(true);
        adminRepository.save(admin);

        songCatalog.addSong("Bài Một", "https://youtu.be/one", null, 60, "Lời bài một", CONTOUR);
        songCatalog.addSong("Bài Hai", "https://youtu.be/two", null, 90, "Lời bài hai", CONTOUR);
        songCatalog.addSong("Bài Ba", "https://youtu.be/three", VOCAL_URL, 120, "Lời bài ba", CONTOUR);

        int ipOctet = LOGIN_COUNTER.incrementAndGet();
        MvcResult login = mockMvc.perform(post("/api/admin/login")
                        .with(req -> {
                            req.setRemoteAddr("10.0.1." + ipOctet);
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"boss\",\"password\":\"" + ADMIN_PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        session = login.getResponse().getCookie("admin_session");
    }

    @Test
    void anonymousIsRejected() throws Exception {
        mockMvc.perform(get("/api/admin/songs"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("ADMIN_UNAUTHORIZED"));
    }

    @Test
    void listReturnsSummariesWithSampleCounts() throws Exception {
        mockMvc.perform(get("/api/admin/songs").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.items", hasSize(3)))
                .andExpect(jsonPath("$.items[0].id").exists())
                .andExpect(jsonPath("$.items[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.items[0].sampleCount").value(CONTOUR.size()))
                .andExpect(jsonPath("$.items[0].lyrics").doesNotExist());
    }

    @Test
    void listSupportsSearchAndPagination() throws Exception {
        mockMvc.perform(get("/api/admin/songs").cookie(session)
                        .param("q", "hai"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].songName").value("Bài Hai"));

        mockMvc.perform(get("/api/admin/songs").cookie(session)
                        .param("page", "1")
                        .param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.items", hasSize(1)));
    }

    @Test
    void detailReturnsLyricsAndUnknownIdIs404() throws Exception {
        mockMvc.perform(get("/api/admin/songs/S001").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("S001"))
                .andExpect(jsonPath("$.lyrics").value("Lời bài một"))
                .andExpect(jsonPath("$.sampleCount").value(CONTOUR.size()));

        mockMvc.perform(get("/api/admin/songs/S999").cookie(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SONG_NOT_FOUND"));
    }

    @Test
    void updateChangesTitleAndLyrics() throws Exception {
        mockMvc.perform(put("/api/admin/songs/S002").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"songName\":\"Bài Hai Mới\",\"lyrics\":\"Lời mới\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.songName").value("Bài Hai Mới"))
                .andExpect(jsonPath("$.lyrics").value("Lời mới"));

        mockMvc.perform(get("/api/admin/songs/S002").cookie(session))
                .andExpect(jsonPath("$.videoUrl").value("https://youtu.be/two"))
                .andExpect(jsonPath("$.lyrics").value("Lời mới"));
    }

    @Test
    void archiveHidesSongFromCatalogAndCanBeRestored() throws Exception {
        int before = songCatalog.songCount();

        mockMvc.perform(get("/api/admin/songs/S003").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.vocalUrl").value(VOCAL_URL));
        when(cloudinaryMediaService.deleteByUrl(VOCAL_URL)).thenReturn(true);

        mockMvc.perform(delete("/api/admin/songs/S003").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest"))
                .andExpect(status().isNoContent());

        verify(cloudinaryMediaService).deleteByUrl(VOCAL_URL);
        assertEquals(before - 1, songCatalog.songCount());
        mockMvc.perform(get("/api/admin/songs/S003").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ARCHIVED"))
                .andExpect(jsonPath("$.vocalUrl").doesNotExist());

        mockMvc.perform(get("/api/admin/songs").cookie(session)
                        .param("status", "ARCHIVED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value("S003"));

        mockMvc.perform(put("/api/admin/songs/S003").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"ACTIVE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
        assertEquals(before, songCatalog.songCount());
    }

    @Test
    void archiveRetriesVocalDeletionAfterCloudinaryFailure() throws Exception {
        when(cloudinaryMediaService.deleteByUrl(VOCAL_URL)).thenReturn(false, true);

        mockMvc.perform(delete("/api/admin/songs/S003").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest"))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/admin/songs/S003").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ARCHIVED"))
                .andExpect(jsonPath("$.vocalUrl").value(VOCAL_URL));

        mockMvc.perform(delete("/api/admin/songs/S003").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest"))
                .andExpect(status().isNoContent());

        verify(cloudinaryMediaService, times(2)).deleteByUrl(VOCAL_URL);
        mockMvc.perform(get("/api/admin/songs/S003").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.vocalUrl").doesNotExist());
    }

    @Test
    void cancelUploadAcceptsKnownShapeAndRejectsInvalidRequestId() throws Exception {
        mockMvc.perform(post("/api/admin/upload-song/cancel").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .param("requestId", "3f6a9c1e-upload"))
                .andExpect(status().isAccepted());

        mockMvc.perform(post("/api/admin/upload-song/cancel").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .param("requestId", "bad id"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_UPLOAD"));
    }

    @Test
    void invalidRequestsAreRejected() throws Exception {
        mockMvc.perform(put("/api/admin/songs/S001").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"GONE\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_STATUS"));

        mockMvc.perform(put("/api/admin/songs/S001").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SONG_UPDATE"));

        mockMvc.perform(put("/api/admin/songs/S001").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"songName\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SONG_UPDATE"));

        mockMvc.perform(get("/api/admin/songs").cookie(session)
                        .param("status", "BROKEN"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Trạng thái")));

        mockMvc.perform(get("/api/admin/songs").cookie(session)
                        .param("q", "x".repeat(101)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }

    @Test
    void mutatingSongRequestWithoutCsrfHeaderIsRejected() throws Exception {
        mockMvc.perform(delete("/api/admin/songs/S003").cookie(session))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_FORBIDDEN"));

        mockMvc.perform(get("/api/admin/songs/S003").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void uploadSongRejectsSpoofedMediaSignatures() throws Exception {
        MockMultipartFile fakeVideo = new MockMultipartFile(
                "mainVideo", "song.mp4", "video/mp4", "not-a-real-mp4-header".getBytes());
        MockMultipartFile fakeVocal = new MockMultipartFile(
                "vocalFile", "vocal.mp3", "audio/mpeg", "ID3-fake-header".getBytes());

        mockMvc.perform(multipart("/api/admin/upload-song")
                        .file(fakeVideo)
                        .file(fakeVocal)
                        .param("title", "Bài Giả")
                        .param("lyrics", "Lời bài hát mẫu")
                        .param("duration", "30"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(multipart("/api/admin/upload-song").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .file(fakeVideo)
                        .file(fakeVocal)
                        .param("title", "Bài Giả")
                        .param("lyrics", "Lời bài hát mẫu")
                        .param("duration", "30"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_UPLOAD"));
    }

    @Test
    void anonymousOversizedMultipartUploadIsBlockedByBodyLimitFilter() throws Exception {
        byte[] oversized = new byte[270_000];
        // Use raw POST body so Content-Length reflects an actual HTTP multipart stream
        // (MockMvc's multipart() builder attaches parts in-memory without setting Content-Length).
        mockMvc.perform(post("/api/admin/upload-song")
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .content(oversized))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));

        // Authenticated admin multipart with CSRF header must bypass the 256 KB cap.
        MockMultipartFile largeFakeVideo = new MockMultipartFile("mainVideo", "song.mp4", "video/mp4", oversized);
        MockMultipartFile fakeVocal = new MockMultipartFile("vocalFile", "vocal.mp3", "audio/mpeg",
                "ID3-fake-header".getBytes());
        mockMvc.perform(multipart("/api/admin/upload-song").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .file(largeFakeVideo)
                        .file(fakeVocal)
                        .param("title", "Bài Lớn")
                        .param("lyrics", "Lời bài hát mẫu")
                        .param("duration", "30"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_UPLOAD"));
    }
}
