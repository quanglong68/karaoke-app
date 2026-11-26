package com.karaoke.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.persistence.AiApiKeyRepository;
import com.karaoke.backend.persistence.AiModelRepository;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiCryptoAndRotationTest {

    @Test
    void cryptoEncryptsWithUniqueIvAndDecryptsCleanly() {
        AiCryptoService crypto = new AiCryptoService("super-secret-master-key");
        String raw = "AIzaSyTestKey12345678909999";

        String enc1 = crypto.encrypt(raw);
        String enc2 = crypto.encrypt(raw);

        assertNotEquals(enc1, enc2);
        assertEquals(raw, crypto.decrypt(enc1));
        assertEquals(raw, crypto.decrypt(enc2));
        assertEquals("AIza••••9999", AiCryptoService.mask(raw));
        assertEquals(AiCryptoService.fingerprint(raw), AiCryptoService.fingerprint("  " + raw + " "));
    }

    @Test
    void unconfiguredCryptoThrowsUnavailable() {
        AiCryptoService crypto = new AiCryptoService("   ");
        AppException ex = assertThrows(AppException.class, () -> crypto.encrypt("AIza12345678"));
        assertEquals("AI_CRYPTO_NOT_CONFIGURED", ex.getCode());
    }

    @Test
    void healthTrackerRotatesSamePriorityAndDeprioritizesBlocked() {
        AiHealthTracker tracker = new AiHealthTracker();
        var k1 = new AiCatalogService.KeyCandidate(10, "fp11111111", "raw1");
        var k2 = new AiCatalogService.KeyCandidate(10, "fp22222222", "raw2");
        var k3 = new AiCatalogService.KeyCandidate(20, "fp33333333", "raw3");
        List<AiCatalogService.KeyCandidate> base = List.of(k1, k2, k3);

        AtomicInteger cursor = new AtomicInteger(0);
        assertEquals(List.of(k1, k2, k3), tracker.orderKeys(base, cursor));

        cursor.incrementAndGet();
        assertEquals(List.of(k2, k1, k3), tracker.orderKeys(base, cursor));

        tracker.markKeyDead("fp22222222");
        assertEquals(List.of(k1, k3, k2), tracker.orderKeys(base, cursor));

        tracker.markPairQuota("fp11111111", "gemini-2.5-flash");
        assertEquals(
                List.of("gemini-3.8-flash", "gemini-2.5-flash"),
                tracker.orderModelsForKey(List.of("gemini-2.5-flash", "gemini-3.8-flash"), "fp11111111"));
    }

    @Test
    void geminiClientSkipsDeadKeyAndUnsupportedModelDuringAudioTranscription() throws Exception {
        List<String> attempts = new ArrayList<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1beta/models/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String apiKey = exchange.getRequestHeaders().getFirst("x-goog-api-key");
            attempts.add(apiKey + ":" + path);

            int status;
            String body;
            if ("dead-key".equals(apiKey)) {
                status = 401;
                body = "{\"error\":{\"message\":\"API key not valid\"}}";
            } else if (path.contains("text-only-model")) {
                status = 400;
                body = "{\"error\":{\"message\":\"Audio modality is not supported\"}}";
            } else {
                status = 200;
                body = """
                        {
                          "candidates": [{
                            "content": {
                              "parts": [{
                                "text": "{\\"lyrics\\":\\"Cám ơn anh vì ngày tháng qua\\\\nChúc anh yêu được người tốt hơn\\",\\"suggestedTitle\\":\\"Ex Hate Me\\"}"
                              }]
                            }
                          }]
                        }
                        """;
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        });
        server.start();

        try {
            int port = server.getAddress().getPort();
            RestClient redirectingClient = RestClient.builder()
                    .requestInterceptor((request, body, execution) -> {
                        var orig = request.getURI();
                        var localUri = java.net.URI.create("http://127.0.0.1:" + port + orig.getRawPath());
                        return execution.execute(new org.springframework.http.client.support.HttpRequestWrapper(request) {
                            @Override
                            public java.net.URI getURI() {
                                return localUri;
                            }
                        }, body);
                    })
                    .build();

            AiApiKeyRepository keyRepo = mock(AiApiKeyRepository.class);
            AiModelRepository modelRepo = mock(AiModelRepository.class);
            when(keyRepo.findByActiveTrueOrderByPriorityAscIdAsc()).thenReturn(List.of());
            when(modelRepo.findByActiveTrueOrderByPriorityAscIdAsc()).thenReturn(List.of());

            AiHealthTracker tracker = new AiHealthTracker();
            AiCatalogService catalog = new AiCatalogService(
                    keyRepo,
                    modelRepo,
                    new AiCryptoService("test-secret"),
                    tracker,
                    "dead-key,good-key",
                    "text-only-model,gemini-2.5-flash");

            GeminiClient client = new GeminiClient(
                    redirectingClient, new ObjectMapper(), catalog, tracker, 10L, 10_000L);

            GeminiClient.AudioTranscriptionResult res =
                    client.transcribeSongSegment(new byte[] { 1, 2, 3, 4 }, "audio/mp3", "");

            assertEquals("gemini-2.5-flash", res.modelUsed());
            assertEquals("Ex Hate Me", res.suggestedTitle());
            assertTrue(res.lyrics().contains("Cám ơn anh vì ngày tháng qua"));
            assertEquals(3, attempts.size());
        } finally {
            server.stop(0);
        }
    }
}
