package com.karaoke.backend.service;

import com.karaoke.backend.controller.AdminAiDtos.AiKeyResponse;
import com.karaoke.backend.controller.AdminAiDtos.AiModelResponse;
import com.karaoke.backend.controller.AdminAiDtos.AiTestResult;
import com.karaoke.backend.controller.AdminAiDtos.BatchModelTestItem;
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
import com.karaoke.backend.persistence.AiApiKeyEntity;
import com.karaoke.backend.persistence.AiApiKeyRepository;
import com.karaoke.backend.persistence.AiModelEntity;
import com.karaoke.backend.persistence.AiModelRepository;
import com.karaoke.backend.persistence.AiTestStatus;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

@Service
public class AdminAiConfigService {

    private static final Pattern MODEL_NAME_PATTERN = Pattern.compile("^[A-Za-z0-9._-]{1,120}$");
    private static final int MAX_KEY_LENGTH = 2_000;
    private static final int MAX_LABEL_LENGTH = 100;
    private static final int MAX_DISPLAY_NAME_LENGTH = 120;
    private static final int MIN_PRIORITY = 0;
    private static final int MAX_PRIORITY = 10_000;

    private static final List<DefaultSeedModel> DEFAULT_MODELS = List.of(
            new DefaultSeedModel("gemini-2.5-flash", "Gemini 2.5 Flash (Free Tier · Multimodal Audio)", 10),
            new DefaultSeedModel("gemini-3.8-flash", "Gemini 3.8 Flash (Free Tier)", 20),
            new DefaultSeedModel("gemini-3.6-flash", "Gemini 3.6 Flash (Free Tier)", 30),
            new DefaultSeedModel("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite (Free Tier · Hạn mức cao)", 40),
            new DefaultSeedModel("gemini-4-hydrogen", "Gemini 4 Hydrogen (Free Tier)", 50));

    private record DefaultSeedModel(String modelName, String displayName, int priority) {
    }

    private final AiApiKeyRepository keyRepository;
    private final AiModelRepository modelRepository;
    private final AiCryptoService cryptoService;
    private final AiCatalogService catalogService;
    private final GeminiClient geminiClient;

    public AdminAiConfigService(
            AiApiKeyRepository keyRepository,
            AiModelRepository modelRepository,
            AiCryptoService cryptoService,
            AiCatalogService catalogService,
            GeminiClient geminiClient) {
        this.keyRepository = keyRepository;
        this.modelRepository = modelRepository;
        this.cryptoService = cryptoService;
        this.catalogService = catalogService;
        this.geminiClient = geminiClient;
    }

    @PostConstruct
    @Transactional
    public void seedDefaultModelsIfEmpty() {
        boolean changed = false;
        if (modelRepository.count() == 0) {
            for (DefaultSeedModel seed : DEFAULT_MODELS) {
                AiModelEntity entity = new AiModelEntity();
                entity.setModelName(seed.modelName());
                entity.setDisplayName(seed.displayName());
                entity.setPriority(seed.priority());
                entity.setActive(true);
                modelRepository.save(entity);
            }
            changed = true;
        }
        if (keyRepository.count() == 0 && cryptoService.isConfigured()) {
            List<String> envKeys = catalogService.configuredEnvKeys();
            int idx = 1;
            for (String rawKey : envKeys) {
                String fp = AiCryptoService.fingerprint(rawKey);
                if (keyRepository.existsByKeyFingerprint(fp)) {
                    continue;
                }
                AiApiKeyEntity entity = new AiApiKeyEntity();
                entity.setLabel("Gemini Key #" + idx);
                entity.setKeyEncrypted(cryptoService.encrypt(rawKey));
                entity.setKeyMasked(AiCryptoService.mask(rawKey));
                entity.setKeyFingerprint(fp);
                entity.setPriority(idx * 10);
                entity.setActive(true);
                keyRepository.save(entity);
                idx++;
            }
            if (idx > 1) {
                changed = true;
            }
        }
        if (changed) {
            catalogService.evictAll();
        }
    }

