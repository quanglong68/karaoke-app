import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { roomService } from "../services/roomService";
import type { Room } from "../types/room";
import Toast from "../components/ui/Toast";
import { storage } from "../utils/storage";

type PlayMode = "menu" | "friends" | "public" | null;

export default function LobbyPage() {
    const [roomName, setRoomName] = useState(() => storage.getRoomName());
    const [userName, setUserName] = useState(() => storage.getUserName() || "");
    const [pendingName, setPendingName] = useState(() => storage.getUserName() || "");
    const [joinId, setJoinId] = useState("");
    const [rooms, setRooms] = useState<Room[]>([]);
    const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
    const [showNameGate, setShowNameGate] = useState(() => !storage.getUserName());
    const [playMode, setPlayMode] = useState<PlayMode>(null);
    const navigate = useNavigate();

    const showToast = (type: "success" | "error" | "info", text: string) => {
        setToast({ type, text });
        window.setTimeout(() => setToast(null), 3200);
    };

    useEffect(() => {
        let active = true;
        const fetchRooms = async () => {
            try {
                const data = await roomService.listRooms();
                if (active) setRooms(data);
            } catch (error) {
                console.error("Failed to fetch rooms", error);
                if (active) setRooms([]);
            }
        };
        fetchRooms();
        const intervalId = setInterval(fetchRooms, 4000);
        return () => {
            active = false;
            clearInterval(intervalId);
        };
    }, []);

    const ensureName = () => {
        if (!userName.trim()) {
            setShowNameGate(true);
            return false;
        }
        return true;
    };

    const handleCreate = async () => {
        if (!ensureName()) return;
        if (!roomName.trim()) {
            showToast("error", "Hãy nhập tên phòng.");
            return;
        }
        storage.setRoomName(roomName.trim());
        storage.setUserName(userName.trim());
        try {
            const data = await roomService.createRoom(roomName.trim(), userName.trim());
            storage.setUserId(data.user.userId);
            storage.setRoomName(data.room.roomName);
            storage.setRoomId(data.room.roomId);
            storage.setRoomJoinToken(data.room.roomId);
            navigate(`/room/${data.room.roomId}`);
        } catch (error) {
            console.error("Failed to create room", error);
            showToast("error", "Không thể tạo phòng. Vui lòng thử lại.");
        }
    };

    const handleJoinRoom = async (roomIdToJoin: string) => {
        if (!ensureName()) return;
        if (!roomIdToJoin.trim()) {
            showToast("error", "Vui lòng nhập ID phòng.");
            return;
        }
        storage.setUserName(userName.trim());
        try {
            const data = await roomService.joinRoom(roomIdToJoin.trim(), userName.trim());
            storage.setUserId(data.user.userId);
            storage.setRoomName(data.room.roomName);
            storage.setRoomId(data.room.roomId);
            storage.setRoomJoinToken(data.room.roomId);
            navigate(`/room/${data.room.roomId}`);
        } catch (error) {
            const err = error as { response?: { status?: number; data?: { message?: string } } };
            const status = err.response?.status;
            const reason = err.response?.data?.message;
            if (status === 404) {
                showToast("error", "Không tìm thấy phòng. Vui lòng kiểm tra lại ID.");
                return;
            }
            if (status === 409 && reason === "ROOM_FULL") {
                showToast("error", "Phòng đã đầy (5/5). Vui lòng chọn phòng khác.");
                return;
            }
            if (status === 409 && reason === "ROOM_PLAYING") {
                showToast("error", "Phòng đang chơi, vui lòng chọn phòng khác.");
                return;
            }
            console.error("Failed to join room", error);
            showToast("error", "Không thể tham gia phòng. Vui lòng thử lại.");
        }
    };

    const handleSaveName = () => {
        const trimmed = pendingName.trim();
        if (!trimmed) {
            showToast("error", "Tên không được để trống.");
            return;
        }
        storage.setUserName(trimmed);
        setUserName(trimmed);
        setPendingName(trimmed);
        setShowNameGate(false);
        showToast("success", "Đã lưu tên hiển thị.");
    };

    return (
        <div style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "radial-gradient(circle at top, rgba(72, 219, 251, 0.25), transparent 45%), linear-gradient(135deg, #0d0f1a, #1d2238)",
            color: "#f8f8ff",
            fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
            padding: "40px 20px",
            position: "relative"
        }}>
            <button
                onClick={() => navigate('/admin')}
                style={{
                    position: 'absolute',
                    top: '20px',
                    left: '20px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#fff',
                    padding: '10px 15px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    backdropFilter: 'blur(5px)',
                    fontWeight: 'bold',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s',
                    zIndex: 1000 // Đảm bảo luôn nổi lên trên cùng
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            >
                ⚙️ Quản lý Nhạc
            </button>
            {toast && (
                <Toast
                    message={toast.text}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
            <div style={{
                width: "100%",
                maxWidth: "760px",
                background: "rgba(20, 24, 38, 0.9)",
                borderRadius: "24px",
                padding: "40px",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.08)",
                animation: "lobbyEnter 0.7s ease",
                position: "relative"
            }}>
                <div style={{ position: "absolute", top: "20px", right: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
                    {userName && (
                        <div style={{
                            padding: "6px 14px",
                            borderRadius: "999px",
                            border: "1px solid rgba(143, 163, 255, 0.4)",
                            background: "rgba(143, 163, 255, 0.12)",
                            color: "#d7dcff",
                            fontSize: "14px",
                            fontWeight: 600
                        }}>
                            {userName}
                        </div>
                    )}
                    <button
                        onClick={() => {
                            setPendingName(userName);
                            setShowNameGate(true);
                        }}
                        style={{
                            padding: "6px 12px",
                            borderRadius: "999px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(255,255,255,0.08)",
                            color: "#f8f8ff",
                            fontSize: "13px",
                            fontWeight: 600,
                            cursor: "pointer"
                        }}
                    >
                        Đổi tên
                    </button>
                </div>

                <h1 style={{ marginTop: 0, marginBottom: "8px", fontSize: "42px", letterSpacing: "1px" }}>Karaoke Battle</h1>
                <p style={{ marginTop: 0, marginBottom: "32px", color: "#b8c1ec" }}>
                    Tạo phòng của bạn hoặc chơi cùng mọi người đang online.
                </p>

                <div style={{ display: "grid", gap: "16px", marginBottom: "26px" }}>
                    <input
                        type="text"
                        placeholder="Đặt tên phòng mới"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        style={{
                            padding: "14px 16px",
                            borderRadius: "12px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(255,255,255,0.04)",
                            color: "#fff",
                            fontSize: "16px"
                        }}
                    />
                    <button
                        onClick={handleCreate}
                        style={{
                            padding: "14px 18px",
                            borderRadius: "999px",
                            border: "none",
                            background: "linear-gradient(135deg, #06d6a0, #118ab2)",
                            color: "#001219",
                            fontSize: "16px",
                            fontWeight: 700,
                            cursor: "pointer"
                        }}
                    >
                        Tạo phòng ngay
                    </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                    <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
                    <span style={{ color: "#b8c1ec", fontSize: "13px" }}>HOẶC</span>
                    <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
                </div>

                <button
                    onClick={() => setPlayMode("menu")}
                    style={{
                        width: "100%",
                        padding: "14px 18px",
                        borderRadius: "999px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "linear-gradient(135deg, rgba(143,163,255,0.3), rgba(255,122,89,0.35))",
                        color: "#f8f8ff",
                        fontSize: "16px",
                        fontWeight: 700,
                        cursor: "pointer"
                    }}
                >
                    Chơi với mọi người
                </button>
            </div>

            {(playMode || showNameGate) && (
                <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(5, 8, 20, 0.75)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1500
                }}>
                    <div style={{
                        width: "min(520px, 92vw)",
                        background: "rgba(20, 24, 38, 0.98)",
                        borderRadius: "22px",
                        padding: "26px",
                        border: "1px solid rgba(255,255,255,0.12)",
                        boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
                    }}>
                        {showNameGate && (
                            <>
                                <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px", color: "#f8f8ff" }}>
                                    Nhập tên hiển thị
                                </div>
                                <input
                                    value={pendingName}
                                    onChange={(e) => setPendingName(e.target.value)}
                                    placeholder="Ví dụ: Linh, Nam, ..."
                                    style={{
                                        width: "100%",
                                        padding: "12px 14px",
                                        borderRadius: "12px",
                                        border: "1px solid rgba(255,255,255,0.12)",
                                        background: "rgba(255,255,255,0.05)",
                                        color: "#f8f8ff",
                                        fontSize: "15px",
                                        marginBottom: "16px"
                                    }}
                                />
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                                    {!storage.getUserName() ? null : (
                                        <button
                                            onClick={() => setShowNameGate(false)}
                                            style={{
                                                padding: "8px 16px",
                                                borderRadius: "999px",
                                                border: "1px solid rgba(255,255,255,0.12)",
                                                background: "rgba(255,255,255,0.06)",
                                                color: "#f8f8ff",
                                                cursor: "pointer"
                                            }}
                                        >
                                            Hủy
                                        </button>
                                    )}
                                    <button
                                        onClick={handleSaveName}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: "999px",
                                            border: "none",
                                            background: "linear-gradient(135deg, #06d6a0, #118ab2)",
                                            color: "#001219",
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}
                                    >
                                        Lưu tên
                                    </button>
                                </div>
                            </>
                        )}

                        {!showNameGate && playMode === "menu" && (
                            <>
                                <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px", color: "#f8f8ff" }}>
                                    Chơi với mọi người
                                </div>
                                <div style={{ fontSize: "14px", color: "#b8c1ec", marginBottom: "20px" }}>
                                    Chọn cách bạn muốn tham gia trận karaoke.
                                </div>
                                <div style={{ display: "grid", gap: "12px" }}>
                                    <button
                                        onClick={() => setPlayMode("friends")}
                                        style={{
                                            padding: "12px 16px",
                                            borderRadius: "14px",
                                            border: "1px solid rgba(255,255,255,0.15)",
                                            background: "rgba(255,255,255,0.07)",
                                            color: "#f8f8ff",
                                            fontWeight: 600,
                                            cursor: "pointer"
                                        }}
                                    >
                                        Chơi với bạn bè (nhập ID phòng)
                                    </button>
                                    <button
                                        onClick={() => setPlayMode("public")}
                                        style={{
                                            padding: "12px 16px",
                                            borderRadius: "14px",
                                            border: "1px solid rgba(0,245,212,0.4)",
                                            background: "rgba(0,245,212,0.15)",
                                            color: "#b8fff1",
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}
                                    >
                                        Chơi cùng người khác (xem danh sách phòng)
                                    </button>
                                </div>
                                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "18px" }}>
                                    <button
                                        onClick={() => setPlayMode(null)}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: "999px",
                                            border: "1px solid rgba(255,255,255,0.12)",
                                            background: "rgba(255,255,255,0.06)",
                                            color: "#f8f8ff",
                                            cursor: "pointer"
                                        }}
                                    >
                                        Đóng
                                    </button>
                                </div>
                            </>
                        )}

                        {!showNameGate && playMode === "friends" && (
                            <>
                                <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px", color: "#f8f8ff" }}>
                                    Chơi với bạn bè
                                </div>
                                <input
                                    value={joinId}
                                    onChange={(e) => setJoinId(e.target.value)}
                                    placeholder="Nhập ID phòng"
                                    style={{
                                        width: "100%",
                                        padding: "12px 14px",
                                        borderRadius: "12px",
                                        border: "1px solid rgba(255,255,255,0.12)",
                                        background: "rgba(255,255,255,0.05)",
                                        color: "#f8f8ff",
                                        fontSize: "15px",
                                        marginBottom: "16px"
                                    }}
                                />
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <button
                                        onClick={() => setPlayMode("menu")}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: "999px",
                                            border: "1px solid rgba(255,255,255,0.12)",
                                            background: "rgba(255,255,255,0.06)",
                                            color: "#f8f8ff",
                                            cursor: "pointer"
                                        }}
                                    >
                                        Quay lại
                                    </button>
                                    <button
                                        onClick={() => handleJoinRoom(joinId)}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: "999px",
                                            border: "none",
                                            background: "linear-gradient(135deg, #06d6a0, #118ab2)",
                                            color: "#001219",
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}
                                    >
                                        Tham gia
                                    </button>
                                </div>
                            </>
                        )}

                        {!showNameGate && playMode === "public" && (
                            <>
                                <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px", color: "#f8f8ff" }}>
                                    Phòng đang hoạt động
                                </div>
                                <div style={{ display: "grid", gap: "10px", maxHeight: "320px", overflowY: "auto", marginBottom: "16px" }}>
                                    {rooms.length === 0 && (
                                        <div style={{ padding: "14px 16px", borderRadius: "12px", background: "rgba(255,255,255,0.04)", color: "#9aa4d4" }}>
                                            Chưa có phòng nào. Hãy tạo phòng đầu tiên!
                                        </div>
                                    )}
                                    {rooms.map((room) => {
                                        const playerCount = room.users?.length ?? 0;
                                        return (
                                            <div key={room.roomId} style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                padding: "12px 14px",
                                                borderRadius: "14px",
                                                background: "rgba(255,255,255,0.05)",
                                                border: "1px solid rgba(255,255,255,0.08)"
                                            }}>
                                                <div>
                                                    <div style={{ fontSize: "15px", fontWeight: 600, color: "#f8f8ff" }}>{room.roomName}</div>
                                                    <div style={{ fontSize: "12px", color: "#b8c1ec" }}>ID: {room.roomId} · {playerCount}/5 người</div>
                                                </div>
                                                <button
                                                    onClick={() => handleJoinRoom(room.roomId)}
                                                    style={{
                                                        padding: "8px 14px",
                                                        borderRadius: "999px",
                                                        border: "1px solid rgba(0,245,212,0.4)",
                                                        background: "rgba(0,245,212,0.12)",
                                                        color: "#b8fff1",
                                                        fontWeight: 600,
                                                        cursor: "pointer"
                                                    }}
                                                >
                                                    Tham gia
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <button
                                        onClick={() => setPlayMode("menu")}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: "999px",
                                            border: "1px solid rgba(255,255,255,0.12)",
                                            background: "rgba(255,255,255,0.06)",
                                            color: "#f8f8ff",
                                            cursor: "pointer"
                                        }}
                                    >
                                        Quay lại
                                    </button>
                                    <button
                                        onClick={() => setPlayMode(null)}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: "999px",
                                            border: "1px solid rgba(255,255,255,0.12)",
                                            background: "rgba(255,255,255,0.06)",
                                            color: "#f8f8ff",
                                            cursor: "pointer"
                                        }}
                                    >
                                        Đóng
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <style>
                {`
                @keyframes lobbyEnter {
                    0% { opacity: 0; transform: translateY(18px) scale(0.98); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }
                `}
            </style>
        </div>
    );
}