import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PixelIcon from "../components/ui/PixelIcon";
import AdminSongLibrary from "../components/admin/AdminSongLibrary";
import AdminUploadPanel from "../components/admin/AdminUploadPanel";
import AdminGameConfigPanel from "../components/admin/AdminGameConfigPanel";
import AdminPasswordModal from "../components/admin/AdminPasswordModal";
import { adminService, type AdminMe } from "../services/adminService";

type AdminTab = 'upload' | 'library' | 'config';

const AdminPage: React.FC = () => {
    const [checkingSession, setCheckingSession] = useState(true);
    const [session, setSession] = useState<AdminMe | null>(null);
    const [tab, setTab] = useState<AdminTab>('upload');
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    const navigate = useNavigate();

    const handleUnauthorized = useCallback(() => {
        navigate('/admin/login', { replace: true });
    }, [navigate]);

    useEffect(() => {
        let cancelled = false;
        adminService.me()
            .then(me => {
                if (!cancelled) {
                    setSession(me);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    navigate('/admin/login', { replace: true });
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
            navigate('/admin/login', { replace: true });
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

    return (
        <main className="admin-page">
            <div className="admin-card admin-card--wide">
                <div className="p-window-bar">
                    <span className="p-window-dots" aria-hidden="true">
                        <i /><i /><i />
                    </span>
                    <span className="p-window-title pixel-label">
                        {tab === 'upload' ? 'music-upload.exe' : tab === 'library' ? 'song-library.exe' : 'game-config.exe'}
                    </span>
                    <button type="button" className="pbtn pbtn--sm" onClick={() => navigate('/')}>
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
                            <PixelIcon name={tab === 'upload' ? "upload" : tab === 'library' ? "music" : "gear"} size={22} />
                            {tab === 'upload' ? 'Thêm bài hát' : tab === 'library' ? 'Thư viện bài hát' : 'Cấu hình game'}
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
                            aria-selected={tab === 'upload'}
                            aria-controls="admin-tabpanel"
                            className={`admin-tab${tab === 'upload' ? ' admin-tab--active' : ''}`}
                            onClick={() => setTab('upload')}
                        >
                            <PixelIcon name="upload" size={15} />
                            Thêm bài hát
                        </button>
                        <button
                            id="admin-tab-library"
                            type="button"
                            role="tab"
                            aria-selected={tab === 'library'}
                            aria-controls="admin-tabpanel"
                            className={`admin-tab${tab === 'library' ? ' admin-tab--active' : ''}`}
                            onClick={() => setTab('library')}
                        >
                            <PixelIcon name="music" size={15} />
                            Quản lý bài hát
                        </button>
                        <button
                            id="admin-tab-config"
                            type="button"
                            role="tab"
                            aria-selected={tab === 'config'}
                            aria-controls="admin-tabpanel"
                            className={`admin-tab${tab === 'config' ? ' admin-tab--active' : ''}`}
                            onClick={() => setTab('config')}
                        >
                            <PixelIcon name="gear" size={15} />
                            Cấu hình game
                        </button>
                    </nav>

                    <div
                        id="admin-tabpanel"
                        role="tabpanel"
                        aria-labelledby={`admin-tab-${tab}`}
                        className="admin-form"
                    >
                        {tab === 'upload' && <AdminUploadPanel onUnauthorized={handleUnauthorized} />}
                        {tab === 'library' && <AdminSongLibrary onUnauthorized={handleUnauthorized} />}
                        {tab === 'config' && <AdminGameConfigPanel onUnauthorized={handleUnauthorized} />}
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
