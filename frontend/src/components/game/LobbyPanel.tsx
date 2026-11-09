import type { User } from "../../types/user";
import { MAX_PLAYERS } from "../../constants/game";
import PixelIcon from "../ui/PixelIcon";
import PixelAvatar from "../ui/PixelAvatar";

interface LobbyPanelProps {
    playerList: User[];
    isHost: boolean;
    onKick: (userId: string) => void;
}

export default function LobbyPanel({ playerList, isHost, onKick }: LobbyPanelProps) {
    return (
        <div className="lobby-panel">
            <div className="lobby-panel-head">
                <h2 className="lobby-panel-title">Sảnh chờ khởi động</h2>
                <span className="p-chip p-chip--mustard">
                    <PixelIcon name="users" size={13} />
                    {playerList.length}/{MAX_PLAYERS}
                </span>
            </div>

            <p className="p-muted p-tiny">
                {playerList.length < 2
                    ? "Cần ít nhất 2 người để bắt đầu trận karaoke."
                    : "Mọi người bấm Sẵn sàng, chủ phòng sẽ bắt đầu trận đấu."}
            </p>

            <div className="player-grid">
                {playerList.map((user) => (
                    <div
                        key={user.userId}
                        className={`player-card${user.isHost ? " is-host" : ""}${user.isReady ? " is-ready" : ""}`}
                    >
                        {isHost && !user.isHost && (
                            <button
                                type="button"
                                className="kick-btn"
                                onClick={() => onKick(user.userId)}
                                aria-label={`Mời ${user.userName} rời phòng`}
                            >
                                <PixelIcon name="close" size={13} />
                            </button>
                        )}
                        <PixelAvatar seed={user.userId} size={46} />
                        <div className="player-name" title={user.userName}>
                            {user.userName}
                        </div>
                        {user.isHost ? (
                            <span className="player-state">
                                <PixelIcon name="crown" size={12} />
                                Chủ phòng
                            </span>
                        ) : (
                            <span className={`player-state${user.isReady ? " is-ready" : ""}`}>
                                <PixelIcon name={user.isReady ? "check" : "clock"} size={12} />
                                {user.isReady ? "Sẵn sàng" : "Đang chờ"}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
