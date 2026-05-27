import type { User } from "../../types/user";

export interface RankedUser extends User {
    rankIcon: string;
}

interface LeaderboardProps {
    rankedPlayers: RankedUser[];
    userId: string;
}

export default function Leaderboard({ rankedPlayers, userId }: LeaderboardProps) {
    return (
        <div style={{ width: "280px", background: "var(--game-panel)", borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 18px 40px rgba(0,0,0,0.45)", animation: "floatIn 0.6s ease" }}>
            <div style={{ padding: "16px", background: "rgba(12, 18, 36, 0.8)", fontWeight: 700, textAlign: "center", fontSize: "18px", borderBottom: "1px solid rgba(255,255,255,0.05)", color: "#ffd166", letterSpacing: "1px" }}>
                🏆 BẢNG XẾP HẠNG
            </div>
            <div style={{ flex: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
                {rankedPlayers.map((user) => {
                    const isMeUser = user.userId === userId;
                    return (
                        <div key={user.userId} style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "12px 14px",
                            backgroundColor: isMeUser ? "rgba(0, 245, 212, 0.12)" : "rgba(21, 27, 48, 0.9)",
                            borderRadius: "12px",
                            border: isMeUser ? "1px solid rgba(0, 245, 212, 0.45)" : "1px solid transparent",
                            transition: "transform 0.2s",
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span style={{ fontSize: "20px", width: "25px", textAlign: "center" }}>{user.rankIcon}</span>
                                <span style={{ fontSize: "16px", fontWeight: isMeUser ? 700 : 500, color: isMeUser ? "var(--game-accent)" : "#f3f4ff" }}>
                                    {user.userName} {isMeUser && "(Bạn)"}
                                </span>
                            </div>
                            <div style={{ fontWeight: 700, color: "#ffd166", fontSize: "18px" }}>
                                {user.score} ⭐
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
