import axios from "axios";
import { API_BASE_URL } from "../constants/api";
import type { GameSettings } from "../types/room";
export {
    getApiErrorCode as getAdminErrorCode,
    getApiErrorMessage as getAdminErrorMessage,
    isUnauthorizedError as isUnauthorized,
} from "./apiError";

export interface AdminMe {
    username: string;
    role: string;
    expiresAt: string;
}

export type SongStatus = "ACTIVE" | "ARCHIVED";

export interface AdminSongSummary {
    id: string;
    songName: string;
    listenDuration: number;
    totalDuration: number;
    status: SongStatus;
    sampleCount: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface AdminSongDetail extends AdminSongSummary {
    videoUrl: string;
    vocalUrl: string | null;
    lyrics: string;
    createdBy: string | null;
}

export interface PerformanceTestResult {
    toneScore: number;
    lyricsScore: number;
    finalScore: number;
    successThreshold: number;
    lyricsWeight: number;
    lyricsUnavailable: boolean;
    passed: boolean;
    capturedSampleCount: number;
    capturedVoicedCount: number;
    referenceVoicedCount: number;
    capturedLyrics: string;
}

export interface AdminSongPage {
    items: AdminSongSummary[];
    page: number;
    size: number;
    total: number;
    totalPages: number;
}

export interface AdminSongUpdate {
    songName?: string;
    lyrics?: string;
    status?: SongStatus;
}

export interface AdminSongListParams {
    status?: SongStatus;
    q?: string;
    page?: number;
    size?: number;
}

export interface GameConfigLimit {
    min: number;
    max: number;
    step: number;
}

export interface AdminGameConfig {
    settings: GameSettings;
    defaults: GameSettings;
    limits: Record<string, GameConfigLimit>;
}

export type AiTestStatus = "NEVER" | "OK" | "FAIL";

export interface AiRuntimeStatus {
    cryptoConfigured: boolean;
    envFallbackKeyMasked: string | null;
    envFallbackModel: string | null;
    activeDbKeys: number;
    activeDbModels: number;
}

export interface AiKeyItem {
    id: number;
    label: string | null;
    keyMasked: string;
    active: boolean;
    priority: number;
    failCount: number;
    lastTestAt: string | null;
    lastTestStatus: AiTestStatus;
    lastTestMessage: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AiModelItem {
    id: number;
    modelName: string;
    displayName: string | null;
    active: boolean;
    priority: number;
    lastTestAt: string | null;
    lastTestStatus: AiTestStatus;
    lastTestMessage: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AiTestResult {
    ok: boolean;
    statusCode: number | null;
    latencyMs: number;
    modelUsed: string;
    message: string;
}

export interface BatchModelTestItem {
    modelId: number;
    modelName: string;
    result: AiTestResult;
}

export interface BatchTestModelsResponse {
    total: number;
    passed: number;
    failed: number;
    items: BatchModelTestItem[];
}

export interface SongDraftSourceResponse {
    draftId: string;
    suggestedTitle: string;
    totalDuration: number;
    hasOfficialSubtitles: boolean;
    sourceStreamUrl: string;
}

export interface SongDraftAnalyzeResponse {
    draftId: string;
    listenDuration: number;
    singDuration: number;
    pitchSampleCount: number;
    voicedSampleCount: number;
    suggestedTitle: string;
    lyrics: string;
    lyricsSource: string;
    lyricsWarning: string | null;
    listenClipUrl: string;
    vocalPreviewUrl: string;
}

const API = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
    withCredentials: true,
    headers: { "X-Requested-With": "XMLHttpRequest" },
});

export const adminService = {
    me: async (): Promise<AdminMe> => {
        const response = await API.get<AdminMe>("/api/admin/me");
        return response.data;
    },
    login: async (username: string, password: string): Promise<AdminMe> => {
        const response = await API.post<AdminMe>("/api/admin/login", { username, password });
        return response.data;
    },
    logout: async (): Promise<void> => {
        await API.post("/api/admin/logout");
    },
    changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
        await API.post("/api/admin/change-password", { currentPassword, newPassword });
    },
    uploadSong: async (formData: FormData, signal?: AbortSignal): Promise<{ id: string; title: string }> => {
        const response = await API.post<{ id: string; title: string }>("/api/admin/upload-song", formData, {
            timeout: 10 * 60 * 1000,
            signal,
            headers: { "Content-Type": "multipart/form-data" },
        });
        return response.data;
    },
    cancelUpload: async (requestId: string): Promise<void> => {
        await API.post("/api/admin/upload-song/cancel", null, { params: { requestId } });
    },
    listSongs: async (params: AdminSongListParams): Promise<AdminSongPage> => {
        const response = await API.get<AdminSongPage>("/api/admin/songs", {
            params: {
                status: params.status,
                q: params.q || undefined,
                page: params.page ?? 0,
                size: params.size ?? 10,
            },
        });
        return response.data;
    },
    getSong: async (id: string): Promise<AdminSongDetail> => {
        const response = await API.get<AdminSongDetail>(`/api/admin/songs/${encodeURIComponent(id)}`);
        return response.data;
    },
    updateSong: async (id: string, payload: AdminSongUpdate): Promise<AdminSongDetail> => {
        const response = await API.put<AdminSongDetail>(`/api/admin/songs/${encodeURIComponent(id)}`, payload);
        return response.data;
    },
    archiveSong: async (id: string): Promise<void> => {
        await API.delete(`/api/admin/songs/${encodeURIComponent(id)}`);
    },
    getGameConfig: async (): Promise<AdminGameConfig> => {
        const response = await API.get<AdminGameConfig>("/api/admin/game-config");
        return response.data;
    },
    updateGameConfig: async (settings: GameSettings): Promise<GameSettings> => {
        const response = await API.put<GameSettings>("/api/admin/game-config", settings);
        return response.data;
    },
    resetGameConfig: async (): Promise<GameSettings> => {
        const response = await API.post<GameSettings>("/api/admin/game-config/reset");
        return response.data;
    },

