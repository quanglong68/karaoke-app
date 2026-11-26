package com.karaoke.backend.service;

import com.karaoke.backend.persistence.AiApiKeyEntity;
import com.karaoke.backend.persistence.AiApiKeyRepository;
import com.karaoke.backend.persistence.AiModelEntity;
import com.karaoke.backend.persistence.AiModelRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Resolves active Gemini API keys and models: DB entries sorted by priority first (cached 60s),
 * with seamless fallback to environment variables (GEMINI_API_KEY, GEMINI_MODEL).
 */
@Service
public class AiCatalogService {

    private static final Logger log = LoggerFactory.getLogger(AiCatalogService.class);
    private static final long CACHE_TTL_MS = 60_000L;

    public record KeyCandidate(int priority, String fingerprint, String rawKey) {
    }

    private record Cached<T>(long loadedAtMs, T value) {
    }

    private final AiApiKeyRepository keyRepository;
    private final AiModelRepository modelRepository;
    private final AiCryptoService cryptoService;
    private final AiHealthTracker healthTracker;
    private final String envApiKeysRaw;
    private final String envModelsRaw;

    private volatile Cached<List<KeyCandidate>> keysCache;
    private volatile Cached<List<String>> modelsCache;

    public AiCatalogService(
            AiApiKeyRepository keyRepository,
            AiModelRepository modelRepository,
            AiCryptoService cryptoService,
            AiHealthTracker healthTracker,
            @Value("${ai.gemini.api-key:${GEMINI_API_KEY:}}") String envApiKeysRaw,
            @Value("${ai.gemini.model:${GEMINI_MODEL:gemini-2.5-flash,gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite,gemini-4-hydrogen}}")
            String envModelsRaw) {
        this.keyRepository = keyRepository;
        this.modelRepository = modelRepository;
        this.cryptoService = cryptoService;
        this.healthTracker = healthTracker;
        this.envApiKeysRaw = envApiKeysRaw == null ? "" : envApiKeysRaw;
        this.envModelsRaw = envModelsRaw == null ? "" : envModelsRaw;
    }

    public List<KeyCandidate> activeKeys() {
        long now = System.currentTimeMillis();
        Cached<List<KeyCandidate>> cached = keysCache;
        if (cached != null && now - cached.loadedAtMs() < CACHE_TTL_MS) {
            return cached.value();
        }
        List<KeyCandidate> result = new ArrayList<>();
        Set<String> seenFingerprints = new LinkedHashSet<>();

        for (AiApiKeyEntity entity : keyRepository.findByActiveTrueOrderByPriorityAscIdAsc()) {
            try {
                String raw = cryptoService.decrypt(entity.getKeyEncrypted()).trim();
                if (!raw.isEmpty() && seenFingerprints.add(entity.getKeyFingerprint())) {
                    result.add(new KeyCandidate(entity.getPriority(), entity.getKeyFingerprint(), raw));
                }
            } catch (Exception exception) {
                log.warn("Không giải mã được AI key id={} (masked={}): {}",
                        entity.getId(), entity.getKeyMasked(), exception.getMessage());
            }
        }

        for (String envKey : splitCsv(envApiKeysRaw)) {
            if (isPlaceholder(envKey)) {
                continue;
            }
            String fp = AiCryptoService.fingerprint(envKey);
            if (seenFingerprints.add(fp)) {
                result.add(new KeyCandidate(Integer.MAX_VALUE, fp, envKey));
            }
        }

        List<KeyCandidate> immutable = List.copyOf(result);
        keysCache = new Cached<>(now, immutable);
        return immutable;
    }

    public List<String> activeModels() {
        long now = System.currentTimeMillis();
        Cached<List<String>> cached = modelsCache;
        if (cached != null && now - cached.loadedAtMs() < CACHE_TTL_MS) {
            return cached.value();
        }
        List<String> out = new ArrayList<>();
        for (AiModelEntity model : modelRepository.findByActiveTrueOrderByPriorityAscIdAsc()) {
            String name = model.getModelName() == null ? "" : model.getModelName().trim();
            if (!name.isEmpty() && !out.contains(name)) {
                out.add(name);
            }
        }
        if (out.isEmpty()) {
            for (String envModel : splitCsv(envModelsRaw)) {
                if (!out.contains(envModel)) {
                    out.add(envModel);
                }
            }
        }
        if (out.isEmpty()) {
            out.add("gemini-2.5-flash");
        }
        List<String> immutable = List.copyOf(out);
        modelsCache = new Cached<>(now, immutable);
        return immutable;
    }

    public void evictAll() {
        keysCache = null;
        modelsCache = null;
        healthTracker.clear();
    }

    public String envFallbackKeyMasked() {
        List<String> keys = splitCsv(envApiKeysRaw).stream().filter(k -> !isPlaceholder(k)).toList();
        return keys.isEmpty() ? null : AiCryptoService.mask(keys.getFirst());
    }

    public String envFallbackModel() {
        List<String> models = splitCsv(envModelsRaw);
        return models.isEmpty() ? null : String.join(", ", models);
    }

    public String primaryEnvKeyOrNull() {
        return splitCsv(envApiKeysRaw).stream()
                .filter(k -> !isPlaceholder(k))
                .findFirst()
                .orElse(null);
    }

    public List<String> configuredEnvKeys() {
        return splitCsv(envApiKeysRaw).stream()
                .filter(k -> !isPlaceholder(k))
                .toList();
    }

    private static List<String> splitCsv(String raw) {
        List<String> list = new ArrayList<>();
        if (raw == null || raw.isBlank()) {
            return list;
        }
        for (String part : raw.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty() && !list.contains(trimmed)) {
                list.add(trimmed);
            }
        }
        return list;
    }

    private static boolean isPlaceholder(String value) {
        return value.startsWith("your_") && value.endsWith("_here");
    }
}
