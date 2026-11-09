import type { User } from "../../types/user";
import PixelIcon from "../ui/PixelIcon";
import PixelAvatar from "../ui/PixelAvatar";

export interface RankedUser extends User {
    rank: number;
}

interface LeaderboardProps {
    rankedPlayers: RankedUser[];
    userId: string;
    masterVolume: number;
    playerVolumes: Record<string, number>;
    onPlayerVolumeChange: (userId: string, value: number) => void;
}

export default function Leaderboard({
    rankedPlayers,
    userId,
    masterVolume,
    playerVolumes,
    onPlayerVolumeChange,
}: LeaderboardProps) {
    return (
        <aside className="p-panel leaderboard" aria-label="Bảng xếp hạng">
            <div className="p-panel-head">
                <PixelIcon name="trophy" size={16} />
                Bảng xếp hạng
            </div>
            <div className="leaderboard-list">
                {rankedPlayers.length === 0 && (
                    <div className="lobby-empty">Chưa có người chơi nào.</div>
                )}
                {rankedPlayers.map((user) => {
                    const isMeUser = user.userId === userId;
                    const volume = playerVolumes[user.userId] ?? masterVolume;
                    return (
                        <div key={user.userId} className={`rank-row${isMeUser ? " is-me" : ""}`}>
                            <div className="rank-main">
                                <div className="rank-left">
                                    <span className={`rank-badge${user.rank <= 3 ? ` rank-badge--${user.rank}` : ""}`}>
                                        {user.rank}
                                    </span>
                                    <PixelAvatar seed={user.userId} size={22} />
                                    <span className="rank-name" title={user.userName}>
                                        {user.userName}{isMeUser ? " (Bạn)" : ""}
                                    </span>
                                </div>
                                <span className="rank-score">
                                    <PixelIcon name="star" size={13} />
                                    {user.score}
                                </span>
                            </div>
                            {!isMeUser && (
                                <label
                                    className="rank-volume"
                                    title={`Âm lượng giọng ${user.userName}`}
                                >
                                    <PixelIcon name="volumeOn" size={12} />
                                    <input
                                        type="range"
                                        min={0}
                                        max={300}
                                        step={10}
                                        value={volume}
                                        onChange={(event) => onPlayerVolumeChange(user.userId, Number(event.target.value))}
                                        aria-label={`Âm lượng giọng ${user.userName}`}
                                    />
                                    <span className="rank-volume-value">{volume}%</span>
                                </label>
                            )}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