    resolveMediaUrl: (relativeOrFullUrl: string): string => {
        if (!relativeOrFullUrl) return "";
        if (/^https?:\/\//i.test(relativeOrFullUrl) || relativeOrFullUrl.startsWith("blob:")) {
            return relativeOrFullUrl;
        }
        return `${API_BASE_URL}${relativeOrFullUrl.startsWith("/") ? "" : "/"}${relativeOrFullUrl}`;
    },

    // --- Admin AI Key & Model Management ---
    getAiRuntime: async (): Promise<AiRuntimeStatus> => {
        const response = await API.get<AiRuntimeStatus>("/api/admin/ai/runtime");
        return response.data;
    },
    listAiKeys: async (): Promise<AiKeyItem[]> => {
        const response = await API.get<AiKeyItem[]>("/api/admin/ai/keys");
        return response.data;
    },
    createAiKey: async (payload: {
        label?: string;
        apiKey: string;
        priority?: number;
        active?: boolean;
    }): Promise<AiKeyItem> => {
        const response = await API.post<AiKeyItem>("/api/admin/ai/keys", payload);
        return response.data;
    },
    updateAiKey: async (
        id: number,
        payload: { label?: string; priority?: number; active?: boolean },
    ): Promise<AiKeyItem> => {
        const response = await API.put<AiKeyItem>(`/api/admin/ai/keys/${id}`, payload);
        return response.data;
    },
    deleteAiKey: async (id: number): Promise<void> => {
        await API.delete(`/api/admin/ai/keys/${id}`);
    },
    testSavedAiKey: async (id: number, modelName?: string): Promise<AiTestResult> => {
        const response = await API.post<AiTestResult>(
            `/api/admin/ai/keys/${id}/test`,
            { modelName: modelName || undefined },
            { timeout: 45000 },
        );
        return response.data;
    },
    testDraftAiKey: async (payload: { apiKey: string; modelName?: string }): Promise<AiTestResult> => {
        const response = await API.post<AiTestResult>("/api/admin/ai/keys/test-draft", payload, {
            timeout: 45000,
        });
        return response.data;
    },
    listAiModels: async (): Promise<AiModelItem[]> => {
        const response = await API.get<AiModelItem[]>("/api/admin/ai/models");
        return response.data;
    },
    createAiModel: async (payload: {
        modelName: string;
        displayName?: string;
        priority?: number;
        active?: boolean;
    }): Promise<AiModelItem> => {
        const response = await API.post<AiModelItem>("/api/admin/ai/models", payload);
        return response.data;
    },
    updateAiModel: async (
        id: number,
        payload: { displayName?: string; priority?: number; active?: boolean },
    ): Promise<AiModelItem> => {
        const response = await API.put<AiModelItem>(`/api/admin/ai/models/${id}`, payload);
        return response.data;
    },
    deleteAiModel: async (id: number): Promise<void> => {
        await API.delete(`/api/admin/ai/models/${id}`);
    },
    testSavedAiModel: async (id: number, keyId?: number): Promise<AiTestResult> => {
        const response = await API.post<AiTestResult>(
            `/api/admin/ai/models/${id}/test`,
            { keyId: keyId ?? undefined },
            { timeout: 45000 },
        );
        return response.data;
    },
    testDraftAiModel: async (payload: { modelName: string; keyId?: number }): Promise<AiTestResult> => {
        const response = await API.post<AiTestResult>("/api/admin/ai/models/test-draft", payload, {
            timeout: 45000,
        });
        return response.data;
    },
    testAiModelsBatch: async (payload: {
        modelIds?: number[];
        keyId?: number;
    }): Promise<BatchTestModelsResponse> => {
        const response = await API.post<BatchTestModelsResponse>(
            "/api/admin/ai/models/test-batch",
            payload,
            { timeout: 120000 },
        );
        return response.data;
    },

