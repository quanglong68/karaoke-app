import { useState } from "react";
import PixelIcon from "../ui/PixelIcon";
import PixelAvatar from "../ui/PixelAvatar";
import Mascot from "../ui/Mascot";

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
    mutedAll: boolean;
    onToggleMute: () => void;
    remoteVolume: number;
    onRemoteVolumeChange: (value: number) => void;
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
    mutedAll,
    onToggleMute,
    remoteVolume,
    onRemoteVolumeChange,
    onLeaveRoom,
    onRename,
}: GameHeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false);

    let voiceTitle: string | undefined = undefined;
    if (isMusicPlaying) {
        voiceTitle = "Đang phát nhạc, không thể mở mic";
    } else if (isOtherPerformance) {
        voiceTitle = "Đang có người khác hát";
    } else if (!hasMicPermission && micPermissionAsked) {
        voiceTitle = "Bạn cần cấp quyền truy cập Micro";
    }

    return (
        <header className="game-header">
            <div className="game-brand">
                <Mascot size={30} headOnly pokeable={false} />
                <span>Karaoke Battle</span>
            </div>

            <div className="game-header-compact">
                <span className="p-chip game-score">
                    <PixelIcon name="star" size={13} />
                    {myScore}
                </span>
                <button
                    type="button"
                    className={`pbtn pbtn--sm pbtn--icon game-menu-toggle${menuOpen ? " is-open" : ""}`}
                    onClick={() => setMenuOpen((prev) => !prev)}
                    aria-label="Tùy chọn phòng"
                    aria-expanded={menuOpen}
                >
                    <PixelIcon name={menuOpen ? "close" : "menu"} size={16} />
                </button>
            </div>

            <div className={`game-header-meta${menuOpen ? " is-open" : ""}`}>
                <span className="p-chip game-score">
                    <PixelIcon name="star" size={14} />
                    {myScore} điểm
                </span>

                <button
                    type="button"
                    className="pbtn pbtn--sm"
                    onClick={() => {
                        onToggleVoice();
                        setMenuOpen(false);
                    }}
                    disabled={isForcedVoice || isMusicPlaying || isOtherPerformance}
                    title={voiceTitle}
                    aria-pressed={shouldStreamVoice}
                >
                    <PixelIcon
                        name={isForcedVoice ? "mic" : shouldStreamVoice ? "volumeOn" : "volumeOff"}
                        size={15}
                    />
                    {isForcedVoice ? "Mic bắt buộc" : shouldStreamVoice ? "Voice bật" : "Voice tắt"}
                    {!hasMicPermission && micPermissionAsked && <PixelIcon name="warning" size={13} />}
                </button>

                <button
                    type="button"
                    className="pbtn pbtn--sm"
                    onClick={() => {
                        onToggleMute();
                        setMenuOpen(false);
                    }}
                    aria-pressed={!mutedAll}
                >
                    <PixelIcon name={mutedAll ? "volumeOff" : "volumeOn"} size={15} />
                    {mutedAll ? "Đang tắt tiếng" : "Đang mở tiếng"}
                </button>

                <label className="game-volume" title="Âm lượng chung cho người chơi khác">
                    <PixelIcon name="volumeOn" size={14} />
                    <span className="game-volume-label">Chung</span>
                    <input
                        type="range"
                        min={0}
                        max={300}
                        step={10}
                        value={remoteVolume}
                        onChange={(event) => onRemoteVolumeChange(Number(event.target.value))}
                        aria-label="Âm lượng chung cho người chơi khác"
                    />
                    <span className="game-volume-value">{remoteVolume}%</span>
                </label>

                <span className="p-chip p-chip--mustard" title={roomName || "Phòng"}>
                    <PixelIcon name="door" size={13} />
                    {roomName || "Phòng"}
                    <span className="p-muted">#{roomId}</span>
                </span>

                <span className="p-chip">
                    <PixelIcon name="users" size={13} />
                    {playerCount}/{maxPlayers}
                </span>

                <span className="p-chip p-chip--sage">
                    <PixelAvatar seed={userName} size={18} />
                    {userName}
                </span>

                <button
                    type="button"
                    className="pbtn pbtn--sm"
                    onClick={() => {
                        onRename();
                        setMenuOpen(false);
                    }}
                >
                    <PixelIcon name="edit" size={14} />
                    Đổi tên
                </button>

                <button
                    type="button"
                    className="pbtn pbtn--sm pbtn--danger"
                    onClick={() => {
                        onLeaveRoom();
                        setMenuOpen(false);
                    }}
                >
                    <PixelIcon name="door" size={14} />
                    Rời phòng
                </button>
            </div>
        </header>
    );
}
