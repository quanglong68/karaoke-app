import type { ReactNode } from "react";

interface CenterColumnProps {
    children: ReactNode;
}

export default function CenterColumn({ children }: CenterColumnProps) {
    return <div className="game-center">{children}</div>;
}
