package com.karaoke.backend.controller;

import com.karaoke.backend.controller.AdminAiDtos.AiKeyResponse;
import com.karaoke.backend.controller.AdminAiDtos.AiModelResponse;
import com.karaoke.backend.controller.AdminAiDtos.AiTestResult;
import com.karaoke.backend.controller.AdminAiDtos.BatchTestModelsRequest;
import com.karaoke.backend.controller.AdminAiDtos.BatchTestModelsResponse;
import com.karaoke.backend.controller.AdminAiDtos.CreateAiKeyRequest;
import com.karaoke.backend.controller.AdminAiDtos.CreateAiModelRequest;
import com.karaoke.backend.controller.AdminAiDtos.RuntimeStatus;
import com.karaoke.backend.controller.AdminAiDtos.TestDraftKeyRequest;
import com.karaoke.backend.controller.AdminAiDtos.TestDraftModelRequest;
import com.karaoke.backend.controller.AdminAiDtos.TestKeyRequest;
import com.karaoke.backend.controller.AdminAiDtos.TestModelRequest;
import com.karaoke.backend.controller.AdminAiDtos.UpdateAiKeyRequest;
import com.karaoke.backend.controller.AdminAiDtos.UpdateAiModelRequest;
import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.service.AdminAiConfigService;
import com.karaoke.backend.service.AuditLogger;
import com.karaoke.backend.service.ClientIpResolver;
import com.karaoke.backend.service.RateLimitService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/ai")
public class AdminAiConfigController {

    private static final int SINGLE_TEST_LIMIT = 30;
    private static final int BATCH_TEST_LIMIT = 10;
    private static final long TEST_WINDOW_MILLIS = 10 * 60 * 1000L;

    private final AdminAiConfigService service;
    private final RateLimitService rateLimitService;
    private final AuditLogger auditLogger;
    private final ClientIpResolver clientIpResolver;

    public AdminAiConfigController(
            AdminAiConfigService service,
            RateLimitService rateLimitService,
            AuditLogger auditLogger,
            ClientIpResolver clientIpResolver) {
        this.service = service;
        this.rateLimitService = rateLimitService;
        this.auditLogger = auditLogger;
        this.clientIpResolver = clientIpResolver;
    }

    @GetMapping("/runtime")
    public RuntimeStatus runtime() {
        return service.runtimeStatus();
    }

    @GetMapping("/keys")
    public List<AiKeyResponse> listKeys() {
        return service.listKeys();
    }

    @PostMapping("/keys")
    public AiKeyResponse createKey(@RequestBody(required = false) CreateAiKeyRequest req,
            Authentication authentication, HttpServletRequest httpRequest) {
        AiKeyResponse created = service.createKey(req);
        auditLogger.event("ai_key.create", AdminControllerSupport.actorName(authentication),
                clientIpResolver.resolve(httpRequest), "keyId=" + created.id() + " masked=" + created.keyMasked());
        return created;
    }

    @PutMapping("/keys/{id}")
    public AiKeyResponse updateKey(@PathVariable Long id, @RequestBody(required = false) UpdateAiKeyRequest req,
            Authentication authentication, HttpServletRequest httpRequest) {
        AiKeyResponse updated = service.updateKey(id, req);
        auditLogger.event("ai_key.update", AdminControllerSupport.actorName(authentication),
                clientIpResolver.resolve(httpRequest),
                "keyId=" + id + " active=" + updated.active() + " priority=" + updated.priority());
        return updated;
    }

    @DeleteMapping("/keys/{id}")
    public ResponseEntity<Void> deleteKey(@PathVariable Long id,
            Authentication authentication, HttpServletRequest httpRequest) {
        service.deleteKey(id);
        auditLogger.event("ai_key.delete", AdminControllerSupport.actorName(authentication),
                clientIpResolver.resolve(httpRequest), "keyId=" + id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/keys/{id}/test")
    public AiTestResult testSavedKey(@PathVariable Long id, @RequestBody(required = false) TestKeyRequest req,
            Authentication authentication) {
        enforceRateLimit("ai-test-single:" + AdminControllerSupport.actorName(authentication), SINGLE_TEST_LIMIT);
        return service.testSavedKey(id, req);
    }

    @PostMapping("/keys/test-draft")
    public AiTestResult testDraftKey(@RequestBody(required = false) TestDraftKeyRequest req,
            Authentication authentication) {
        enforceRateLimit("ai-test-single:" + AdminControllerSupport.actorName(authentication), SINGLE_TEST_LIMIT);
        return service.testDraftKey(req);
    }

    @GetMapping("/models")
    public List<AiModelResponse> listModels() {
        return service.listModels();
    }

    @PostMapping("/models")
    public AiModelResponse createModel(@RequestBody(required = false) CreateAiModelRequest req,
            Authentication authentication, HttpServletRequest httpRequest) {
        AiModelResponse created = service.createModel(req);
        auditLogger.event("ai_model.create", AdminControllerSupport.actorName(authentication),
                clientIpResolver.resolve(httpRequest), "model=" + created.modelName());
        return created;
    }

    @PutMapping("/models/{id}")
    public AiModelResponse updateModel(@PathVariable Long id, @RequestBody(required = false) UpdateAiModelRequest req,
            Authentication authentication, HttpServletRequest httpRequest) {
        AiModelResponse updated = service.updateModel(id, req);
        auditLogger.event("ai_model.update", AdminControllerSupport.actorName(authentication),
                clientIpResolver.resolve(httpRequest),
                "modelId=" + id + " active=" + updated.active() + " priority=" + updated.priority());
        return updated;
    }

    @DeleteMapping("/models/{id}")
    public ResponseEntity<Void> deleteModel(@PathVariable Long id,
            Authentication authentication, HttpServletRequest httpRequest) {
        service.deleteModel(id);
        auditLogger.event("ai_model.delete", AdminControllerSupport.actorName(authentication),
                clientIpResolver.resolve(httpRequest), "modelId=" + id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/models/{id}/test")
    public AiTestResult testSavedModel(@PathVariable Long id, @RequestBody(required = false) TestModelRequest req,
            Authentication authentication) {
        enforceRateLimit("ai-test-single:" + AdminControllerSupport.actorName(authentication), SINGLE_TEST_LIMIT);
        return service.testSavedModel(id, req);
    }

    @PostMapping("/models/test-draft")
    public AiTestResult testDraftModel(@RequestBody(required = false) TestDraftModelRequest req,
            Authentication authentication) {
        enforceRateLimit("ai-test-single:" + AdminControllerSupport.actorName(authentication), SINGLE_TEST_LIMIT);
        return service.testDraftModel(req);
    }

    @PostMapping("/models/test-batch")
    public BatchTestModelsResponse testModelsBatch(@RequestBody(required = false) BatchTestModelsRequest req,
            Authentication authentication) {
        enforceRateLimit("ai-test-batch:" + AdminControllerSupport.actorName(authentication), BATCH_TEST_LIMIT);
        return service.testModelsBatch(req);
    }

    private void enforceRateLimit(String key, int limit) {
        RateLimitService.Decision decision = rateLimitService.check(key, limit, TEST_WINDOW_MILLIS);
        if (!decision.allowed()) {
            throw AppException.tooManyRequests("RATE_LIMITED", decision.retryAfterSeconds());
        }
    }
}
