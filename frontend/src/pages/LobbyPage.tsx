import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiErrorCode, getApiErrorMessage, roomService } from "../services/roomService";
import type { RoomSummary } from "../types/room";
import Toast from "../components/ui/Toast";
import Modal from "../components/ui/Modal";
import PixelIcon from "../components/ui/PixelIcon";
import PixelAvatar from "../components/ui/PixelAvatar";
import Mascot from "../components/ui/Mascot";
import { storage } from "../utils/storage";

const preloadVideo = (videoUrl: string) => {
    if (!videoUrl) return;

    try {
        let existing = document.getElementById("preload-video") as HTMLVideoElement | null;
        if (!existing) {
            existing = document.createElement("video");
            existing.id = "preload-video";
            existing.preload = "auto";
            existing.muted = true;
            existing.playsInline = true;
            existing.style.display = "none";
            document.body.appendChild(existing);
        }

        existing.pause();
        existing.removeAttribute("src");
        existing.load();
        existing.src = videoUrl;
        existing.load();
    } catch (error) {
        console.warn("Failed to preload first video from lobby:", error);
    }
};

type PlayMode = "menu" | "friends" | "public" | null;

export default function LobbyPage() {
    const [roomName, setRoomName] = useState(() => storage.getRoomName());
    const [userName, setUserName] = useState(() => storage.getUserName() || "");
    const [pendingName, setPendingName] = useState(() => storage.getUserName() || "");
    const [joinId, setJoinId] = useState("");
    const [rooms, setRooms] = useState<RoomSummary[]>([]);
    const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
    const [showNameGate, setShowNameGate] = useState(() => !storage.getUserName());
    const [playMode, setPlayMode] = useState<PlayMode>(null);
    const [submitting, setSubmitting] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const toastTimerRef = useRef<number | null>(null);
    const navigate = useNavigate();

    const showToast = (type: "success" | "error" | "info", text: string) => {
        if (toastTimerRef.current !== null) {
            window.clearTimeout(toastTimerRef.current);
        }
        setToast({ type, text });
        toastTimerRef.current = window.setTimeout(() => {
            setToast(null);
            toastTimerRef.current = null;
        }, 3200);
    };

    useEffect(() => () => {
        if (toastTimerRef.current !== null) {
            window.clearTimeout(toastTimerRef.current);
        }
    }, []);

    useEffect(() => {
        let active = true;
        const fetchRooms = async () => {
            try {
                const data = await roomService.listRooms();
                if (active) setRooms(data);
            } catch (error) {
                console.error("Failed to fetch rooms", error);
                if (active) setRooms([]);
            } finally {
                if (active) setRefreshing(false);
            }
        };
        fetchRooms();
        const intervalId = setInterval(fetchRooms, 4000);
        return () => {
            active = false;
            clearInterval(intervalId);
        };
    }, [refreshTick]);

    const handleRefreshRooms = () => {
        setRefreshing(true);
        setRefreshTick(tick => tick + 1);
    };

    const ensureName = () => {
        if (!userName.trim()) {
            setShowNameGate(true);
            return false;
        }
        return true;
    };

    const handleCreate = async () => {
        if (submitting || !ensureName()) return;
        if (!roomName.trim()) {
            showToast("error", "Hãy nhập tên phòng.");
            return;
        }
        storage.setRoomName(roomName.trim());
        storage.setUserName(userName.trim());
        setSubmitting(true);
        try {
            const data = await roomService.createRoom(roomName.trim(), userName.trim());
            storage.setUserId(data.user.userId);
            storage.setRoomName(data.room.roomName);
            storage.setRoomId(data.room.roomId);
            storage.setSessionToken(data.sessionToken);
            if (data.room.upcomingVideoUrl) {
                preloadVideo(data.room.upcomingVideoUrl);
            }
            navigate(`/room/${data.room.roomId}`);
        } catch (error) {
            console.error("Failed to create room", error);
            showToast("error", getApiErrorMessage(error, "Không thể tạo phòng. Vui lòng thử lại."));
        } finally {
            setSubmitting(false);
        }
    };

    const handleJoinRoom = async (roomIdToJoin: string) => {
        if (submitting || !ensureName()) return;
        const targetRoomId = roomIdToJoin.trim();
        if (!targetRoomId) {
            showToast("error", "Vui lòng nhập ID phòng.");
            return;
        }
        storage.setUserName(userName.trim());
        setSubmitting(true);
        try {
            const data = await roomService.joinRoom(targetRoomId, userName.trim());
            storage.setUserId(data.user.userId);
            storage.setRoomName(data.room.roomName);
            storage.setRoomId(data.room.roomId);
            storage.setSessionToken(data.sessionToken);
            if (data.room.upcomingVideoUrl) {
                preloadVideo(data.room.upcomingVideoUrl);
            }
            navigate(`/room/${data.room.roomId}`);
        } catch (error) {
            const code = getApiErrorCode(error);
            if (code === "ROOM_NOT_FOUND") {
                showToast("error", "Không tìm thấy phòng. Vui lòng kiểm tra lại ID.");
                return;
            }
            if (code === "ROOM_FULL") {
                showToast("error", "Phòng đã đầy (5/5). Vui lòng chọn phòng khác.");
                return;
            }
            if (code === "ROOM_PLAYING") {
                showToast("error", "Phòng đang chơi, vui lòng chọn phòng khác.");
                return;
            }
            if (code === "RATE_LIMITED") {
                showToast("error", "Bạn thao tác quá nhanh, vui lòng thử lại sau.");
                return;
            }
            console.error("Failed to join room", error);
            showToast("error", getApiErrorMessage(error, "Không thể tham gia phòng. Vui lòng thử lại."));
        } finally {
            setSubmitting(false);
        }
    };

    const handleSaveName = () => {
        const trimmed = pendingName.trim();
        if (!trimmed) {
            showToast("error", "Tên không được để trống.");
            return;
        }
        if (trimmed.length > 24) {
            showToast("error", "Tên tối đa 24 ký tự.");
            return;
        }
        storage.setUserName(trimmed);
        setUserName(trimmed);
        setPendingName(trimmed);
        setShowNameGate(false);
        showToast("success", "Đã lưu tên hiển thị.");
    };

    const storedName = storage.getUserName();
    const avatarSeed = storage.getUserId() || userName || "meo-sanh";
    const modalOpen = showNameGate || playMode !== null;
    const closeModal = showNameGate && !storedName
        ? undefined
        : () => {
            if (showNameGate) {
                setShowNameGate(false);
                return;
            }
            setPlayMode(null);
        };

    const modalTitle = showNameGate
        ? "Nhập tên hiển thị"
        : playMode === "friends"
            ? "Chơi với bạn bè"
            : playMode === "public"
                ? "Phòng đang hoạt động"
                : "Chơi với mọi người";

    const modalActions = showNameGate ? (
        <>
            {storedName && (
                <button type="button" className="pbtn" onClick={() => setShowNameGate(false)}>
                    Hủy
                </button>
            )}
            <button type="button" className="pbtn pbtn--primary" onClick={handleSaveName}>
                <PixelIcon name="check" size={16} />
                Lưu tên
            </button>
        </>
    ) : playMode === "friends" ? (
        <>
            <button type="button" className="pbtn" onClick={() => setPlayMode("menu")}>
                <PixelIcon name="arrowLeft" size={16} />
                Quay lại
            </button>
            <button
                type="button"
                className="pbtn pbtn--primary"
                onClick={() => handleJoinRoom(joinId)}
                disabled={submitting}
            >
                <PixelIcon name="door" size={16} />
                {submitting ? "Đang vào..." : "Tham gia"}
            </button>
        </>
    ) : playMode === "public" ? (
        <>
            <button type="button" className="pbtn" onClick={handleRefreshRooms} disabled={refreshing}>
                <PixelIcon name="refresh" size={16} />
                {refreshing ? "Đang tải..." : "Làm mới"}
            </button>
            <button type="button" className="pbtn" onClick={() => setPlayMode("menu")}>
                <PixelIcon name="arrowLeft" size={16} />
                Quay lại
            </button>
            <button type="button" className="pbtn pbtn--primary" onClick={() => setPlayMode(null)}>
                Đóng
            </button>
        </>
    ) : (
        <button type="button" className="pbtn" onClick={() => setPlayMode(null)}>
            Đóng
        </button>
    );

    return (
        <div className="lobby-page">
            <div className="lobby-stack">
                <button
                    type="button"
                    className="pbtn pbtn--sm lobby-admin-btn"
                    onClick={() => navigate("/admin")}
                >
                    <PixelIcon name="gear" size={16} />
                    Quản lý nhạc
                </button>

                {toast && (
                    <Toast
                        message={toast.text}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                )}

                <section className="lobby-card" aria-label="Sảnh chờ Karaoke Battle">
                <div className="p-window-bar">
                    <span className="p-window-dots" aria-hidden="true">
                        <i /><i /><i />
                    </span>
                    <span className="p-window-title pixel-label">karaoke-battle.exe</span>
                    <span className="p-window-title pixel-label">cozy edition</span>
                </div>

                <div className="lobby-marquee" aria-hidden="true">
                    <div className="lobby-marquee-track">
                        <span className="lobby-marquee-group">
                            <span className="lobby-marquee-dot" />
                            <span>Đêm nhạc thơ mộng · hát cùng bạn bè · giọng ca của bạn là ánh đèn sân khấu</span>
                            <span className="lobby-marquee-dot" />
                        </span>
                        <span className="lobby-marquee-group">
                            <span className="lobby-marquee-dot" />
                            <span>Đêm nhạc thơ mộng · hát cùng bạn bè · giọng ca của bạn là ánh đèn sân khấu</span>
                            <span className="lobby-marquee-dot" />
                        </span>
                    </div>
                </div>

                <div className="lobby-card-body">
                    <div className="lobby-topline">
                        <div>
                            <div className="lobby-title-row">
                                <h1 className="lobby-title">Karaoke Battle</h1>
                                <Mascot size={38} headOnly pokeable={false} className="lobby-title-mascot" />
                            </div>
                            <p className="lobby-subtitle">
                                Một góc nhỏ ấm áp để hát, nghe và cổ vũ nhau. Mở phòng mới hoặc ghé vào
                                phòng đang mở — chọn bài thật chill nhé.
                            </p>
                        </div>
                        <div className="lobby-name-zone">
                            {userName && (
                                <span className="p-chip p-chip--sage">
                                    <PixelAvatar seed={avatarSeed} size={20} />
                                    {userName}
                                </span>
                            )}
                            <button
                                type="button"
                                className="pbtn pbtn--sm"
                                onClick={() => {
                                    setPendingName(userName);
                                    setShowNameGate(true);
                                }}
                            >
                                <PixelIcon name="edit" size={14} />
                                Đổi tên
                            </button>
                        </div>
                    </div>

                    <div className="lobby-hero">
                        <div className="lobby-form">
                            <label className="p-label" htmlFor="lobby-room-name">
                                <PixelIcon name="home" size={16} />
                                Tên phòng mới
                            </label>
                            <div className="lobby-create-row">
                                <input
                                    id="lobby-room-name"
                                    className="p-input"
                                    type="text"
                                    placeholder="Ví dụ: Đêm nhạc mưa bay"
                                    value={roomName}
                                    maxLength={32}
                                    onChange={(e) => setRoomName(e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="pbtn pbtn--primary"
                                    onClick={handleCreate}
                                    disabled={submitting}
                                >
                                    <PixelIcon name="sparkles" size={16} />
                                    {submitting ? "Đang mở phòng..." : "Tạo phòng"}
                                </button>
                            </div>

                            <div className="p-divider">hoặc</div>

                            <button
                                type="button"
                                className="pbtn pbtn--secondary pbtn--block"
                                onClick={() => setPlayMode("menu")}
                            >
                                <PixelIcon name="users" size={18} />
                                Chơi với mọi người
                            </button>

                            <div className="lobby-scene-note">
                                <PixelIcon name="sparkles" size={14} />
                                <span>Phòng tối đa 5 người · hát theo lời · AI chấm điểm</span>
                            </div>
                        </div>

                        <div className="lobby-mascot" aria-hidden="true">
                            <span className="lobby-mascot-art">
                                <Mascot size={116} pokeable={false} />
                            </span>
                            <span className="lobby-mascot-caption">Miu giữ mic</span>
                        </div>
                    </div>
                </div>
                </section>
            </div>

            {modalOpen && (
                <Modal
                    title={modalTitle}
                    icon={showNameGate ? "edit" : playMode === "friends" ? "users" : playMode === "public" ? "door" : "sparkles"}
                    onClose={closeModal}
                    actions={modalActions}
                >
                    {showNameGate && (
                        <>
                            <p className="p-muted">
                                Tên này sẽ hiện trên bảng xếp hạng và trong khung chat. Tối đa 24 ký tự.
                            </p>
                            <div className="p-field">
                                <label className="p-label" htmlFor="lobby-display-name">
                                    <PixelIcon name="heart" size={15} />
                                    Tên hiển thị
                                </label>
                                <input
                                    id="lobby-display-name"
                                    className="p-input"
                                    value={pendingName}
                                    maxLength={24}
                                    onChange={(e) => setPendingName(e.target.value)}
                                    placeholder="Ví dụ: Linh, Nam..."
                                    autoFocus
                                />
                            </div>
                        </>
                    )}

                    {!showNameGate && playMode === "menu" && (
                        <div style={{ display: "grid", gap: 10 }}>
                            <button type="button" className="lobby-menu-option" onClick={() => setPlayMode("friends")}>
                                <span className="lobby-menu-icon">
                                    <PixelIcon name="users" size={22} />
                                </span>
                                <span className="lobby-menu-text">
                                    <strong>Chơi với bạn bè</strong>
                                    <span>Nhập ID phòng mà bạn bè vừa gửi.</span>
                                </span>
                            </button>
                            <button type="button" className="lobby-menu-option" onClick={() => setPlayMode("public")}>
                                <span className="lobby-menu-icon">
                                    <PixelIcon name="door" size={22} />
                                </span>
                                <span className="lobby-menu-text">
                                    <strong>Xem phòng đang mở</strong>
                                    <span>Chọn một phòng công khai và tham gia ngay.</span>
                                </span>
                            </button>
                        </div>
                    )}

                    {!showNameGate && playMode === "friends" && (
                        <>
                            <p className="p-muted">
                                Nhờ chủ phòng gửi ID phòng, sau đó dán vào ô bên dưới.
                            </p>
                            <div className="p-field">
                                <label className="p-label" htmlFor="lobby-join-id">
                                    <PixelIcon name="door" size={15} />
                                    ID phòng
                                </label>
                                <input
                                    id="lobby-join-id"
                                    className="p-input"
                                    value={joinId}
                                    maxLength={12}
                                    onChange={(e) => setJoinId(e.target.value)}
                                    placeholder="Ví dụ: A1B2C3"
                                    autoFocus
                                />
                            </div>
                        </>
                    )}

                    {!showNameGate && playMode === "public" && (
                        <>
                            <div className="lobby-room-list">
                                {rooms.length === 0 && (
                                    <div className="lobby-empty">
                                        <Mascot size={56} className="lobby-empty-mascot" />
                                        <p style={{ marginTop: 6 }}>Chưa có phòng nào. Hãy tạo phòng đầu tiên!</p>
                                    </div>
                                )}
                                {rooms.map((room) => {
                                    const joinable = room.gameState === "LOBBY"
                                        && room.playerCount < room.maxPlayers;
                                    const stateLabel = room.gameState !== "LOBBY"
                                        ? "Đang chơi"
                                        : room.playerCount >= room.maxPlayers
                                            ? "Đã đầy"
                                            : "Có thể vào";
                                    return (
                                        <div key={room.roomId} className="lobby-room">
                                            <div>
                                                <div className="lobby-room-name">{room.roomName}</div>
                                                <div className="lobby-room-meta">
                                                    <span className="p-chip">
                                                        <PixelIcon name="home" size={12} />
                                                        {room.roomId}
                                                    </span>
                                                    <span className="p-chip p-chip--sage">
                                                        <PixelIcon name="users" size={12} />
                                                        {room.playerCount}/{room.maxPlayers}
                                                    </span>
                                                    <span className={`p-chip ${joinable ? "p-chip--mustard" : ""}`}>
                                                        {stateLabel}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="pbtn pbtn--sm pbtn--primary"
                                                onClick={() => handleJoinRoom(room.roomId)}
                                                disabled={!joinable || submitting}
                                            >
                                                {joinable ? "Tham gia" : "Không thể vào"}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </Modal>
            )}
        </div>
    );
}