    @Transactional(readOnly = true)
    public RuntimeStatus runtimeStatus() {
        int activeKeys = keyRepository.findByActiveTrueOrderByPriorityAscIdAsc().size();
        int activeModels = modelRepository.findByActiveTrueOrderByPriorityAscIdAsc().size();
        return new RuntimeStatus(
                cryptoService.isConfigured(),
                catalogService.envFallbackKeyMasked(),
                catalogService.envFallbackModel(),
                activeKeys,
                activeModels);
    }

    @Transactional(readOnly = true)
    public List<AiKeyResponse> listKeys() {
        return keyRepository.findAllByOrderByPriorityAscIdAsc().stream()
                .map(this::toKeyResponse)
                .toList();
    }

    @Transactional
    public AiKeyResponse createKey(CreateAiKeyRequest req) {
        if (req == null || req.apiKey() == null) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        String raw = req.apiKey().trim();
        if (raw.isEmpty() || raw.length() > MAX_KEY_LENGTH) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        String label = validateOptionalText(req.label(), MAX_LABEL_LENGTH);
        int priority = validatePriority(req.priority(), 100);

        String fingerprint = AiCryptoService.fingerprint(raw);
        if (keyRepository.existsByKeyFingerprint(fingerprint)) {
            throw AppException.conflict("DUPLICATE_AI_KEY");
        }

        AiApiKeyEntity entity = new AiApiKeyEntity();
        entity.setLabel(label);
        entity.setKeyEncrypted(cryptoService.encrypt(raw));
        entity.setKeyMasked(AiCryptoService.mask(raw));
        entity.setKeyFingerprint(fingerprint);
        entity.setPriority(priority);
        entity.setActive(req.active() == null || req.active());

        AiApiKeyEntity saved = keyRepository.save(entity);
        catalogService.evictAll();
        return toKeyResponse(saved);
    }

    @Transactional
    public AiKeyResponse updateKey(Long id, UpdateAiKeyRequest req) {
        if (req == null) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        AiApiKeyEntity entity = keyRepository.findById(id)
                .orElseThrow(() -> AppException.notFound("AI_KEY_NOT_FOUND"));

        if (req.label() != null) {
            entity.setLabel(validateOptionalText(req.label(), MAX_LABEL_LENGTH));
        }
        if (req.priority() != null) {
            entity.setPriority(validatePriority(req.priority(), entity.getPriority()));
        }
        if (req.active() != null) {
            entity.setActive(req.active());
        }
        AiApiKeyEntity saved = keyRepository.save(entity);
        catalogService.evictAll();
        return toKeyResponse(saved);
    }

    @Transactional
    public void deleteKey(Long id) {
        AiApiKeyEntity entity = keyRepository.findById(id)
                .orElseThrow(() -> AppException.notFound("AI_KEY_NOT_FOUND"));
        keyRepository.delete(entity);
        catalogService.evictAll();
    }

    public AiTestResult testSavedKey(Long id, TestKeyRequest req) {
        AiApiKeyEntity entity = keyRepository.findById(id)
                .orElseThrow(() -> AppException.notFound("AI_KEY_NOT_FOUND"));
        String requestedModel = req != null ? validateOptionalModelName(req.modelName()) : null;
        String rawKey = cryptoService.decrypt(entity.getKeyEncrypted());
        List<String> candidateModels = resolveModelsForKeyTest(requestedModel);

        GeminiClient.TestOutcome outcome = geminiClient.testKeyConnection(rawKey, candidateModels);
        recordKeyTestResult(id, outcome);
        return toTestResult(outcome);
    }

    public AiTestResult testDraftKey(TestDraftKeyRequest req) {
        if (req == null || req.apiKey() == null || req.apiKey().trim().isEmpty()
                || req.apiKey().trim().length() > MAX_KEY_LENGTH) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        String requestedModel = validateOptionalModelName(req.modelName());
        List<String> candidateModels = resolveModelsForKeyTest(requestedModel);
        GeminiClient.TestOutcome outcome =
                geminiClient.testKeyConnection(req.apiKey().trim(), candidateModels);
        return toTestResult(outcome);
    }

    @Transactional(readOnly = true)
    public List<AiModelResponse> listModels() {
        return modelRepository.findAllByOrderByPriorityAscIdAsc().stream()
                .map(this::toModelResponse)
                .toList();
    }

