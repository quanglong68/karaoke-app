package com.karaoke.backend.controller;

import com.karaoke.backend.persistence.AdminEntity;
import com.karaoke.backend.persistence.AdminRepository;
import com.karaoke.backend.persistence.AdminRole;
import com.karaoke.backend.persistence.AdminSessionRepository;
import com.karaoke.backend.persistence.AiApiKeyRepository;
import com.karaoke.backend.persistence.AiModelRepository;
import com.karaoke.backend.service.AiCatalogService;
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

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:adminaiconfig;DB_CLOSE_DELAY=-1",
        "app.allowed-origins=http://localhost:5173",
        "ai.crypto-key=test-ai-crypto-secret-key"
})
@AutoConfigureMockMvc
class AdminAiConfigApiTest {

    private static final String PASSWORD = "secret123456";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AdminRepository adminRepository;

    @Autowired
    private AdminSessionRepository adminSessionRepository;

    @Autowired
    private AiApiKeyRepository aiApiKeyRepository;

    @Autowired
    private AiModelRepository aiModelRepository;

    @Autowired
    private AiCatalogService aiCatalogService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private Cookie session;

    @BeforeEach
    void setUp() throws Exception {
        adminSessionRepository.deleteAll();
        adminRepository.deleteAll();
        aiApiKeyRepository.deleteAll();
        aiCatalogService.evictAll();

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
        mockMvc.perform(get("/api/admin/ai/runtime"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("ADMIN_UNAUTHORIZED"));
    }

    @Test
    void runtimeAndDefaultModelsAreAvailable() throws Exception {
        mockMvc.perform(get("/api/admin/ai/runtime").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cryptoConfigured").value(true))
                .andExpect(jsonPath("$.activeDbKeys").value(0));

        mockMvc.perform(get("/api/admin/ai/models").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(5))))
                .andExpect(jsonPath("$[0].modelName").value("gemini-2.5-flash"));
    }

    @Test
    void keyCrudMasksSecretAndRejectsDuplicates() throws Exception {
        String createBody = """
                {
                  "label": "Acc Free 1",
                  "apiKey": "AIzaSyExampleKeyValue9876",
                  "priority": 10,
                  "active": true
                }
                """;

        MvcResult created = mockMvc.perform(post("/api/admin/ai/keys").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.label").value("Acc Free 1"))
                .andExpect(jsonPath("$.keyMasked").value("AIza••••9876"))
                .andExpect(jsonPath("$.apiKey").doesNotExist())
                .andExpect(jsonPath("$.priority").value(10))
                .andReturn();

        Long id = com.jayway.jsonpath.JsonPath.read(
                created.getResponse().getContentAsString(), "$.id") instanceof Number n ? n.longValue() : 1L;

        // Duplicate key rejected
        mockMvc.perform(post("/api/admin/ai/keys").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_AI_KEY"));

        // Update priority & active
        mockMvc.perform(put("/api/admin/ai/keys/" + id).cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"label\":\"Acc Updated\",\"priority\":25,\"active\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.label").value("Acc Updated"))
                .andExpect(jsonPath("$.priority").value(25))
                .andExpect(jsonPath("$.active").value(false));

        // Delete key
        mockMvc.perform(delete("/api/admin/ai/keys/" + id).cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest"))
                .andExpect(status().isNoContent());
    }

    @Test
    void modelCrudValidatesPatternAndDuplicates() throws Exception {
        mockMvc.perform(post("/api/admin/ai/models").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"modelName\":\"bad model name!\",\"priority\":50}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_AI_CONFIG"));

        MvcResult created = mockMvc.perform(post("/api/admin/ai/models").cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"modelName\":\"gemini-custom-test\",\"displayName\":\"Custom\",\"priority\":60}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.modelName").value("gemini-custom-test"))
                .andReturn();

        Long id = com.jayway.jsonpath.JsonPath.read(
                created.getResponse().getContentAsString(), "$.id") instanceof Number n ? n.longValue() : 1L;

        mockMvc.perform(delete("/api/admin/ai/models/" + id).cookie(session)
                        .header("X-Requested-With", "XMLHttpRequest"))
                .andExpect(status().isNoContent());
    }
}
