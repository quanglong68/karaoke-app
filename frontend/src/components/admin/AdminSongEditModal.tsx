import React from "react";
import type { SongStatus } from "../../services/adminService";
import Modal from "../ui/Modal";
import PixelIcon from "../ui/PixelIcon";

export interface SongEditState {
    id: string;
    songName: string;
    lyrics: string;
    status: SongStatus;
}

interface AdminSongEditModalProps {
    editing: SongEditState;
    loading: boolean;
    saving: boolean;
    error: string;
    onChange: (next: SongEditState) => void;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
}

const AdminSongEditModal: React.FC<AdminSongEditModalProps> = ({
    editing,
    loading,
    saving,
    error,
    onChange,
    onClose,
    onSubmit,
}) => (
    <Modal
        title={`Sửa bài hát ${editing.id}`}
        icon="edit"
        onClose={saving ? undefined : onClose}
        actions={(
            <>
                <button
                    type="button"
                    className="pbtn pbtn--sm"
                    onClick={onClose}
                    disabled={saving}
                >
                    Huỷ
                </button>
                <button
                    type="submit"
                    form="admin-song-edit-form"
                    className="pbtn pbtn--primary pbtn--sm"
                    disabled={loading || saving || !editing.songName.trim() || !editing.lyrics.trim()}
                >
                    <PixelIcon name={saving ? "clock" : "check"} size={14} />
                    {saving ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
            </>
        )}
    >
        <form id="admin-song-edit-form" className="admin-form" onSubmit={onSubmit}>
            <div className="p-field">
                <label className="p-label" htmlFor="edit-song-name">
                    <PixelIcon name="note" size={15} />
                    Tên bài hát
                </label>
                <input
                    id="edit-song-name"
                    className="p-input"
                    type="text"
                    maxLength={120}
                    value={editing.songName}
                    onChange={e => onChange({ ...editing, songName: e.target.value })}
                    disabled={loading || saving}
                />
            </div>
            <div className="p-field">
                <label className="p-label" htmlFor="edit-song-lyrics">
                    <PixelIcon name="chat" size={15} />
                    Lời bài hát
                </label>
                <textarea
                    id="edit-song-lyrics"
                    className="p-input admin-modal-lyrics"
                    maxLength={10000}
                    value={editing.lyrics}
                    onChange={e => onChange({ ...editing, lyrics: e.target.value })}
                    placeholder={loading ? "Đang tải lời bài hát..." : "Lời bài hát..."}
                    disabled={loading || saving}
                />
            </div>
            {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
        </form>
    </Modal>
);

export default AdminSongEditModal;
