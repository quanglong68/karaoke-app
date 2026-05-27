import type { ReactNode } from "react";

interface LayoutColumnsProps {
    children: ReactNode;
}

export default function LayoutColumns({ children }: LayoutColumnsProps) {
    return (
        <div style={{ display: "flex", flex: 1, padding: "20px", gap: "20px", overflow: "hidden" }}>
            {children}
        </div>
    );
}
