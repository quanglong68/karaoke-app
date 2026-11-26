import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PixelIcon from "../components/ui/PixelIcon";
import { adminService, getAdminErrorCode, getAdminErrorMessage } from "../services/adminService";

const loginErrorMessage = (error: unknown): string => {
    switch (getAdminErrorCode(error)) {
        case "INVALID_CREDENTIALS":
            return "Tên đăng nhập hoặc mật khẩu không đúng.";
        case "ACCOUNT_LOCKED":
            return "Tài khoản tạm khoá do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.";
        case "RATE_LIMITED":
            return "Bạn thử đăng nhập quá nhanh, vui lòng chờ vài phút.";
        default:
            return getAdminErrorMessage(error, "Không thể đăng nhập. Vui lòng thử lại.");
    }
};

const AdminLoginPage: React.FC = () => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);
    const [error, setError] = useState("");

    const navigate = useNavigate();

    useEffect(() => {
        let cancelled = false;
        adminService.me()
            .then(() => {
                if (!cancelled) {
                    navigate("/admin", { replace: true });
                }
            })
            .catch(() => {
                // No active session: stay on the login screen.
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

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        if (!username.trim() || !password) {
            setError("Vui lòng nhập đủ tên đăng nhập và mật khẩu.");
            return;
        }
        setLoading(true);
        try {
            await adminService.login(username.trim(), password);
            navigate("/admin", { replace: true });
        } catch (loginError) {
            setError(loginErrorMessage(loginError));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="admin-page">
            <div className="admin-card admin-card--narrow">
                <div className="p-window-bar">
                    <span className="p-window-dots" aria-hidden="true">
                        <i /><i /><i />
                    </span>
                    <span className="p-window-title pixel-label">admin-login.exe</span>
                    <button type="button" className="pbtn pbtn--sm" onClick={() => navigate("/")}>
                        <PixelIcon name="arrowLeft" size={15} />
                        Về sảnh
                    </button>
                </div>

                <div className="admin-body">
                    <div className="admin-head">
                        <h1 className="admin-title">
                            <PixelIcon name="gear" size={22} />
                            Đăng nhập quản trị
                        </h1>
                        <span className="p-chip p-chip--rose">
                            <PixelIcon name="warning" size={13} />
                            Khu vực quản trị
                        </span>
                    </div>

                    <p className="p-muted p-tiny">
                        Chỉ tài khoản quản trị mới thêm được bài hát vào hệ thống.
                    </p>

                    {checkingSession ? (
                        <div className="admin-note">
                            <PixelIcon name="clock" size={14} />
                            Đang kiểm tra phiên đăng nhập...
                        </div>
                    ) : (
                        <form className="admin-form" onSubmit={handleSubmit}>
                            <div className="p-field">
                                <label className="p-label" htmlFor="admin-username">
                                    <PixelIcon name="users" size={15} />
                                    Tên đăng nhập
                                </label>
                                <input
                                    id="admin-username"
                                    className="p-input"
                                    type="text"
                                    value={username}
                                    onChange={event => setUsername(event.target.value)}
                                    autoComplete="username"
                                    maxLength={64}
                                    required
                                />
                            </div>

                            <div className="p-field">
                                <label className="p-label" htmlFor="admin-password">
                                    <PixelIcon name="gear" size={15} />
                                    Mật khẩu
                                </label>
                                <input
                                    id="admin-password"
                                    className="p-input"
                                    type="password"
                                    value={password}
                                    onChange={event => setPassword(event.target.value)}
                                    autoComplete="current-password"
                                    required
                                />
                            </div>

                            {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}

                            <button
                                type="submit"
                                className="pbtn pbtn--primary pbtn--block pbtn--xl"
                                disabled={loading}
                            >
                                <PixelIcon name={loading ? "clock" : "check"} size={18} />
                                {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </main>
    );
};

export default AdminLoginPage;
