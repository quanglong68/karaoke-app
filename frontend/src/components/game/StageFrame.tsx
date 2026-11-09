import type { ReactNode } from "react";

interface StageFrameProps {
    children: ReactNode;
}

export default function StageFrame({ children }: StageFrameProps) {
    return <div className="stage-frame">{children}</div>;
}
