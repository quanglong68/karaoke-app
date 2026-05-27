import type { ReactNode } from "react";

interface StageFrameProps {
    children: ReactNode;
}

export default function StageFrame({ children }: StageFrameProps) {
    return (
        <div style={{
            position: "relative",
            width: "100%",
            maxWidth: "900px",
            aspectRatio: "16/9",
            backgroundColor: "#000",
            borderRadius: "18px",
            overflow: "hidden",
            boxShadow: "0 18px 46px rgba(0,0,0,0.7)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            animation: "floatIn 0.6s ease"
        }}>
            {children}
        </div>
    );
}
