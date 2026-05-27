import type { User } from "../../types/user";

interface LobbyPanelProps {
    playerList: User[];
    isHost: boolean;
    onKick: (userId: string) => void;
}

export default function LobbyPanel({ playerList, isHost, onKick }: LobbyPanelProps) {
    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "30px", background: "var(--game-panel-strong)", overflowY: "auto" }}>
            <h2 style={{ color: "#ffd166", textAlign: "center", fontSize: "32px", marginBottom: "30px" }}>SẢNH CHỜ KHỞI ĐỘNG</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "20px" }}>
                {playerList.map(user => (
                    <div key={user.userId} style={{
                        backgroundColor: "rgba(16, 22, 40, 0.9)",
                        padding: "15px",
                        borderRadius: "15px",
                        border: user.isHost ? "2px solid #ffd166" : (user.isReady ? "2px solid #00f5d4" : "2px solid rgba(255,255,255,0.12)"),
                        position: "relative",
                        textAlign: "center"
                    }}>
                        <div style={{ fontSize: "40px", marginBottom: "10px" }}>{user.isHost ? "👑" : "👤"}</div>
                        <div style={{ fontSize: "18px", fontWeight: "bold", color: "white", marginBottom: "10px" }}>{user.userName}</div>

                        {user.isHost ? (
                            <span style={{ color: "#ffd166", fontWeight: 700 }}>Chủ phòng</span>
                        ) : (
                            <span style={{ color: user.isReady ? "#00f5d4" : "#a4b0be", fontWeight: 600 }}>
                                {user.isReady ? " ✅ Đã sẵn sàng" : "⏳ Đang chờ..."}
                            </span>
                        )}

                        {isHost && !user.isHost && (
                            <button
                                onClick={() => onKick(user.userId)}
                                style={{
                                    position: "absolute",
                                    top: "-6px",
                                    right: "-6px",
                                    width: "30px",
                                    height: "30px",
                                    borderRadius: "50%",
                                    backgroundColor: "#ff7a59",
                                    color: "white",
                                    border: "none",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    boxShadow: "0 2px 5px rgba(0,0,0,0.5)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    lineHeight: 1
                                }}
                            >X</button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
