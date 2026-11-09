import type { ReactNode } from "react";
import PixelIcon from "./PixelIcon";
import type { PixelIconName } from "./PixelIcon";

interface ToastProps {
    message: string;
    type?: "success" | "error" | "info";
    onClose?: () => void;
    actions?: ReactNode;
}

const ICONS: Record<"success" | "error" | "info", PixelIconName> = {
    success: "check",
    error: "warning",
    info: "sparkles",
};

export default function Toast({ message, type = "info", onClose, actions }: ToastProps) {
    return (
        <div
            className={`p-toast p-toast--${type}`}
            role={type === "error" ? "alert" : "status"}
            aria-live={type === "error" ? "assertive" : "polite"}
        >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <PixelIcon name={ICONS[type]} size={18} />
                {message}
            </span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {actions}
                {onClose && (
                    <button type="button" className="p-toast-close" onClick={onClose} aria-label="Đóng thông báo">
                        <PixelIcon name="close" size={12} />
                    </button>
                )}
            </div>
        </div>
    );
}
