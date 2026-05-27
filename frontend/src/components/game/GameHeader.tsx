import type { ReactNode } from "react";

interface GameHeaderProps {
    myScore: number;
    roomId?: string;
    userName: string;
    playerCount: number;
    maxPlayers: number;
    roomName: string;
    isForcedVoice: boolean;
    isMusicPlaying: boolean;
    isOtherPerformance: boolean;
    hasMicPermission: boolean;
    micPermissionAsked: boolean;
    shouldStreamVoice: boolean;
    onToggleVoice: () => void;
    onLeaveRoom: () => void;
    onRename: () => void;
}

export default function GameHeader({
    myScore,
    roomId,
    userName,
    playerCount,
    maxPlayers,
    roomName,
    isForcedVoice,
    isMusicPlaying,
    isOtherPerformance,
    hasMicPermission,
    micPermissionAsked,
    shouldStreamVoice,
    onToggleVoice,
    onLeaveRoom,
    onRename,
}: GameHeaderProps) {
    let title: ReactNode = undefined;
    if (isMusicPlaying) {
        title = "Đang phát nhạc, không thể mở mic";
    } else if (isOtherPerformance) {
        title = "Đang có người khác hát";
    } else if (!hasMicPermission && micPermissionAsked) {
        title = "Bạn cần cấp quyền truy cập Micro";
    }

    return (
        <div style={{
            padding: "16px 32px",
            textAlign: "center",
            background: "linear-gradient(135deg, rgba(0, 245, 212, 0.25), rgba(255, 122, 89, 0.25))",
            boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
            zIndex: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)"
        }}>
            <h1 style={{ margin: 0, fontSize: "28px", textShadow: "0 6px 14px rgba(0,0,0,0.4)", letterSpacing: "2px" }}>
                🎤 KARAOKE BATTLE
            </h1>
            <div style={{ display: "flex", gap: "15px", fontSize: "16px", fontWeight: 600 }}>
                <div style={{ backgroundColor: "rgba(7, 13, 32, 0.65)", padding: "6px 18px", borderRadius: "999px", border: "1px solid rgba(0, 245, 212, 0.4)" }}>
                    ⭐ Điểm của bạn: <span style={{ color: "var(--game-accent)", fontSize: "20px" }}>{myScore}</span>
                </div>
                <button
                    onClick={onToggleVoice}
                    disabled={isForcedVoice || isMusicPlaying || isOtherPerformance}
                    title={title}
                    style={{
                        padding: "6px 18px",
                        borderRadius: "999px",
                        border: "1px solid rgba(255, 122, 89, 0.8)",
                        background: shouldStreamVoice ? "linear-gradient(135deg, #ff7a59, #f72585)" : "rgba(7, 13, 32, 0.65)",
                        color: "white",
                        fontWeight: 700,
                        cursor: isForcedVoice ? "not-allowed" : "pointer"
                    }}
                >
                    {isForcedVoice ? "🎙️ MIC BẮT BUỘC" : (shouldStreamVoice ? "🔊 VOICE ON" : "🔇 VOICE OFF")}
                    {!hasMicPermission && micPermissionAsked && (
                        <span style={{ marginLeft: "6px", color: "#ffdd59", fontWeight: "bold" }}>!</span>
                    )}
                </button>
                <div style={{ backgroundColor: "rgba(7, 13, 32, 0.65)", padding: "6px 18px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ color: "#FFD700" }}>{roomName || "Phòng"}</span>
                    <span style={{ color: "#8fa3ff" }}>ID: {roomId}</span>
                    <span style={{ color: "#b8fff1" }}>{playerCount}/{maxPlayers} người</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 16px", borderRadius: "999px", border: "1px solid rgba(143, 163, 255, 0.4)", background: "rgba(143, 163, 255, 0.12)" }}>
                    <span style={{ color: "#d7dcff" }}>{userName}</span>
                    <button
                        onClick={onRename}
                        style={{
                            padding: "4px 10px",
                            borderRadius: "999px",
                            border: "1px solid rgba(255,255,255,0.15)",
                            background: "rgba(255,255,255,0.08)",
                            color: "#f8f8ff",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer"
                        }}
                    >
                        Đổi tên
                    </button>
                </div>
                <button
                    onClick={onLeaveRoom}
                    style={{
                        padding: "6px 14px",
                        borderRadius: "999px",
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.05)",
                        color: "#f8f8ff",
                        fontWeight: 600,
                        cursor: "pointer"
                    }}
                >
                    Rời phòng
                </button>
            </div>
        </div>
    );
}
