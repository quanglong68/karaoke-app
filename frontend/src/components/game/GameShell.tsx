import type { ReactNode } from "react";

interface GameShellProps {
    children: ReactNode;
}

export default function GameShell({ children }: GameShellProps) {
    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            width: "100vw",
            position: "fixed",
            top: 0,
            left: 0,
            background: "var(--game-bg)",
            color: "#f7f7ff",
            fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
            overflow: "hidden"
        }}>
            {children}
        </div>
    );
}
