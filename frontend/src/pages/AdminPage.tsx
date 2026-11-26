import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PixelIcon, { type PixelIconName } from "../components/ui/PixelIcon";
import AdminSongLibrary from "../components/admin/AdminSongLibrary";
import AdminUploadPanel from "../components/admin/AdminUploadPanel";
import AdminGameConfigPanel from "../components/admin/AdminGameConfigPanel";
import AdminAiConfigPanel from "../components/admin/AdminAiConfigPanel";
import AdminPasswordModal from "../components/admin/AdminPasswordModal";
import { adminService, type AdminMe } from "../services/adminService";

type AdminTab = "upload" | "library" | "config" | "ai";

const TAB_META: Record<AdminTab, { windowTitle: string; heading: string; icon: PixelIconName }> = {
    upload: { windowTitle: "music-upload.exe", heading: "Thêm bài hát", icon: "upload" },
    library: { windowTitle: "song-library.exe", heading: "Thư viện bài hát", icon: "music" },
    config: { windowTitle: "game-config.exe", heading: "Cấu hình game", icon: "gear" },
    ai: { windowTitle: "gemini-keys.exe", heading: "Cấu hình Gemini", icon: "key" },
};

const AdminPage: React.FC = () => {
    const [checkingSession, setCheckingSession] = useState(true);
    const [session, setSession] = useState<AdminMe | null>(null);
    const [tab, setTab] = useState<AdminTab>("upload");
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    const navigate = useNavigate();

    const handleUnauthorized = useCallback(() => {
        navigate("/admin/login", { replace: true });
    }, [navigate]);

    useEffect(() => {
        let cancelled = false;
        adminService
            .me()
            .then(me => {
                if (!cancelled) {
                    setSession(me);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    navigate("/admin/login", { replace: true });
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setCheckingSession(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [navigate]);

    const handleLogout = async () => {
        try {
            await adminService.logout();
        } catch {
            // Session might already be gone; go back to login either way.
        } finally {
            navigate("/admin/login", { replace: true });
        }
    };

    if (checkingSession || !session) {
        return (
            <main className="admin-page">
                <div className="admin-card admin-card--narrow">
                    <div className="admin-body">
                        <div className="admin-note">
                            <PixelIcon name="clock" size={14} />
                            Đang kiểm tra quyền quản trị...
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    const meta = TAB_META[tab];

    return (
        <main className="admin-page">
            <div className="admin-card admin-card--wide">
                <div className="p-window-bar">
                    <span className="p-window-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                    </span>
                    <span className="p-window-title pixel-label">{meta.windowTitle}</span>
                    <button type="button" className="pbtn pbtn--sm" onClick={() => navigate("/")}>
                        <PixelIcon name="arrowLeft" size={15} />
                        Về sảnh
                    </button>
                    <button type="button" className="pbtn pbtn--sm" onClick={() => setShowPasswordModal(true)}>
                        <PixelIcon name="gear" size={15} />
                        Đổi mật khẩu
                    </button>
                    <button type="button" className="pbtn pbtn--sm" onClick={handleLogout}>
                        <PixelIcon name="door" size={15} />
                        Đăng xuất
                    </button>
                </div>

                <div className="admin-body">
                    <div className="admin-head">
                        <h1 className="admin-title">
                            <PixelIcon name={meta.icon} size={22} />
                            {meta.heading}
                        </h1>
                        <span className="p-chip p-chip--rose">
                            <PixelIcon name="crown" size={13} />
                            {session.username}
                        </span>
                    </div>

                    <nav className="admin-tabs" role="tablist" aria-label="Khu vực quản trị">
                        <button
                            id="admin-tab-upload"
                            type="button"
                            role="tab"
                            aria-selected={tab === "upload"}
                            aria-controls="admin-tabpanel"
                            className={`admin-tab${tab === "upload" ? " admin-tab--active" : ""}`}
                            onClick={() => setTab("upload")}
                        >
                            <PixelIcon name="upload" size={15} />
                            Thêm bài hát
                        </button>
                        <button
                            id="admin-tab-library"
                            type="button"
                            role="tab"
                            aria-selected={tab === "library"}
                            aria-controls="admin-tabpanel"
                            className={`admin-tab${tab === "library" ? " admin-tab--active" : ""}`}
                            onClick={() => setTab("library")}
                        >
                            <PixelIcon name="music" size={15} />
                            Quản lý bài hát
                        </button>
                        <button
                            id="admin-tab-config"
                            type="button"
                            role="tab"
                            aria-selected={tab === "config"}
                            aria-controls="admin-tabpanel"
                            className={`admin-tab${tab === "config" ? " admin-tab--active" : ""}`}
                            onClick={() => setTab("config")}
                        >
                            <PixelIcon name="gear" size={15} />
                            Cấu hình game
                        </button>
                        <button
                            id="admin-tab-ai"
                            type="button"
                            role="tab"
                            aria-selected={tab === "ai"}
                            aria-controls="admin-tabpanel"
                            className={`admin-tab${tab === "ai" ? " admin-tab--active" : ""}`}
                            onClick={() => setTab("ai")}
                        >
                            <PixelIcon name="key" size={15} />
                            Cấu hình Gemini
                        </button>
                    </nav>

                    <div
                        id="admin-tabpanel"
                        role="tabpanel"
                        aria-labelledby={`admin-tab-${tab}`}
                        className="admin-form"
                    >
                        <div style={{ display: tab === "upload" ? "contents" : "none" }}>
                            <AdminUploadPanel
                                onUnauthorized={handleUnauthorized}
                                onOpenAiConfig={() => setTab("ai")}
                            />
                        </div>
                        {tab === "library" && <AdminSongLibrary onUnauthorized={handleUnauthorized} />}
                        {tab === "config" && <AdminGameConfigPanel onUnauthorized={handleUnauthorized} />}
                        {tab === "ai" && <AdminAiConfigPanel onUnauthorized={handleUnauthorized} />}
                    </div>
                </div>
            </div>

            {showPasswordModal && (
                <AdminPasswordModal
                    onClose={() => setShowPasswordModal(false)}
                    onUnauthorized={handleUnauthorized}
                />
            )}
        </main>
    );
};

export default AdminPage;
