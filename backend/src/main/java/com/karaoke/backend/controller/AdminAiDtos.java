package com.karaoke.backend.controller;

import com.karaoke.backend.persistence.AiTestStatus;

import java.time.OffsetDateTime;
import java.util.List;

public final class AdminAiDtos {

    private AdminAiDtos() {
    }

    public record RuntimeStatus(
            boolean cryptoConfigured,
            String envFallbackKeyMasked,
            String envFallbackModel,
            int activeDbKeys,
            int activeDbModels) {
    }

    public record AiKeyResponse(
            Long id,
            String label,
            String keyMasked,
            boolean active,
            int priority,
            int failCount,
            OffsetDateTime lastTestAt,
            AiTestStatus lastTestStatus,
            String lastTestMessage,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {
    }

    public record CreateAiKeyRequest(
            String label,
            String apiKey,
            Integer priority,
            Boolean active) {
    }

    public record UpdateAiKeyRequest(
            String label,
            Integer priority,
            Boolean active) {
    }

    public record TestKeyRequest(String modelName) {
    }

    public record TestDraftKeyRequest(String apiKey, String modelName) {
    }

    public record AiModelResponse(
            Long id,
            String modelName,
            String displayName,
            boolean active,
            int priority,
            OffsetDateTime lastTestAt,
            AiTestStatus lastTestStatus,
            String lastTestMessage,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {
    }

    public record CreateAiModelRequest(
            String modelName,
            String displayName,
            Integer priority,
            Boolean active) {
    }

    public record UpdateAiModelRequest(
            String displayName,
            Integer priority,
            Boolean active) {
    }

    public record TestModelRequest(Long keyId) {
    }

    public record TestDraftModelRequest(String modelName, Long keyId) {
    }

    public record AiTestResult(
            boolean ok,
            Integer statusCode,
            long latencyMs,
            String modelUsed,
            String message) {
    }

    public record BatchTestModelsRequest(List<Long> modelIds, Long keyId) {
    }

    public record BatchModelTestItem(Long modelId, String modelName, AiTestResult result) {
    }

    public record BatchTestModelsResponse(
            int total,
            int passed,
            int failed,
            List<BatchModelTestItem> items) {
    }
}
