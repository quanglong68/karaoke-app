import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiErrorCode, getApiErrorMessage, roomService } from "../services/roomService";
import type { RoomSummary } from "../types/room";
import Toast from "../components/ui/Toast";
import PixelIcon from "../components/ui/PixelIcon";
import PixelAvatar from "../components/ui/PixelAvatar";
import Mascot from "../components/ui/Mascot";
import LobbyModal, { type PlayMode } from "../components/lobby/LobbyModal";
import { useToast } from "../hooks/useToast";
import { storage } from "../utils/storage";
import { preloadVideo } from "../utils/videoPreload";

export default function LobbyPage() {
    const [roomName, setRoomName] = useState(() => storage.getRoomName());
    const [userName, setUserName] = useState(() => storage.getUserName() || "");
    const [pendingName, setPendingName] = useState(() => storage.getUserName() || "");
    const [joinId, setJoinId] = useState("");
    const [rooms, setRooms] = useState<RoomSummary[]>([]);
    const { toast, showToast, clearToast } = useToast();
    const [showNameGate, setShowNameGate] = useState(() => !storage.getUserName());
    const [playMode, setPlayMode] = useState<PlayMode>(null);
    const [submitting, setSubmitting] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (playMode !== "public") return;
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
        // Poll only while the public-room list is on screen; an idle lobby tab
        // should not burn the per-IP rate limit.
        const intervalId = setInterval(fetchRooms, 4000);
        return () => {
            active = false;
            clearInterval(intervalId);
        };
    }, [playMode, refreshTick]);

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
                showToast("error", "Phòng đã đầy. Vui lòng chọn phòng khác.");
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

    return (
        <main className="lobby-page">
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
                        onClose={clearToast}
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
                                <span>Chơi theo lượt · hát theo lời · AI chấm điểm</span>
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

            <LobbyModal
                showNameGate={showNameGate}
                hasStoredName={Boolean(storedName)}
                pendingName={pendingName}
                onPendingNameChange={setPendingName}
                onSaveName={handleSaveName}
                onCloseNameGate={() => setShowNameGate(false)}
                playMode={playMode}
                onPlayModeChange={setPlayMode}
                joinId={joinId}
                onJoinIdChange={setJoinId}
                onJoinRoom={handleJoinRoom}
                rooms={rooms}
                submitting={submitting}
                refreshing={refreshing}
                onRefreshRooms={handleRefreshRooms}
            />
        </main>
    );
}
