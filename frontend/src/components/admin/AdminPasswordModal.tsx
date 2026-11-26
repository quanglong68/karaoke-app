import React, { useState } from "react";
import Modal from "../ui/Modal";
import PixelIcon from "../ui/PixelIcon";
import { adminService, getAdminErrorMessage, isUnauthorized } from "../../services/adminService";

const MIN_PASSWORD_LENGTH = 12;

interface AdminPasswordModalProps {
    onClose: () => void;
    onUnauthorized: () => void;
}

const AdminPasswordModal: React.FC<AdminPasswordModalProps> = ({ onClose, onUnauthorized }) => {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (!currentPassword || !newPassword || !confirmPassword) {
            setError("Vui lòng điền đầy đủ mật khẩu hiện tại và mật khẩu mới.");
            return;
        }
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            setError(`Mật khẩu mới phải từ ${MIN_PASSWORD_LENGTH} ký tự trở lên.`);
            return;
        }
        if (newPassword === currentPassword) {
            setError("Mật khẩu mới phải khác mật khẩu hiện tại.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("Xác nhận mật khẩu mới không khớp.");
            return;
        }

        setSaving(true);
        try {
            await adminService.changePassword(currentPassword, newPassword);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setSuccess("Đã cập nhật mật khẩu và thu hồi các phiên đăng nhập khác.");
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không thể đổi mật khẩu. Vui lòng thử lại."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title="Đổi mật khẩu quản trị"
            icon="gear"
            onClose={saving ? undefined : onClose}
            actions={(
                <>
                    <button
                        type="button"
                        className="pbtn pbtn--sm"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Đóng
                    </button>
                    <button
                        type="submit"
                        form="admin-change-password-form"
                        className="pbtn pbtn--primary pbtn--sm"
                        disabled={saving}
                    >
                        <PixelIcon name={saving ? "clock" : "check"} size={14} />
                        {saving ? "Đang lưu..." : "Cập nhật mật khẩu"}
                    </button>
                </>
            )}
        >
            <form id="admin-change-password-form" className="admin-form" onSubmit={handleSubmit}>
                <p className="p-muted p-tiny">
                    Mật khẩu mới tối thiểu 12 ký tự. Mọi phiên quản trị trên trình duyệt khác sẽ bị đăng xuất ngay.
                </p>
                <div className="p-field">
                    <label className="p-label" htmlFor="admin-current-password">
                        Mật khẩu hiện tại
                    </label>
                    <input
                        id="admin-current-password"
                        className="p-input"
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        disabled={saving}
                        required
                    />
                </div>
                <div className="p-field">
                    <label className="p-label" htmlFor="admin-new-password">
                        Mật khẩu mới
                    </label>
                    <input
                        id="admin-new-password"
                        className="p-input"
                        type="password"
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        disabled={saving}
                        required
                    />
                </div>
                <div className="p-field">
                    <label className="p-label" htmlFor="admin-confirm-password">
                        Nhập lại mật khẩu mới
                    </label>
                    <input
                        id="admin-confirm-password"
                        className="p-input"
                        type="password"
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        disabled={saving}
                        required
                    />
                </div>
                {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
                {success && <div className="admin-alert admin-alert--success" role="status">{success}</div>}
            </form>
        </Modal>
    );
};

export default AdminPasswordModal;
