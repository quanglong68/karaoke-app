import type { ReactNode } from "react";

interface GameShellProps {
    children: ReactNode;
}

export default function GameShell({ children }: GameShellProps) {
    return <div className="game-shell">{children}</div>;
}
