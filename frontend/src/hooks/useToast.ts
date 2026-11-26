import { useCallback, useEffect, useRef, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastState {
    type: ToastType;
    text: string;
}

const TOAST_DURATION_MS = 3200;

export function useToast() {
    const [toast, setToast] = useState<ToastState | null>(null);
    const timerRef = useRef<number | null>(null);

    const showToast = useCallback((type: ToastType, text: string) => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
        }
        setToast({ type, text });
        timerRef.current = window.setTimeout(() => {
            setToast(null);
            timerRef.current = null;
        }, TOAST_DURATION_MS);
    }, []);

    const clearToast = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setToast(null);
    }, []);

    useEffect(() => () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
        }
    }, []);

    return { toast, showToast, clearToast };
}
