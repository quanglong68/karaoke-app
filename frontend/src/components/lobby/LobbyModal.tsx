import type { RoomSummary } from "../../types/room";
import Mascot from "../ui/Mascot";
import Modal from "../ui/Modal";
import PixelIcon from "../ui/PixelIcon";

export type PlayMode = "menu" | "friends" | "public" | null;

interface LobbyModalProps {
    showNameGate: boolean;
    hasStoredName: boolean;
    pendingName: string;
    onPendingNameChange: (value: string) => void;
    onSaveName: () => void;
    onCloseNameGate: () => void;
    playMode: PlayMode;
    onPlayModeChange: (mode: PlayMode) => void;
    joinId: string;
    onJoinIdChange: (value: string) => void;
    onJoinRoom: (roomId: string) => void;
    rooms: RoomSummary[];
    submitting: boolean;
    refreshing: boolean;
    onRefreshRooms: () => void;
}

export default function LobbyModal({
    showNameGate,
    hasStoredName,
    pendingName,
    onPendingNameChange,
    onSaveName,
    onCloseNameGate,
    playMode,
    onPlayModeChange,
    joinId,
    onJoinIdChange,
    onJoinRoom,
    rooms,
    submitting,
    refreshing,
    onRefreshRooms,
}: LobbyModalProps) {
    if (!showNameGate && playMode === null) {
        return null;
    }

    const onClose = showNameGate && !hasStoredName
        ? undefined
        : () => {
            if (showNameGate) {
                onCloseNameGate();
            } else {
                onPlayModeChange(null);
            }
        };

    if (showNameGate) {
        return (
            <Modal
                title="Nhập tên hiển thị"
                icon="edit"
                onClose={onClose}
                actions={(
                    <>
                        {hasStoredName && (
                            <button type="button" className="pbtn" onClick={onCloseNameGate}>
                                Hủy
                            </button>
                        )}
                        <button type="button" className="pbtn pbtn--primary" onClick={onSaveName}>
                            <PixelIcon name="check" size={16} />
                            Lưu tên
                        </button>
                    </>
                )}
            >
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
                        onChange={(e) => onPendingNameChange(e.target.value)}
                        placeholder="Ví dụ: Linh, Nam..."
                        autoFocus
                    />
                </div>
            </Modal>
        );
    }

    if (playMode === "friends") {
        return (
            <Modal
                title="Chơi với bạn bè"
                icon="users"
                onClose={onClose}
                actions={(
                    <>
                        <button type="button" className="pbtn" onClick={() => onPlayModeChange("menu")}>
                            <PixelIcon name="arrowLeft" size={16} />
                            Quay lại
                        </button>
                        <button
                            type="button"
                            className="pbtn pbtn--primary"
                            onClick={() => onJoinRoom(joinId)}
                            disabled={submitting}
                        >
                            <PixelIcon name="door" size={16} />
                            {submitting ? "Đang vào..." : "Tham gia"}
                        </button>
                    </>
                )}
            >
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
                        onChange={(e) => onJoinIdChange(e.target.value)}
                        placeholder="Ví dụ: A1B2C3"
                        autoFocus
                    />
                </div>
            </Modal>
        );
    }

    if (playMode === "public") {
        return (
            <Modal
                title="Phòng đang hoạt động"
                icon="door"
                onClose={onClose}
                actions={(
                    <>
                        <button type="button" className="pbtn" onClick={onRefreshRooms} disabled={refreshing}>
                            <PixelIcon name="refresh" size={16} />
                            {refreshing ? "Đang tải..." : "Làm mới"}
                        </button>
                        <button type="button" className="pbtn" onClick={() => onPlayModeChange("menu")}>
                            <PixelIcon name="arrowLeft" size={16} />
                            Quay lại
                        </button>
                        <button type="button" className="pbtn pbtn--primary" onClick={() => onPlayModeChange(null)}>
                            Đóng
                        </button>
                    </>
                )}
            >
                <div className="lobby-room-list">
                    {rooms.length === 0 && (
                        <div className="lobby-empty">
                            <Mascot size={56} className="lobby-empty-mascot" />
                            <p style={{ marginTop: 6 }}>Chưa có phòng nào. Hãy tạo phòng đầu tiên!</p>
                        </div>
                    )}
                    {rooms.map((room) => {
                        const joinable = room.gameState === "LOBBY" && room.playerCount < room.maxPlayers;
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
                                    onClick={() => onJoinRoom(room.roomId)}
                                    disabled={!joinable || submitting}
                                >
                                    {joinable ? "Tham gia" : "Không thể vào"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </Modal>
        );
    }

    return (
        <Modal
            title="Chơi với mọi người"
            icon="sparkles"
            onClose={onClose}
            actions={(
                <button type="button" className="pbtn" onClick={() => onPlayModeChange(null)}>
                    Đóng
                </button>
            )}
        >
            <div style={{ display: "grid", gap: 10 }}>
                <button type="button" className="lobby-menu-option" onClick={() => onPlayModeChange("friends")}>
                    <span className="lobby-menu-icon">
                        <PixelIcon name="users" size={22} />
                    </span>
                    <span className="lobby-menu-text">
                        <strong>Chơi với bạn bè</strong>
                        <span>Nhập ID phòng mà bạn bè vừa gửi.</span>
                    </span>
                </button>
                <button type="button" className="lobby-menu-option" onClick={() => onPlayModeChange("public")}>
                    <span className="lobby-menu-icon">
                        <PixelIcon name="door" size={22} />
                    </span>
                    <span className="lobby-menu-text">
                        <strong>Xem phòng đang mở</strong>
                        <span>Chọn một phòng công khai và tham gia ngay.</span>
                    </span>
                </button>
            </div>
        </Modal>
    );
}
