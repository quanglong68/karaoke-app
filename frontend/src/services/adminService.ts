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
    lyrics: string;
    createdBy: string | null;
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
};
