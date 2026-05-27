import type { ReactNode } from "react";
import CenterColumn from "./CenterColumn";
import LayoutColumns from "./LayoutColumns";

interface MainLayoutProps {
    left: ReactNode;
    center: ReactNode;
    right: ReactNode;
}

export default function MainLayout({ left, center, right }: MainLayoutProps) {
    return (
        <LayoutColumns>
            {left}
            <CenterColumn>{center}</CenterColumn>
            {right}
        </LayoutColumns>
    );
}