    @Transactional
    public AiModelResponse createModel(CreateAiModelRequest req) {
        if (req == null) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        String name = validateRequiredModelName(req.modelName());
        String displayName = validateOptionalText(req.displayName(), MAX_DISPLAY_NAME_LENGTH);
        int priority = validatePriority(req.priority(), 100);

        if (modelRepository.existsByModelNameIgnoreCase(name)) {
            throw AppException.conflict("DUPLICATE_AI_MODEL");
        }

        AiModelEntity entity = new AiModelEntity();
        entity.setModelName(name);
        entity.setDisplayName(displayName);
        entity.setPriority(priority);
        entity.setActive(req.active() == null || req.active());

        AiModelEntity saved = modelRepository.save(entity);
        catalogService.evictAll();
        return toModelResponse(saved);
    }

    @Transactional
    public AiModelResponse updateModel(Long id, UpdateAiModelRequest req) {
        if (req == null) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        AiModelEntity entity = modelRepository.findById(id)
                .orElseThrow(() -> AppException.notFound("AI_MODEL_NOT_FOUND"));

        if (req.displayName() != null) {
            entity.setDisplayName(validateOptionalText(req.displayName(), MAX_DISPLAY_NAME_LENGTH));
        }
        if (req.priority() != null) {
            entity.setPriority(validatePriority(req.priority(), entity.getPriority()));
        }
        if (req.active() != null) {
            entity.setActive(req.active());
        }

        AiModelEntity saved = modelRepository.save(entity);
        catalogService.evictAll();
        return toModelResponse(saved);
    }

    @Transactional
    public void deleteModel(Long id) {
        AiModelEntity entity = modelRepository.findById(id)
                .orElseThrow(() -> AppException.notFound("AI_MODEL_NOT_FOUND"));
        modelRepository.delete(entity);
        catalogService.evictAll();
    }

    public AiTestResult testSavedModel(Long id, TestModelRequest req) {
        AiModelEntity entity = modelRepository.findById(id)
                .orElseThrow(() -> AppException.notFound("AI_MODEL_NOT_FOUND"));
        String rawKey = resolveKeyForModelTest(req != null ? req.keyId() : null);
        GeminiClient.TestOutcome outcome = geminiClient.testConnection(rawKey, entity.getModelName());
        recordModelTestResult(id, outcome);
        return toTestResult(outcome);
    }

    public AiTestResult testDraftModel(TestDraftModelRequest req) {
        if (req == null) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        String modelName = validateRequiredModelName(req.modelName());
        String rawKey = resolveKeyForModelTest(req.keyId());
        GeminiClient.TestOutcome outcome = geminiClient.testConnection(rawKey, modelName);
        return toTestResult(outcome);
    }

    public BatchTestModelsResponse testModelsBatch(BatchTestModelsRequest req) {
        if (req != null && req.modelIds() != null && req.modelIds().size() > 30) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        String rawKey = resolveKeyForModelTest(req != null ? req.keyId() : null);
        List<AiModelEntity> allOrdered = modelRepository.findAllByOrderByPriorityAscIdAsc();
        List<AiModelEntity> targets;
        if (req != null && req.modelIds() != null && !req.modelIds().isEmpty()) {
            Set<Long> wanted = Set.copyOf(req.modelIds());
            targets = allOrdered.stream().filter(m -> wanted.contains(m.getId())).toList();
        } else {
            targets = allOrdered;
        }
        if (targets.isEmpty()) {
            return new BatchTestModelsResponse(0, 0, 0, List.of());
        }

        int poolSize = Math.min(4, targets.size());
        List<BatchModelTestItem> items = new ArrayList<>(targets.size());
        try (ExecutorService pool = Executors.newFixedThreadPool(poolSize)) {
            List<CompletableFuture<BatchModelTestItem>> futures = targets.stream()
                    .map(model -> CompletableFuture.supplyAsync(() -> {
                        GeminiClient.TestOutcome outcome =
                                geminiClient.testConnection(rawKey, model.getModelName());
                        recordModelTestResult(model.getId(), outcome);
                        return new BatchModelTestItem(model.getId(), model.getModelName(), toTestResult(outcome));
                    }, pool))
                    .toList();
            for (var future : futures) {
                items.add(future.join());
            }
        }
        int passed = (int) items.stream().filter(i -> i.result().ok()).count();
        return new BatchTestModelsResponse(items.size(), passed, items.size() - passed, items);
    }

