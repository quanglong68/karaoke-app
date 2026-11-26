export const SUGGESTED_GEMINI_MODELS: Array<{ name: string; label: string }> = [
    { name: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Nghe nhạc chuẩn)" },
    { name: "gemini-3.8-flash", label: "Gemini 3.8 Flash (Free Tier)" },
    { name: "gemini-3.6-flash", label: "Gemini 3.6 Flash (Free Tier)" },
    { name: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (Hạn mức cao)" },
    { name: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen (Free Tier)" },
];

const MODEL_NAME_REGEX = /^[A-Za-z0-9._-]+$/;

export function validatePriorityInput(raw: string | number): { value: number; error: string } {
    const text = String(raw).trim();
    if (!text) {
        return { value: 100, error: "Thứ tự ưu tiên không được để trống." };
    }
    const num = Number(text);
    if (!Number.isInteger(num) || num < 0 || num > 10000) {
        return { value: 100, error: "Thứ tự ưu tiên phải là số nguyên từ 0 đến 10000." };
    }
    return { value: num, error: "" };
}

export function validateApiKeyInput(rawKey: string): string {
    const trimmed = rawKey.trim();
    if (!trimmed) return "API key không được để trống.";
    if (trimmed.length > 2000) return "API key tối đa 2000 ký tự.";
    return "";
}

export function validateModelNameInput(rawModel: string): string {
    const trimmed = rawModel.trim();
    if (!trimmed) return "Tên model không được để trống.";
    if (trimmed.length > 120) return "Tên model tối đa 120 ký tự.";
    if (!MODEL_NAME_REGEX.test(trimmed)) {
        return "Tên model chỉ được chứa chữ, số, dấu chấm (.), gạch ngang (-) và gạch dưới (_).";
    }
    return "";
}

export interface PrioritySwapUpdate {
    id: number;
    priority: number;
}

/**
 * Computes priority updates when moving an item up or down in an already priority-sorted list.
 * Handles equal priorities cleanly by shifting by 1 within [0, 10000].
 */
export function buildPriorityMove<T extends { id: number; priority: number }>(
    items: T[],
    index: number,
    direction: "up" | "down",
): PrioritySwapUpdate[] {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || index >= items.length || targetIndex >= items.length) {
        return [];
    }
    const current = items[index];
    const neighbor = items[targetIndex];
    if (current.priority !== neighbor.priority) {
        return [
            { id: current.id, priority: neighbor.priority },
            { id: neighbor.id, priority: current.priority },
        ];
    }
    if (direction === "up") {
        if (neighbor.priority > 0) {
            return [{ id: current.id, priority: neighbor.priority - 1 }];
        }
        return [{ id: neighbor.id, priority: Math.min(10000, current.priority + 1) }];
    }
    if (neighbor.priority < 10000) {
        return [{ id: current.id, priority: neighbor.priority + 1 }];
    }
    return [{ id: neighbor.id, priority: Math.max(0, current.priority - 1) }];
}

export function formatAiTestTime(value?: string | null): string {
    if (!value || Number.isNaN(Date.parse(value))) {
        return "Chưa test";
    }
    return new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}
