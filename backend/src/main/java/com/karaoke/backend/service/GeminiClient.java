package com.karaoke.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.exception.AppException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import javax.net.ssl.SSLException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

@Component
public class GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);

    private static final String BASE_URL =
            "https://generativelanguage.googleapis.com/v1beta/models/";
    private static final int OVERLOAD_MAX_RETRIES = 2;
    private static final long DEFAULT_RETRY_DELAY_MS = 1_500L;
    private static final long DEFAULT_BUDGET_MS = 75_000L;

    private static final String LYRICS_SYSTEM_PROMPT = """
            Bạn là chuyên gia nghe nhạc và chép lời karaoke chính xác tuyệt đối (Tiếng Việt và Tiếng Anh).
            Nhiệm vụ: Nghe đoạn âm thanh bài hát được đính kèm và chép lại CHÍNH XÁC từng câu lời ca sĩ hát trong đoạn này.
            Quy tắc bắt buộc:
            1. Trả về đúng JSON hợp lệ theo cấu trúc: {"lyrics": "Câu 1\\nCâu 2\\n...", "suggestedTitle": "Tên bài hát nếu nhận ra hoặc để rỗng"}
            2. Trường "lyrics" CHỈ chứa lời bài hát thực sự được hát, mỗi câu một dòng.
            3. KHÔNG viết mốc thời gian [00:12], KHÔNG viết nhãn [Điệp khúc]/[Verse], KHÔNG thêm lời bình luận.
            4. Viết đúng dấu Tiếng Việt chuẩn xác; nếu đoạn hoàn toàn không có tiếng người hát thì trả "lyrics": "".
            """;

    public record TestOutcome(
            boolean ok, Integer statusCode, long latencyMs, String modelUsed, String message) {
    }

    public record AudioTranscriptionResult(String lyrics, String suggestedTitle, String modelUsed) {
    }

    private enum FailureKind {
        KEY_INVALID,
        MODEL_INVALID,
        QUOTA,
        OVERLOADED,
        SERVER_ERROR,
        TIMEOUT,
        NETWORK,
        EMPTY_OUTPUT,
        BAD_REQUEST,
        UNKNOWN
    }

    private record ExecutionResult(String text, String modelUsed) {
    }

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final AiCatalogService catalogService;
    private final AiHealthTracker healthTracker;
    private final long retryDelayMs;
    private final long defaultBudgetMs;
    private final AtomicInteger keyCursor = new AtomicInteger(0);

    @Autowired
    public GeminiClient(AiCatalogService catalogService, AiHealthTracker healthTracker) {
        this(
                buildTimeoutRestClient(),
                new ObjectMapper(),
                catalogService,
                healthTracker,
                DEFAULT_RETRY_DELAY_MS,
                DEFAULT_BUDGET_MS);
    }

    public GeminiClient(
            RestClient restClient,
            ObjectMapper objectMapper,
            AiCatalogService catalogService,
            AiHealthTracker healthTracker,
            long retryDelayMs,
            long defaultBudgetMs) {
        this.restClient = restClient;
        this.objectMapper = objectMapper;
        this.catalogService = catalogService;
        this.healthTracker = healthTracker;
        this.retryDelayMs = retryDelayMs;
        this.defaultBudgetMs = defaultBudgetMs;
    }

    private static RestClient buildTimeoutRestClient() {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(8));
        factory.setReadTimeout(Duration.ofSeconds(25));
        return RestClient.builder().requestFactory(factory).build();
    }

    public boolean hasActiveCredentials() {
        return !catalogService.activeKeys().isEmpty() && !catalogService.activeModels().isEmpty();
    }

    public String generateContent(String systemPrompt, List<Map<String, Object>> history) {
        return executeWithSmartRotation(systemPrompt, history, 4_096, true, defaultBudgetMs).text();
    }

    public AudioTranscriptionResult transcribeSongSegment(byte[] audioBytes, String mimeType, String titleHint) {
        String base64Audio = Base64.getEncoder().encodeToString(audioBytes);
        String userText = (titleHint != null && !titleHint.isBlank())
                ? "Gợi ý tên bài hát/video: \"" + titleHint.trim() + "\". Hãy nghe đoạn âm thanh này và chép đúng lời ca sĩ hát."
                : "Hãy nghe đoạn âm thanh này và chép đúng lời ca sĩ hát.";

        List<Map<String, Object>> contents = List.of(Map.of(
                "role", "user",
                "parts", List.of(
                        Map.of("inlineData", Map.of(
                                "mimeType", (mimeType == null || mimeType.isBlank()) ? "audio/mp3" : mimeType,
                                "data", base64Audio)),
                        Map.of("text", userText))));

        ExecutionResult exec = executeWithSmartRotation(LYRICS_SYSTEM_PROMPT, contents, 2_048, true, defaultBudgetMs);
        String jsonText = extractValidJson(exec.text());
        try {
            JsonNode node = objectMapper.readTree(jsonText);
            String lyrics = node.path("lyrics").asText("").trim();
            String suggestedTitle = node.path("suggestedTitle").asText("").trim();
            return new AudioTranscriptionResult(lyrics, suggestedTitle, exec.modelUsed());
        } catch (Exception ignored) {
            return new AudioTranscriptionResult(exec.text().trim(), "", exec.modelUsed());
        }
    }

    public TestOutcome testConnection(String rawKey, String modelName) {
        long start = System.nanoTime();
        try {
            String text = executeSingleRequest(
                    modelName,
                    rawKey,
                    "You are a health check responder. Reply with {\"ok\":true}.",
                    List.of(Map.of("role", "user", "parts", List.of(Map.of("text", "ping")))),
                    256);
            long elapsedMs = (System.nanoTime() - start) / 1_000_000L;
            if (text == null || text.isBlank()) {
                return new TestOutcome(
                        false,
                        200,
                        elapsedMs,
                        modelName,
                        "Gemini phản hồi 200 nhưng không có nội dung (bị safety filter hoặc hết token)");
            }
            return new TestOutcome(
                    true,
                    200,
                    elapsedMs,
                    modelName,
                    "Kết nối Gemini thành công (" + modelName + ")");
        } catch (Exception exception) {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000L;
            Integer status = extractHttpStatus(exception);
            FailureKind kind = classifyFailure(exception);
            String detail = diagnoseMessage(kind, status, modelName, exception);
            return new TestOutcome(false, status, elapsedMs, modelName, detail);
        }
    }

    public TestOutcome testKeyConnection(String rawKey, List<String> candidateModels) {
        if (candidateModels == null || candidateModels.isEmpty()) {
            return testConnection(rawKey, "gemini-2.5-flash");
        }
        TestOutcome last = null;
        for (String model : candidateModels) {
            TestOutcome outcome = testConnection(rawKey, model);
            if (outcome.ok()) {
                return outcome;
            }
            last = outcome;
            if (outcome.statusCode() != null
                    && (outcome.statusCode() == 401 || outcome.statusCode() == 403)) {
                return outcome;
            }
            if (outcome.statusCode() == null
                    || (outcome.statusCode() != 503 && outcome.statusCode() != 404)) {
                return outcome;
            }
        }
        if (last != null && Integer.valueOf(503).equals(last.statusCode())) {
            return new TestOutcome(
                    true,
                    503,
                    last.latencyMs(),
                    last.modelUsed(),
                    "Key hợp lệ (Google đã xác thực), nhưng model '"
                            + last.modelUsed()
                            + "' đang quá tải (HTTP 503)");
        }
        return last;
    }

    private ExecutionResult executeWithSmartRotation(
            String systemPrompt,
            List<Map<String, Object>> history,
            int maxOutputTokens,
            boolean allowOverloadRetries,
            long budgetMs) {
        List<AiCatalogService.KeyCandidate> keys =
                healthTracker.orderKeys(catalogService.activeKeys(), keyCursor);
        List<String> models = catalogService.activeModels();

        if (keys.isEmpty() || models.isEmpty()) {
            log.warn("Không có Gemini API key hoặc model nào khả dụng để gọi AI.");
            throw AppException.unavailable("AI_NOT_CONFIGURED");
        }

        long deadlineMs = System.currentTimeMillis() + Math.max(1_000L, budgetMs);
        Set<String> invalidModelsInRequest = new HashSet<>();
        int maxAttemptsPerPair = allowOverloadRetries ? (1 + OVERLOAD_MAX_RETRIES) : 1;
        Exception lastException = null;

        for (AiCatalogService.KeyCandidate key : keys) {
            String keyTag = shortFp(key.fingerprint());
            List<String> modelsForKey = healthTracker.orderModelsForKey(models, key.fingerprint());
            int usableModels = 0;
            int quotaFailuresForKey = 0;

            modelLoop:
            for (String model : modelsForKey) {
                if (invalidModelsInRequest.contains(model)) {
                    continue;
                }
                usableModels++;

                for (int attempt = 1; attempt <= maxAttemptsPerPair; attempt++) {
                    if (System.currentTimeMillis() >= deadlineMs) {
                        log.error("Hết budget {}ms khi xoay Gemini key/model.", budgetMs);
                        throw AppException.unavailable("AI_EXHAUSTED");
                    }
                    try {
                        String raw = executeSingleRequest(
                                model,
                                key.rawKey(),
                                systemPrompt,
                                history,
                                maxOutputTokens);
                        keyCursor.incrementAndGet();
                        healthTracker.markPairSuccess(key.fingerprint(), model);
                        return new ExecutionResult(extractValidJson(raw), model);
                    } catch (Exception exception) {
                        lastException = exception;
                        FailureKind kind = classifyFailure(exception);
                        Integer status = extractHttpStatus(exception);
                        log.warn(
                                "Gemini call failed (key={}, model={}, attempt={}/{}, kind={}, status={}): {}",
                                keyTag,
                                model,
                                attempt,
                                maxAttemptsPerPair,
                                kind,
                                status,
                                safeErrorSummary(exception));

                        switch (kind) {
                            case KEY_INVALID -> {
                                healthTracker.markKeyDead(key.fingerprint());
                                break modelLoop;
                            }
                            case MODEL_INVALID -> {
                                invalidModelsInRequest.add(model);
                                usableModels = Math.max(0, usableModels - 1);
                                continue modelLoop;
                            }
                            case QUOTA -> {
                                healthTracker.markPairQuota(key.fingerprint(), model);
                                quotaFailuresForKey++;
                                continue modelLoop;
                            }
                            case BAD_REQUEST, EMPTY_OUTPUT, UNKNOWN, TIMEOUT -> {
                                continue modelLoop;
                            }
                            case OVERLOADED, SERVER_ERROR, NETWORK -> {
                                if (attempt >= maxAttemptsPerPair) {
                                    continue modelLoop;
                                }
                                if (!sleepWithinBudget(deadlineMs, retryDelayMs)) {
                                    throw AppException.unavailable("AI_EXHAUSTED");
                                }
                            }
                        }
                    }
                }
            }

            if (usableModels > 0 && quotaFailuresForKey >= usableModels) {
                healthTracker.markKeyQuotaExhausted(key.fingerprint());
            }
            keyCursor.incrementAndGet();
        }

        log.error("Exhausted all Gemini keys and models.", lastException);
        throw AppException.unavailable("AI_EXHAUSTED");
    }

    private String executeSingleRequest(
            String model,
            String apiKey,
            String systemPrompt,
            List<Map<String, Object>> history,
            int maxOutputTokens) {
        String url = BASE_URL + model + ":generateContent";

        Map<String, Object> generationConfig = new HashMap<>();
        generationConfig.put("responseMimeType", "application/json");
        generationConfig.put("maxOutputTokens", maxOutputTokens);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("systemInstruction", Map.of("parts", List.of(Map.of("text", systemPrompt))));
        requestBody.put("contents", history);
        requestBody.put("generationConfig", generationConfig);

        String responseStr = restClient
                .post()
                .uri(url)
                .contentType(MediaType.APPLICATION_JSON)
                .header("x-goog-api-key", apiKey)
                .body(requestBody)
                .retrieve()
                .body(String.class);

        try {
            JsonNode rootNode = objectMapper.readTree(responseStr);
            JsonNode partsNode = rootNode.path("candidates").path(0).path("content").path("parts");
            String resolvedText = extractCandidateText(partsNode);
            if (resolvedText == null || resolvedText.isBlank()) {
                throw new EmptyCandidateException();
            }
            return resolvedText;
        } catch (EmptyCandidateException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Error parsing Gemini API structure", exception);
        }
    }

    private static final class EmptyCandidateException extends RuntimeException {
        EmptyCandidateException() {
            super("Empty response from Gemini API");
        }
    }

    private static String extractCandidateText(JsonNode partsNode) {
        if (!partsNode.isArray() || partsNode.isEmpty()) {
            return null;
        }
        String fallbackText = null;
        for (JsonNode part : partsNode) {
            String text = part.path("text").asText(null);
            if (text == null || text.isBlank()) {
                continue;
            }
            if (!part.path("thought").asBoolean(false)) {
                return text;
            }
            fallbackText = text;
        }
        return fallbackText;
    }

    private FailureKind classifyFailure(Throwable throwable) {
        if (throwable instanceof EmptyCandidateException) {
            return FailureKind.EMPTY_OUTPUT;
        }
        if (hasCause(throwable, SocketTimeoutException.class) || hasCause(throwable, HttpTimeoutException.class)) {
            return FailureKind.TIMEOUT;
        }
        if (hasCause(throwable, UnknownHostException.class)
                || hasCause(throwable, ConnectException.class)
                || hasCause(throwable, SSLException.class)) {
            return FailureKind.NETWORK;
        }

        Integer status = extractHttpStatus(throwable);
        if (status != null) {
            if (status == 401 || status == 403) return FailureKind.KEY_INVALID;
            if (status == 404) return FailureKind.MODEL_INVALID;
            if (status == 429) return FailureKind.QUOTA;
            if (status == 503) return FailureKind.OVERLOADED;
            if (status == 504) return FailureKind.TIMEOUT;
            if (status >= 500) return FailureKind.SERVER_ERROR;
            if (status == 400 || status == 422) {
                String bodyUpper = safeBodyUpper(throwable);
                if (bodyUpper.contains("API_KEY_INVALID") || bodyUpper.contains("API KEY NOT VALID")) {
                    return FailureKind.KEY_INVALID;
                }
                if (bodyUpper.contains("MODEL_NOT_FOUND")) {
                    return FailureKind.MODEL_INVALID;
                }
                return FailureKind.BAD_REQUEST;
            }
        }

        String msg = safeErrorSummary(throwable).toUpperCase(Locale.ROOT);
        if (msg.contains("TIMED OUT") || msg.contains("TIMEOUT")) {
            return FailureKind.TIMEOUT;
        }
        if (msg.contains("API_KEY_INVALID")
                || msg.contains("API KEY NOT VALID")
                || msg.contains("PERMISSION_DENIED")
                || msg.contains("UNAUTHENTICATED")
                || hasNumericCode(msg, 401)
                || hasNumericCode(msg, 403)) {
            return FailureKind.KEY_INVALID;
        }
        if (msg.contains("MODEL_NOT_FOUND") || hasNumericCode(msg, 404)) {
            return FailureKind.MODEL_INVALID;
        }
        if (msg.contains("RESOURCE_EXHAUSTED")
                || msg.contains("QUOTA")
                || msg.contains("RATE LIMIT")
                || msg.contains("TOO MANY REQUESTS")
                || hasNumericCode(msg, 429)) {
            return FailureKind.QUOTA;
        }
        if (msg.contains("HIGH DEMAND")
                || msg.contains("OVERLOADED")
                || msg.contains("UNAVAILABLE")
                || hasNumericCode(msg, 503)) {
            return FailureKind.OVERLOADED;
        }
        if (throwable instanceof ResourceAccessException) {
            return FailureKind.NETWORK;
        }
        return FailureKind.UNKNOWN;
    }

    private Integer extractHttpStatus(Throwable throwable) {
        Throwable cur = throwable;
        int depth = 0;
        while (cur != null && depth++ < 10) {
            if (cur instanceof HttpStatusCodeException httpEx) {
                return httpEx.getStatusCode().value();
            }
            if (cur instanceof RestClientResponseException restEx) {
                return restEx.getStatusCode().value();
            }
            if (cur.getCause() == cur) break;
            cur = cur.getCause();
        }
        return null;
    }

    private String safeBodyUpper(Throwable throwable) {
        Throwable cur = throwable;
        int depth = 0;
        while (cur != null && depth++ < 10) {
            if (cur instanceof RestClientResponseException restEx) {
                String body = restEx.getResponseBodyAsString();
                return body == null ? "" : body.toUpperCase(Locale.ROOT);
            }
            if (cur.getCause() == cur) break;
            cur = cur.getCause();
        }
        return "";
    }

    private String extractUpstreamErrorMessage(Throwable throwable) {
        Throwable cur = throwable;
        int depth = 0;
        while (cur != null && depth++ < 10) {
            if (cur instanceof RestClientResponseException restEx) {
                String body = restEx.getResponseBodyAsString();
                if (body != null && !body.isBlank()) {
                    try {
                        JsonNode msgNode = objectMapper.readTree(body).path("error").path("message");
                        if (!msgNode.isMissingNode() && !msgNode.asText().isBlank()) {
                            return clipMsg(msgNode.asText().replaceAll("\\s+", " "), 180);
                        }
                    } catch (Exception ignored) {
                    }
                    return clipMsg(body.replaceAll("\\s+", " "), 180);
                }
            }
            if (cur.getCause() == cur) break;
            cur = cur.getCause();
        }
        return "";
    }

    private String diagnoseMessage(FailureKind kind, Integer status, String modelName, Throwable throwable) {
        String prefix = status == null ? "" : " (HTTP " + status + ")";
        String upstream = extractUpstreamErrorMessage(throwable);
        String suffix = upstream.isBlank() ? "" : ": " + upstream;
        return switch (kind) {
            case KEY_INVALID -> "API key không hợp lệ hoặc bị từ chối quyền" + prefix + suffix;
            case MODEL_INVALID -> "Model '" + modelName + "' không tồn tại hoặc không khả dụng" + prefix;
            case QUOTA -> "Hết lượt sử dụng / vượt hạn mức (Quota)" + prefix + suffix;
            case OVERLOADED -> "Model '" + modelName + "' đang quá tải (High demand)" + prefix;
            case SERVER_ERROR -> "Máy chủ Google Gemini gặp lỗi tạm thời" + prefix;
            case TIMEOUT -> "Timeout kết nối: Gemini không phản hồi kịp thời" + prefix;
            case NETWORK -> "Lỗi mạng: Không thể kết nối tới máy chủ Gemini ("
                    + clipMsg(safeErrorSummary(throwable), 140) + ")";
            case EMPTY_OUTPUT -> "Gemini trả 200 nhưng rỗng nội dung (bị lọc hoặc hết token)";
            case BAD_REQUEST -> "Yêu cầu không hợp lệ" + prefix + suffix;
            case UNKNOWN -> "Lỗi không xác định" + prefix + ": " + clipMsg(safeErrorSummary(throwable), 180);
        };
    }

    private String safeErrorSummary(Throwable throwable) {
        if (throwable instanceof RestClientResponseException restEx) {
            String body = restEx.getResponseBodyAsString();
            if (body != null && !body.isBlank()) {
                return clipMsg(body.replaceAll("\\s+", " "), 300);
            }
        }
        Throwable root = throwable;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String msg = root.getMessage();
        return (msg == null || msg.isBlank()) ? root.getClass().getSimpleName() : clipMsg(msg, 300);
    }

    private static String clipMsg(String text, int max) {
        if (text == null) return "";
        return text.length() <= max ? text : text.substring(0, max) + "...";
    }

    private static boolean hasNumericCode(String upperMsg, int code) {
        return Pattern.compile("(?<!\\d)" + code + "(?!\\d)").matcher(upperMsg).find();
    }

    private static boolean hasCause(Throwable throwable, Class<? extends Throwable> type) {
        Throwable cur = throwable;
        int depth = 0;
        while (cur != null && depth++ < 10) {
            if (type.isInstance(cur)) return true;
            if (cur.getCause() == cur) break;
            cur = cur.getCause();
        }
        return false;
    }

    private boolean sleepWithinBudget(long deadlineMs, long delayMs) {
        long remaining = deadlineMs - System.currentTimeMillis();
        if (remaining <= 0) return false;
        long actual = Math.min(delayMs, remaining);
        if (actual <= 0) return true;
        try {
            Thread.sleep(actual);
            return true;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static String shortFp(String fp) {
        if (fp == null || fp.length() < 8) return "unknown";
        return fp.substring(0, 8);
    }

    private static String extractValidJson(String rawResponse) {
        if (rawResponse == null) {
            return "";
        }
        int startIndex = rawResponse.indexOf('{');
        int endIndex = rawResponse.lastIndexOf('}');
        if (startIndex != -1 && endIndex != -1 && startIndex <= endIndex) {
            return rawResponse.substring(startIndex, endIndex + 1);
        }
        return rawResponse.trim();
    }
}
