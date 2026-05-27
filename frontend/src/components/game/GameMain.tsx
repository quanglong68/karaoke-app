import type { ReactNode } from "react";
import MainLayout from "./MainLayout";

interface GameMainProps {
    left: ReactNode;
    center: ReactNode;
    right: ReactNode;
    controls: ReactNode;
}

export default function GameMain({ left, center, right, controls }: GameMainProps) {
    return (
        <MainLayout
            left={left}
            center={
                <>
                    {center}
                    {controls}
                </>
            }
            right={right}
        />
    );
}
