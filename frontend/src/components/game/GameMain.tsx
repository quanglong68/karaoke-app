import type { ReactNode } from "react";
import MainLayout from "./MainLayout";
import PixelIcon from "../ui/PixelIcon";

export type MobileGameTab = "stage" | "board" | "chat";

interface GameMainProps {
    left: ReactNode;
    center: ReactNode;
    right: ReactNode;
    controls: ReactNode;
    strip?: ReactNode;
    mobileTab: MobileGameTab;
    onMobileTabChange: (tab: MobileGameTab) => void;
    unreadChat: number;
}

export default function GameMain({
    left,
    center,
    right,
    controls,
    strip,
    mobileTab,
    onMobileTabChange,
    unreadChat,
}: GameMainProps) {
    return (
        <div className={`game-main-wrap mobile-tab-${mobileTab}`}>
            <MainLayout
                left={left}
                center={
                    <>
                        {center}
                        {strip}
                        {controls}
                    </>
                }
                right={right}
            />
            <nav className="mobile-game-bar" aria-label="Điều hướng phòng chơi">
                <button
                    type="button"
                    className={`mobile-game-tab${mobileTab === "stage" ? " is-active" : ""}`}
                    onClick={() => onMobileTabChange("stage")}
                    aria-current={mobileTab === "stage" ? "page" : undefined}
                >
                    <PixelIcon name="music" size={18} />
                    <span>Sân khấu</span>
                </button>
                <button
                    type="button"
                    className={`mobile-game-tab${mobileTab === "board" ? " is-active" : ""}`}
                    onClick={() => onMobileTabChange("board")}
                    aria-current={mobileTab === "board" ? "page" : undefined}
                >
                    <PixelIcon name="trophy" size={18} />
                    <span>Xếp hạng</span>
                </button>
                <button
                    type="button"
                    className={`mobile-game-tab${mobileTab === "chat" ? " is-active" : ""}`}
                    onClick={() => onMobileTabChange("chat")}
                    aria-current={mobileTab === "chat" ? "page" : undefined}
                >
                    <span className="mobile-game-tab-icon">
                        <PixelIcon name="chat" size={18} />
                        {unreadChat > 0 && (
                            <span className="mobile-game-badge" aria-label={`${unreadChat} tin nhắn mới`}>
                                {unreadChat > 9 ? "9+" : unreadChat}
                            </span>
                        )}
                    </span>
                    <span>Chat</span>
                </button>
            </nav>
        </div>
    );
}
