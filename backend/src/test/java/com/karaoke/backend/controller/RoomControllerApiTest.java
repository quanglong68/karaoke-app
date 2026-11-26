package com.karaoke.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.model.GameSettings;
import com.karaoke.backend.persistence.SongRepository;
import com.karaoke.backend.service.GameConfigService;
import com.karaoke.backend.service.SongCatalog;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:roomapi;DB_CLOSE_DELAY=-1",
        "app.allowed-origins=http://localhost:5173"
})
@AutoConfigureMockMvc
class RoomControllerApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private GameConfigService gameConfigService;

    @Autowired
    private SongCatalog songCatalog;

    @Autowired
    private SongRepository songRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        gameConfigService.reset("test");
        if (songRepository.count() == 0) {
            songCatalog.addSong("Test Song", "https://res.cloudinary.com/demo/video/upload/v1/test.mp4",
                    null, 15.0, "la la la", List.of(220.0, 330.0), "test");
        }
    }

    @Test
    void createListRejoinAndLeaveFollowContract() throws Exception {
        MvcResult createResult = mockMvc.perform(post("/api/rooms/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roomName\":\"Phòng Test\",\"userName\":\"Host\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.room.roomName").value("Phòng Test"))
                .andExpect(jsonPath("$.room.maxPlayers").value(5))
                .andExpect(jsonPath("$.settings.maxRounds").value(3))
                .andExpect(jsonPath("$.sessionToken").isNotEmpty())
                .andReturn();

        JsonNode created = objectMapper.readTree(createResult.getResponse().getContentAsString());
        String roomId = created.get("room").get("roomId").asText();
        String token = created.get("sessionToken").asText();

        MvcResult listResult = mockMvc.perform(get("/api/rooms/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.roomId=='" + roomId + "')]", hasSize(1)))
                .andReturn();
        JsonNode listedRooms = objectMapper.readTree(listResult.getResponse().getContentAsString());
        JsonNode listedRoom = null;
        for (JsonNode entry : listedRooms) {
            if (roomId.equals(entry.path("roomId").asText())) {
                listedRoom = entry;
                break;
            }
        }
        assertTrue(listedRoom != null, "Created room must appear in /api/rooms/list");
        assertFalse(listedRoom.hasNonNull("upcomingVideoUrl"), "Lobby listing must hide upcomingVideoUrl");

        mockMvc.perform(post("/api/rooms/rejoin")
                        .header("X-Session-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.room.roomId").value(roomId))
                .andExpect(jsonPath("$.user.userName").value("Host"));

        mockMvc.perform(post("/api/rooms/leave")
                        .header("X-Session-Token", token))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/rooms/rejoin")
                        .header("X-Session-Token", token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_INVALID"));
    }

    @Test
    void createAndJoinValidateBodiesAndDynamicMaxPlayers() throws Exception {
        mockMvc.perform(post("/api/rooms/create"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_ROOM_REQUEST"));

        mockMvc.perform(post("/api/rooms/join"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_ROOM_REQUEST"));

        gameConfigService.update(new GameSettings(3, 2, 5, 3, 60, 15, 15, 3, 5, 70, 0.4), "boss");

        MvcResult createResult = mockMvc.perform(post("/api/rooms/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roomName\":\"Phòng Nhỏ\",\"userName\":\"Host\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.room.maxPlayers").value(2))
                .andReturn();

        String roomId = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("room").get("roomId").asText();

        mockMvc.perform(post("/api/rooms/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roomId\":\"" + roomId + "\",\"userName\":\"Guest1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.room.playerCount").value(2));

        mockMvc.perform(post("/api/rooms/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roomId\":\"" + roomId + "\",\"userName\":\"Guest2\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ROOM_FULL"));
    }

    @Test
    void createRejectsOversizedJsonBody() throws Exception {
        String oversizedBody = "{\"roomName\":\"Phong\",\"userName\":\"" + "x".repeat(263_000) + "\"}";
        mockMvc.perform(post("/api/rooms/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(oversizedBody))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));
    }
}