    private void recordKeyTestResult(Long id, GeminiClient.TestOutcome outcome) {
        keyRepository.findById(id).ifPresent(entity -> {
            entity.setLastTestAt(OffsetDateTime.now());
            entity.setLastTestStatus(outcome.ok() ? AiTestStatus.OK : AiTestStatus.FAIL);
            entity.setLastTestMessage(clip(outcome.message(), 500));
            entity.setFailCount(outcome.ok() ? 0 : entity.getFailCount() + 1);
            keyRepository.save(entity);
        });
    }

    private void recordModelTestResult(Long id, GeminiClient.TestOutcome outcome) {
        modelRepository.findById(id).ifPresent(entity -> {
            entity.setLastTestAt(OffsetDateTime.now());
            entity.setLastTestStatus(outcome.ok() ? AiTestStatus.OK : AiTestStatus.FAIL);
            entity.setLastTestMessage(clip(outcome.message(), 500));
            modelRepository.save(entity);
        });
    }

    private List<String> resolveModelsForKeyTest(String requestedModel) {
        if (requestedModel != null && !requestedModel.isBlank()) {
            return List.of(requestedModel.trim());
        }
        List<String> active = catalogService.activeModels();
        List<String> liteFirst = new ArrayList<>();
        for (String model : active) {
            if (model.toLowerCase(Locale.ROOT).contains("flash")) {
                liteFirst.add(model);
            }
        }
        for (String model : active) {
            if (!liteFirst.contains(model)) {
                liteFirst.add(model);
            }
        }
        if (liteFirst.isEmpty()) {
            liteFirst.add("gemini-2.5-flash");
        }
        return liteFirst;
    }

    private String resolveKeyForModelTest(Long keyId) {
        if (keyId != null) {
            AiApiKeyEntity key = keyRepository.findById(keyId)
                    .orElseThrow(() -> AppException.notFound("AI_KEY_NOT_FOUND"));
            return cryptoService.decrypt(key.getKeyEncrypted());
        }
        List<AiCatalogService.KeyCandidate> keys = catalogService.activeKeys();
        if (!keys.isEmpty()) {
            return keys.getFirst().rawKey();
        }
        String envKey = catalogService.primaryEnvKeyOrNull();
        if (envKey != null) {
            return envKey;
        }
        throw AppException.unavailable("AI_NOT_CONFIGURED");
    }

    private static int validatePriority(Integer raw, int defaultVal) {
        if (raw == null) {
            return defaultVal;
        }
        if (raw < MIN_PRIORITY || raw > MAX_PRIORITY) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        return raw;
    }

    private static String validateRequiredModelName(String raw) {
        if (raw == null) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        String trimmed = raw.trim();
        if (!MODEL_NAME_PATTERN.matcher(trimmed).matches()) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        return trimmed;
    }

    private static String validateOptionalModelName(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return validateRequiredModelName(raw);
    }

    private static String validateOptionalText(String raw, int maxLen) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.length() > maxLen) {
            throw AppException.badRequest("INVALID_AI_CONFIG");
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    private AiKeyResponse toKeyResponse(AiApiKeyEntity k) {
        return new AiKeyResponse(
                k.getId(),
                k.getLabel(),
                k.getKeyMasked(),
                k.isActive(),
                k.getPriority(),
                k.getFailCount(),
                k.getLastTestAt(),
                k.getLastTestStatus(),
                k.getLastTestMessage(),
                k.getCreatedAt(),
                k.getUpdatedAt());
    }

    private AiModelResponse toModelResponse(AiModelEntity m) {
        return new AiModelResponse(
                m.getId(),
                m.getModelName(),
                m.getDisplayName(),
                m.isActive(),
                m.getPriority(),
                m.getLastTestAt(),
                m.getLastTestStatus(),
                m.getLastTestMessage(),
                m.getCreatedAt(),
                m.getUpdatedAt());
    }

    private static AiTestResult toTestResult(GeminiClient.TestOutcome outcome) {
        return new AiTestResult(
                outcome.ok(),
                outcome.statusCode(),
                outcome.latencyMs(),
                outcome.modelUsed(),
                outcome.message());
    }

    private static String clip(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }
}
