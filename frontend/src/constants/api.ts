const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const envApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const envWsEndpoint = (import.meta.env.VITE_WS_ENDPOINT as string | undefined)?.trim();

export const API_BASE_URL = envApiBase ? trimTrailingSlash(envApiBase) : "";

export const WS_ENDPOINT = envWsEndpoint
    ? trimTrailingSlash(envWsEndpoint)
    : `${API_BASE_URL || window.location.origin}/ws-karaoke`;
