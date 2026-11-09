import type { RankedUser } from "./Leaderboard";
import PixelAvatar from "../ui/PixelAvatar";
import PixelIcon from "../ui/PixelIcon";

interface MobilePlayerStripProps {
    rankedPlayers: RankedUser[];
    userId: string;
}

export default function MobilePlayerStrip({ rankedPlayers, userId }: MobilePlayerStripProps) {
    return (
        <div className="mobile-players" aria-label="Người chơi trong phòng">
            {rankedPlayers.map((user) => (
                <span
                    key={user.userId}
                    className={`mobile-player${user.userId === userId ? " is-me" : ""}${user.isHost ? " is-host" : ""}`}
                >
                    <PixelAvatar seed={user.userId} size={20} />
                    <span className="mobile-player-name">
                        {user.userName}
                        {user.userId === userId ? " (Bạn)" : ""}
                    </span>
                    <span className="mobile-player-score">
                        <PixelIcon name="star" size={11} />
                        {user.score}
                    </span>
                </span>
            ))}
        </div>
    );
}
