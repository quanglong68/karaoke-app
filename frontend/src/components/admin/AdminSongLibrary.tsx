import React, { useEffect, useRef, useState } from "react";
import PixelIcon from "../ui/PixelIcon";
import AdminSongEditModal, { type SongEditState } from "./AdminSongEditModal";
import AdminSongRow from "./AdminSongRow";
import {
    adminService,
    getAdminErrorMessage,
    isUnauthorized,
    type AdminSongPage,
    type AdminSongSummary,
    type SongStatus,
} from "../../services/adminService";

const PAGE_SIZE = 10;

type StatusFilter = "ALL" | SongStatus;

interface AdminSongLibraryProps {
    onUnauthorized: () => void;
}

const AdminSongLibrary: React.FC<AdminSongLibraryProps> = ({ onUnauthorized }) => {
    const [searchInput, setSearchInput] = useState("");
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
    const [page, setPage] = useState(0);
    const [reloadKey, setReloadKey] = useState(0);

    const [data, setData] = useState<AdminSongPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

    const [editing, setEditing] = useState<SongEditState | null>(null);
    const [loadingEdit, setLoadingEdit] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState("");
    const editorRequestRef = useRef(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        adminService.listSongs({
            status: statusFilter === "ALL" ? undefined : statusFilter,
            q: query,
            page,
            size: PAGE_SIZE,
        })
            .then(result => {
                if (!cancelled) setData(result);
            })
            .catch(loadError => {
                if (cancelled) return;
                if (isUnauthorized(loadError)) {
                    onUnauthorized();
                    return;
                }
                setError(getAdminErrorMessage(loadError, "Không tải được danh sách bài hát."));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [query, statusFilter, page, reloadKey, onUnauthorized]);

    const reloadAfterRemoval = () => {
        if (data && data.items.length === 1 && page > 0) {
            setPage(page - 1);
        } else {
            setReloadKey(key => key + 1);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setConfirmArchiveId(null);
        setPage(0);
        setQuery(searchInput.trim());
    };

    const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setConfirmArchiveId(null);
        setStatusFilter(e.target.value as StatusFilter);
        setPage(0);
    };

    const handleArchive = async (song: AdminSongSummary) => {
        setBusyId(song.id);
        setError("");
        try {
            await adminService.archiveSong(song.id);
            setNotice(`Đã lưu trữ "${song.songName}". Bài hát sẽ không xuất hiện trong lượt chơi mới.`);
            setConfirmArchiveId(null);
            reloadAfterRemoval();
        } catch (archiveError) {
            if (isUnauthorized(archiveError)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(archiveError, "Không thể lưu trữ bài hát."));
        } finally {
            setBusyId(null);
        }
    };

    const handleRestore = async (song: AdminSongSummary) => {
        setBusyId(song.id);
        setError("");
        try {
            await adminService.updateSong(song.id, { status: "ACTIVE" });
            setNotice(`Đã khôi phục "${song.songName}" vào danh sách phát.`);
            setReloadKey(key => key + 1);
        } catch (restoreError) {
            if (isUnauthorized(restoreError)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(restoreError, "Không thể khôi phục bài hát."));
        } finally {
            setBusyId(null);
        }
    };

    const openEditor = async (song: AdminSongSummary) => {
        // Guard against stale responses if admin opens another song while loading.
        const requestId = editorRequestRef.current + 1;
        editorRequestRef.current = requestId;
        setConfirmArchiveId(null);
        setNotice("");
        setEditError("");
        setLoadingEdit(true);
        setEditing({ id: song.id, songName: song.songName, lyrics: "", status: song.status });
        try {
            const detail = await adminService.getSong(song.id);
            if (editorRequestRef.current !== requestId) return;
            setEditing({ id: detail.id, songName: detail.songName, lyrics: detail.lyrics, status: detail.status });
        } catch (loadError) {
            if (editorRequestRef.current !== requestId) return;
            if (isUnauthorized(loadError)) {
                onUnauthorized();
                return;
            }
            setEditError(getAdminErrorMessage(loadError, "Không tải được nội dung bài hát."));
        } finally {
            if (editorRequestRef.current === requestId) {
                setLoadingEdit(false);
            }
        }
    };

    const closeEditor = () => {
        if (savingEdit) return;
        editorRequestRef.current += 1;
        setEditing(null);
        setEditError("");
    };

    const saveEditor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        const trimmedName = editing.songName.trim();
        const trimmedLyrics = editing.lyrics.trim();
        if (!trimmedName || !trimmedLyrics) {
            setEditError("Tên bài và lời bài không được để trống.");
            return;
        }
        setSavingEdit(true);
        setEditError("");
        try {
            await adminService.updateSong(editing.id, {
                songName: trimmedName,
                lyrics: trimmedLyrics,
            });
            setNotice(`Đã cập nhật "${trimmedName}". Lời mới áp dụng cho lượt chơi tiếp theo.`);
            setEditing(null);
            setReloadKey(key => key + 1);
        } catch (saveError) {
            if (isUnauthorized(saveError)) {
                onUnauthorized();
                return;
            }
            setEditError(getAdminErrorMessage(saveError, "Không thể cập nhật bài hát."));
        } finally {
            setSavingEdit(false);
        }
    };

    const totalPages = data ? Math.max(data.totalPages, 1) : 1;
    const items = data?.items ?? [];

    return (
        <>
            <div className="admin-toolbar">
                <form className="admin-search" onSubmit={handleSearch} role="search">
                    <input
                        className="p-input"
                        type="search"
                        value={searchInput}
                        maxLength={100}
                        onChange={e => setSearchInput(e.target.value)}
                        placeholder="Tìm theo tên bài..."
                        aria-label="Tìm bài hát theo tên"
                    />
                    <button type="submit" className="pbtn pbtn--secondary pbtn--sm">
                        <PixelIcon name="star" size={14} />
                        Tìm
                    </button>
                </form>
                <label className="admin-filter">
                    <span className="pixel-label">Trạng thái</span>
                    <select className="p-input" value={statusFilter} onChange={handleStatusChange}>
                        <option value="ALL">Tất cả</option>
                        <option value="ACTIVE">Đang phát</option>
                        <option value="ARCHIVED">Đã lưu trữ</option>
                    </select>
                </label>
                <button
                    type="button"
                    className="pbtn pbtn--sm"
                    onClick={() => setReloadKey(key => key + 1)}
                    disabled={loading}
                >
                    <PixelIcon name="refresh" size={14} />
                    Làm mới
                </button>
            </div>

            {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}
            {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th scope="col">ID</th>
                            <th scope="col">Tên bài</th>
                            <th scope="col">Trạng thái</th>
                            <th scope="col">Thời lượng</th>
                            <th scope="col">Mẫu pitch</th>
                            <th scope="col">Cập nhật</th>
                            <th scope="col">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && items.length === 0 && (
                            <tr>
                                <td colSpan={7} className="admin-table-empty">
                                    <PixelIcon name="clock" size={16} />
                                    Đang tải danh sách bài hát...
                                </td>
                            </tr>
                        )}
                        {!loading && items.length === 0 && (
                            <tr>
                                <td colSpan={7} className="admin-table-empty">
                                    <PixelIcon name="music" size={16} />
                                    {query || statusFilter !== "ALL"
                                        ? "Không có bài hát nào khớp bộ lọc."
                                        : "Thư viện đang trống. Hãy thêm bài hát ở tab bên cạnh."}
                                </td>
                            </tr>
                        )}
                        {items.map(song => (
                            <AdminSongRow
                                key={song.id}
                                song={song}
                                busy={busyId === song.id}
                                confirmingArchive={confirmArchiveId === song.id}
                                onEdit={openEditor}
                                onRequestArchive={setConfirmArchiveId}
                                onCancelArchive={() => setConfirmArchiveId(null)}
                                onConfirmArchive={handleArchive}
                                onRestore={handleRestore}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="admin-pager">
                <span className="p-tiny p-muted">
                    Trang {page + 1}/{totalPages} · {data?.total ?? 0} bài hát
                </span>
                <div className="admin-pager-actions">
                    <button
                        type="button"
                        className="pbtn pbtn--sm"
                        onClick={() => {
                            setConfirmArchiveId(null);
                            setPage(current => Math.max(0, current - 1));
                        }}
                        disabled={page === 0 || loading}
                    >
                        <PixelIcon name="arrowLeft" size={13} />
                        Trước
                    </button>
                    <button
                        type="button"
                        className="pbtn pbtn--sm"
                        onClick={() => {
                            setConfirmArchiveId(null);
                            setPage(current => current + 1);
                        }}
                        disabled={loading || page + 1 >= totalPages}
                    >
                        Sau
                        <PixelIcon name="arrowLeft" size={13} className="admin-icon-flip" />
                    </button>
                </div>
            </div>

            {editing && (
                <AdminSongEditModal
                    editing={editing}
                    loading={loadingEdit}
                    saving={savingEdit}
                    error={editError}
                    onChange={setEditing}
                    onClose={closeEditor}
                    onSubmit={saveEditor}
                />
            )}
        </>
    );
};

export default AdminSongLibrary;
