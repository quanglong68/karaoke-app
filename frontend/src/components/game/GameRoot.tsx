import type { ReactNode } from "react";
import GameShell from "./GameShell";
import GameStyles from "./GameStyles";

interface GameRootProps {
    header: ReactNode;
    main: ReactNode;
    overlay?: ReactNode;
}

export default function GameRoot({ header, main, overlay }: GameRootProps) {
    return (
        <GameShell>
            {header}
            {main}
            {overlay}
            <GameStyles />
        </GameShell>
    );
}
