import type { ReactNode } from "react";

interface CenterColumnProps {
    children: ReactNode;
}

export default function CenterColumn({ children }: CenterColumnProps) {
    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {children}
        </div>
    );
}
