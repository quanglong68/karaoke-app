import { PERFORMANCE_SECONDS } from "../../constants/game";
import type { LyricsStatus } from "../../types/game";
import PixelIcon from "../ui/PixelIcon";

interface PerformancePanelProps {
    perfCountdown: number;
    lyrics: string;
    isSinger: boolean;
    singerName: string | null;
    onFinish: () => void;
    lyricsStatus?: LyricsStatus;
}

export default function PerformancePanel({
    perfCountdown,
    lyrics,
    isSinger,
    singerName,
    onFinish,
    lyricsStatus = "idle",
}: PerformancePanelProps) {
    const progress = Math.max(0, Math.min(100, (perfCountdown / PERFORMANCE_SECONDS) * 100));

    return (
        <div className="perf-panel">
            <div className="perf-head">
                <span className="perf-title">
                    <PixelIcon name="mic" size={18} />
                    Hát theo lời
                </span>
                <div className="perf-head-side">
                    <span className="live-badge">
                        <span className="live-dot" />
                        {isSinger ? "Bạn đang hát" : `${singerName ?? "Ai đó"} đang hát`}
                    </span>
                    <span className="perf-timer" aria-label={`Còn ${perfCountdown} giây`}>
                        {perfCountdown}s
                    </span>
                </div>
            </div>

            <div
                className="perf-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={PERFORMANCE_SECONDS}
                aria-valuenow={perfCountdown}
                aria-label="Thời gian biểu diễn còn lại"
            >
                <div className="perf-bar-fill" style={{ width: `${progress}%` }} />
            </div>

            <div className="perf-lyrics">
                {lyrics || "Đang tải lời bài hát..."}
            </div>

            <div className="perf-actions">
                {isSinger ? (
                    <>
                        <button type="button" className="pbtn pbtn--primary" onClick={onFinish}>
                            <PixelIcon name="check" size={18} />
                            Hát xong rồi!
                        </button>
                        {lyricsStatus === "listening" && (
                            <p className="p-muted p-tiny perf-recognition">Đang nhận diện lời bài hát...</p>
                        )}
                        {lyricsStatus === "unsupported" && (
                            <p className="p-muted p-tiny perf-recognition">Trình duyệt không nhận diện lời — vẫn chấm theo nốt.</p>
                        )}
                        {lyricsStatus === "error" && (
                            <p className="p-muted p-tiny perf-recognition">Không nhận diện được lời — vẫn chấm theo nốt.</p>
                        )}
                    </>
                ) : (
                    <span className="game-controls-note">
                        <PixelIcon name="music" size={16} />
                        Bạn đang lắng nghe ca sĩ biểu diễn...
                    </span>
                )}
            </div>
        </div>
    );
}
