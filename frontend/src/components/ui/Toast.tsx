import type { ReactNode } from "react";

interface ToastProps {
    message: string;
    type?: "success" | "error" | "info";
    onClose?: () => void;
    actions?: ReactNode;
}

export default function Toast({ message, type = "info", onClose, actions }: ToastProps) {
    const borderColor = type === "error" ? "rgba(255, 122, 89, 0.5)" : type === "success" ? "rgba(0, 245, 212, 0.5)" : "rgba(143, 163, 255, 0.4)";
    const background = type === "error" ? "rgba(255, 122, 89, 0.16)" : type === "success" ? "rgba(0, 245, 212, 0.14)" : "rgba(143, 163, 255, 0.12)";
    const color = type === "error" ? "#ffd6cc" : type === "success" ? "#b8fff1" : "#d7dcff";

    return (
        <div style={{
            position: "fixed",
            top: "24px",
            right: "24px",
            zIndex: 2000,
            minWidth: "260px",
            maxWidth: "420px",
            padding: "12px 16px",
            borderRadius: "14px",
            background,
            border: `1px solid ${borderColor}`,
            color,
            boxShadow: "0 16px 30px rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            animation: "floatIn 0.3s ease"
        }}>
            <span style={{ fontSize: "14px" }}>{message}</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {actions}
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            border: "none",
                            background: "transparent",
                            color,
                            cursor: "pointer",
                            fontWeight: 700
                        }}
                    >
                        x
                    </button>
                )}
            </div>
        </div>
    );
}