    // --- Smart Song Drafts ---
    createYoutubeDraft: async (
        url: string,
        requestId: string,
        signal?: AbortSignal,
    ): Promise<SongDraftSourceResponse> => {
        const response = await API.post<SongDraftSourceResponse>(
            "/api/admin/song-drafts/youtube",
            { url, requestId },
            { timeout: 5 * 60 * 1000, signal },
        );
        return response.data;
    },
    uploadDraftSource: async (
        formData: FormData,
        signal?: AbortSignal,
    ): Promise<SongDraftSourceResponse> => {
        const response = await API.post<SongDraftSourceResponse>(
            "/api/admin/song-drafts/upload-source",
            formData,
            {
                timeout: 5 * 60 * 1000,
                signal,
                headers: { "Content-Type": "multipart/form-data" },
            },
        );
        return response.data;
    },
    analyzeSongDraft: async (
        draftId: string,
        formData: FormData,
        signal?: AbortSignal,
    ): Promise<SongDraftAnalyzeResponse> => {
        const response = await API.post<SongDraftAnalyzeResponse>(
            `/api/admin/song-drafts/${encodeURIComponent(draftId)}/analyze`,
            formData,
            {
                timeout: 10 * 60 * 1000,
                signal,
                headers: { "Content-Type": "multipart/form-data" },
            },
        );
        return response.data;
    },
    commitSongDraft: async (
        draftId: string,
        payload: { title: string; lyrics: string; requestId?: string },
        signal?: AbortSignal,
    ): Promise<{ id: string; title: string }> => {
        const response = await API.post<{ id: string; title: string }>(
            `/api/admin/song-drafts/${encodeURIComponent(draftId)}/commit`,
            payload,
            { timeout: 5 * 60 * 1000, signal },
        );
        return response.data;
    },
    cancelSongDraftOperation: async (requestId: string): Promise<void> => {
        await API.post("/api/admin/song-drafts/cancel", null, { params: { requestId } });
    },
    deleteSongDraft: async (draftId: string): Promise<void> => {
        await API.delete(`/api/admin/song-drafts/${encodeURIComponent(draftId)}`);
    },
    testSongScore: async (
        songId: string,
        payload: { userLyrics: string; pitchContour: number[] },
    ): Promise<PerformanceTestResult> => {
        const response = await API.post<PerformanceTestResult>(
            `/api/admin/songs/${encodeURIComponent(songId)}/test-score`,
            payload,
        );
        return response.data;
    },
    testDraftScore: async (
        draftId: string,
        payload: { userLyrics: string; pitchContour: number[]; lyricsOverride: string },
    ): Promise<PerformanceTestResult> => {
        const response = await API.post<PerformanceTestResult>(
            `/api/admin/song-drafts/${encodeURIComponent(draftId)}/test-score`,
            payload,
        );
        return response.data;
    },
};
