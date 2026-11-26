import React from "react";
import PixelIcon from "../ui/PixelIcon";
import type { AdminSongSummary } from "../../services/adminService";

function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return "—";
    }
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }
    return date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

interface AdminSongRowProps {
    song: AdminSongSummary;
    busy: boolean;
    confirmingArchive: boolean;
    onEdit: (song: AdminSongSummary) => void;
    onRequestArchive: (songId: string) => void;
    onCancelArchive: () => void;
    onConfirmArchive: (song: AdminSongSummary) => void;
    onRestore: (song: AdminSongSummary) => void;
}

const AdminSongRow: React.FC<AdminSongRowProps> = ({
    song,
    busy,
    confirmingArchive,
    onEdit,
    onRequestArchive,
    onCancelArchive,
    onConfirmArchive,
    onRestore,
}) => (
    <tr className={song.status === "ARCHIVED" ? "admin-row--archived" : undefined}>
        <td className="p-tiny pixel-label">{song.id}</td>
        <td className="admin-cell-title">{song.songName}</td>
        <td>
            <span className={`p-chip p-tiny ${song.status === "ACTIVE" ? "p-chip--sage" : ""}`}>
                {song.status === "ACTIVE" ? "Đang phát" : "Lưu trữ"}
            </span>
        </td>
        <td>{formatDuration(song.totalDuration)}</td>
        <td>{song.sampleCount == null ? "—" : song.sampleCount}</td>
        <td className="p-tiny">{formatDate(song.updatedAt)}</td>
        <td>
            {confirmingArchive ? (
                <div className="admin-row-actions">
                    <span className="p-tiny admin-confirm-label">Lưu trữ bài này?</span>
                    <button
                        type="button"
                        className="pbtn pbtn--danger pbtn--sm"
                        onClick={() => onConfirmArchive(song)}
                        disabled={busy}
                    >
                        <PixelIcon name={busy ? "clock" : "check"} size={13} />
                        Có
                    </button>
                    <button
                        type="button"
                        className="pbtn pbtn--sm"
                        onClick={onCancelArchive}
                        disabled={busy}
                    >
                        Huỷ
                    </button>
                </div>
            ) : (
                <div className="admin-row-actions">
                    <button
                        type="button"
                        className="pbtn pbtn--accent pbtn--sm"
                        onClick={() => onEdit(song)}
                        disabled={busy}
                    >
                        <PixelIcon name="edit" size={13} />
                        Sửa
                    </button>
                    {song.status === "ACTIVE" ? (
                        <button
                            type="button"
                            className="pbtn pbtn--sm"
                            onClick={() => onRequestArchive(song.id)}
                            disabled={busy}
                        >
                            <PixelIcon name="close" size={13} />
                            Lưu trữ
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="pbtn pbtn--secondary pbtn--sm"
                            onClick={() => onRestore(song)}
                            disabled={busy}
                        >
                            <PixelIcon name={busy ? "clock" : "refresh"} size={13} />
                            Khôi phục
                        </button>
                    )}
                </div>
            )}
        </td>
    </tr>
);

export default AdminSongRow;
