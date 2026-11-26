import axios from "axios";

export interface ApiErrorBody {
    code?: string;
    message?: string;
}

export const getApiErrorCode = (error: unknown): string => {
    if (axios.isAxiosError<ApiErrorBody>(error)) {
        return error.response?.data?.code ?? "";
    }
    return "";
};

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
    if (axios.isAxiosError<ApiErrorBody>(error)) {
        return error.response?.data?.message || fallback;
    }
    return fallback;
};

export const isUnauthorizedError = (error: unknown): boolean => {
    return axios.isAxiosError(error) && error.response?.status === 401;
};
