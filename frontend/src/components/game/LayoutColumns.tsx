import type { ReactNode } from "react";

interface LayoutColumnsProps {
    children: ReactNode;
}

export default function LayoutColumns({ children }: LayoutColumnsProps) {
    return <div className="game-layout">{children}</div>;
}
