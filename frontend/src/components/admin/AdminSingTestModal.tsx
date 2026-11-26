import React, { useCallback, useEffect, useRef, useState } from "react";
import Modal from "../ui/Modal";
import PixelIcon from "../ui/PixelIcon";
import { usePitchCapture } from "../../hooks/usePitchCapture";
import {
    adminService,
    getAdminErrorMessage,
    isUnauthorized,
    type PerformanceTestResult,
} from "../../services/adminService";

export interface SingTestTarget {
    mode: "song" | "draft";
    id: string;
    songName: string;
    videoUrl: string;
    vocalUrl?: string | null;
    listenDuration: number;
    lyrics: string;
}

interface AttemptRecord {
    attempt: number;
    timeLabel: string;
    result: PerformanceTestResult;
}

interface AdminSingTestModalProps {
    target: SingTestTarget;
    onClose: () => void;
    onUnauthorized: () => void;
}

type TestPhase = "listen" | "countdown" | "singing" | "evaluating" | "result";

const DEFAULT_RULES = {
    countdownSeconds: 3,
    performanceSeconds: 60,
    minPerformanceSeconds: 15,
    successScore: 70,
    lyricsWeight: 0.4,
};

const AdminSingTestModal: React.FC<AdminSingTestModalProps> = ({
    target,
    onClose,
    onUnauthorized,
}) => {
    const [phase, setPhase] = useState<TestPhase>("listen");
    const [rules, setRules] = useState(DEFAULT_RULES);
    const [countdownLeft, setCountdownLeft] = useState(DEFAULT_RULES.countdownSeconds);
    const [singSecondsLeft, setSingSecondsLeft] = useState(DEFAULT_RULES.performanceSeconds);
    const [sendOnFinish, setSendOnFinish] = useState(false);

    const [micError, setMicError] = useState("");
    const [scoreError, setScoreError] = useState("");
    const [latestResult, setLatestResult] = useState<PerformanceTestResult | null>(null);
    const [history, setHistory] = useState<AttemptRecord[]>([]);

    const streamRef = useRef<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const releaseMicStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        adminService
            .getGameConfig()
            .then(cfg => {
                if (cancelled) return;
                setRules({
                    countdownSeconds: cfg.settings.countdownSeconds,
                    performanceSeconds: cfg.settings.performanceSeconds,
                    minPerformanceSeconds: cfg.settings.minPerformanceSeconds,
                    successScore: cfg.settings.successScore,
                    lyricsWeight: cfg.settings.lyricsWeight,
                });
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
            releaseMicStream();
        };
    }, [releaseMicStream]);

    const getStream = useCallback(() => streamRef.current, []);

    const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
        if (streamRef.current && streamRef.current.active) {
            return streamRef.current;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            setMicError("Trình duyệt không hỗ trợ thu microphone (cần chạy trên HTTPS hoặc localhost).");
            return null;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            streamRef.current = stream;
            setMicError("");
            return stream;
        } catch {
            setMicError("Chưa cấp quyền Microphone. Hãy bấm cho phép quyền Mic trên thanh địa chỉ trình duyệt.");
            return null;
        }
    }, []);

    const handleSubmitCaptured = useCallback(
        async (capturedLyrics: string, pitchContour: number[]) => {
            setScoreError("");
            try {
                const res =
                    target.mode === "song"
                        ? await adminService.testSongScore(target.id, {
                              userLyrics: capturedLyrics,
                              pitchContour,
                          })
                        : await adminService.testDraftScore(target.id, {
                              userLyrics: capturedLyrics,
                              pitchContour,
                              lyricsOverride: target.lyrics,
                          });
                const nowLabel = new Date().toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                });
                setLatestResult(res);
                setHistory(prev => [
                    {
                        attempt: prev.length + 1,
                        timeLabel: nowLabel,
                        result: res,
                    },
                    ...prev,
                ]);
                setSendOnFinish(false);
                setPhase("result");
            } catch (err) {
                setSendOnFinish(false);
                if (isUnauthorized(err)) {
                    onUnauthorized();
                    return;
                }
                setScoreError(getAdminErrorMessage(err, "Không chấm được lượt hát thử này."));
                setPhase("result");
            }
        },
        [target, onUnauthorized],
    );

    const { lyricsStatus } = usePitchCapture({
        enabled: phase === "singing",
        sendLyricsOnFinish: sendOnFinish,
        getStream,
        ensureStream,
        onSubmit: handleSubmitCaptured,
    });

    const enterCountdown = async () => {
        videoRef.current?.pause();
        setMicError("");
        setScoreError("");
        const stream = await ensureStream();
        if (!stream) {
            return;
        }
        setSendOnFinish(false);
        setCountdownLeft(rules.countdownSeconds);
        setPhase("countdown");
    };

    const enterSingingNow = () => {
        setSendOnFinish(false);
        setSingSecondsLeft(rules.performanceSeconds);
        setPhase("singing");
    };

    const finishSinging = () => {
        if (phase !== "singing") return;
        setPhase("evaluating");
        setSendOnFinish(true);
    };

    const replayFromListen = () => {
        setScoreError("");
        setSendOnFinish(false);
        setPhase("listen");
    };

    const handleCloseModal = () => {
        releaseMicStream();
        onClose();
    };

    useEffect(() => {
        if (phase !== "countdown") return;
        const timer = setInterval(() => {
            setCountdownLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setSingSecondsLeft(rules.performanceSeconds);
                    setPhase("singing");
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [phase, rules.performanceSeconds]);

    useEffect(() => {
        if (phase !== "singing") return;
        const timer = setInterval(() => {
            setSingSecondsLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setPhase("evaluating");
                    setSendOnFinish(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [phase]);

    const resolvedVideoSrc = adminService.resolveMediaUrl(target.videoUrl);
    const resolvedVocalSrc = target.vocalUrl ? adminService.resolveMediaUrl(target.vocalUrl) : "";
    const elapsedSing = rules.performanceSeconds - singSecondsLeft;
    const progressPct = Math.max(0, Math.min(100, (singSecondsLeft / rules.performanceSeconds) * 100));
    const toneWeightPct = Math.round((1 - rules.lyricsWeight) * 100);
    const lyricsWeightPct = Math.round(rules.lyricsWeight * 100);

    return (
        <Modal
            title={`Phòng Hát Thử · ${target.songName}`}
            icon="mic"
            wide
            onClose={handleCloseModal}
            actions={
                phase === "result" ? (
                    <>
                        <button type="button" className="pbtn pbtn--sm" onClick={handleCloseModal}>
                            Đóng
                        </button>
                        <button type="button" className="pbtn pbtn--secondary pbtn--sm" onClick={replayFromListen}>
                            <PixelIcon name="play" size={14} />
                            Phát lại từ đoạn mồi
                        </button>
                        <button type="button" className="pbtn pbtn--primary pbtn--sm" onClick={() => void enterCountdown()}>
                            <PixelIcon name="mic" size={14} />
                            Hát lại ngay
                        </button>
                    </>
                ) : (
                    <button type="button" className="pbtn pbtn--sm" onClick={handleCloseModal}>
                        Đóng phòng thử
                    </button>
                )
            }
        >
            <div className="singtest-stage">
                {/* Step pills */}
                <div className="singtest-steps">
                    <span className={`p-chip p-tiny${phase === "listen" ? " p-chip--mustard" : ""}`}>
                        1. Nghe đoạn mồi
                    </span>
                    <span
                        className={`p-chip p-tiny${
                            phase === "countdown" || phase === "singing" || phase === "evaluating"
                                ? " p-chip--rose"
                                : ""
                        }`}
                    >
                        2. Thu mic hát tiếp
                    </span>
                    <span className={`p-chip p-tiny${phase === "result" ? " p-chip--sage" : ""}`}>
                        3. Chấm điểm thật
                    </span>
                    <span className="singtest-rule-tag p-tiny p-muted">
                        Đạt &ge; {rules.successScore}đ ({toneWeightPct}% Nốt · {lyricsWeightPct}% Lời)
                    </span>
                </div>

                {micError && (
                    <div className="admin-alert admin-alert--error" role="alert">
                        {micError}
                    </div>
                )}
                {scoreError && (
                    <div className="admin-alert admin-alert--error" role="alert">
                        {scoreError}
                    </div>
                )}

                {/* PHASE 1: LISTEN CLIP */}
                {phase === "listen" && (
                    <div className="singtest-listen-box">
                        <video
                            ref={videoRef}
                            className="singtest-video"
                            src={resolvedVideoSrc}
                            controls
                            autoPlay
                            playsInline
                            crossOrigin={target.mode === "draft" ? "use-credentials" : undefined}
                            onEnded={() => void enterCountdown()}
                        />
                        <div className="singtest-listen-bar">
                            <span className="p-tiny p-muted">
                                Hết đoạn mồi ({target.listenDuration.toFixed(1)}s) sẽ tự động đếm nhịp mở Mic để bạn hát nối tiếp.
                            </span>
                            <button
                                type="button"
                                className="pbtn pbtn--primary pbtn--sm"
                                onClick={() => void enterCountdown()}
                            >
                                <PixelIcon name="mic" size={14} />
                                Vào hát ngay (Bỏ qua đoạn mồi)
                            </button>
                        </div>
                    </div>
                )}

                {/* PHASE 2A: COUNTDOWN */}
                {phase === "countdown" && (
                    <div className="singtest-countdown-box">
                        <p className="pixel-label p-tiny">CHUẨN BỊ LẤY HƠI VÀO NHỊP</p>
                        <div className="singtest-digit" aria-live="polite">
                            {countdownLeft}
                        </div>
                        <div className="singtest-lyrics-peek">{target.lyrics}</div>
                        <button type="button" className="pbtn pbtn--secondary pbtn--sm" onClick={enterSingingNow}>
                            Bắt đầu thu ngay
                        </button>
                    </div>
                )}

                {/* PHASE 2B: SINGING LIVE */}
                {(phase === "singing" || phase === "evaluating") && (
                    <div className="singtest-sing-box">
                        <div className="perf-head">
                            <span className="perf-title">
                                <PixelIcon name="mic" size={18} />
                                Hát theo lời bên dưới
                            </span>
                            <div className="perf-head-side">
                                <span className="live-badge">
                                    <span className="live-dot" />
                                    {phase === "evaluating" ? "Đang chấm..." : "Mic đang thu thật"}
                                </span>
                                <span className="perf-timer">{singSecondsLeft}s</span>
                            </div>
                        </div>

                        <div
                            className="perf-bar"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={rules.performanceSeconds}
                            aria-valuenow={singSecondsLeft}
                            aria-label="Thời gian biểu diễn còn lại"
                        >
                            <div className="perf-bar-fill" style={{ width: `${progressPct}%` }} />
                        </div>

                        <div className="perf-lyrics">{target.lyrics || "Chưa có lời bài hát"}</div>

                        <div className="singtest-sing-foot">
                            <span className="p-tiny p-muted">
                                {lyricsStatus === "listening" && "Đang nhận diện lời Tiếng Việt + đo cao độ giọng..."}
                                {lyricsStatus === "unsupported" && "Trình duyệt không nhận diện lời — hệ thống tự chấm 100% theo nốt."}
                                {lyricsStatus === "error" && "Không bắt được lời nói — hệ thống vẫn chấm theo nốt giọng."}
                                {lyricsStatus === "idle" && "Đang khởi tạo bộ lọc giọng 70–1500Hz..."}
                                {elapsedSing < rules.minPerformanceSeconds
                                    ? ` · (Trong phòng thật cần hát tối thiểu ${rules.minPerformanceSeconds}s, ở phòng test bạn bấm chấm lúc nào cũng được)`
                                    : ""}
                            </span>
                            <button
                                type="button"
                                className="pbtn pbtn--primary"
                                onClick={finishSinging}
                                disabled={phase === "evaluating"}
                            >
                                <PixelIcon name={phase === "evaluating" ? "clock" : "check"} size={16} />
                                {phase === "evaluating" ? "Đang chấm điểm..." : "Hát xong · Chấm điểm!"}
                            </button>
                        </div>
                    </div>
                )}

                {/* PHASE 3: SCORE BREAKDOWN & ATTEMPT COMPARISON */}
                {phase === "result" && latestResult && (
                    <div className="singtest-result-box">
                        <div
                            className={`singtest-verdict ${
                                latestResult.passed ? "singtest-verdict--pass" : "singtest-verdict--fail"
                            }`}
                        >
                            <div className="singtest-verdict-main">
                                <PixelIcon name={latestResult.passed ? "crown" : "close"} size={22} />
                                <div>
                                    <strong>
                                        {latestResult.passed ? "ĐẠT YÊU CẦU (+1 điểm vòng)" : "CHƯA ĐẠT NGƯỠNG QUA MÀN"}
                                    </strong>
                                    <p className="p-tiny">
                                        Tổng điểm <strong>{latestResult.finalScore.toFixed(1)}</strong> / ngưỡng yêu cầu{" "}
                                        <strong>{latestResult.successThreshold}</strong> điểm
                                        {latestResult.lyricsUnavailable
                                            ? " (Không bắt đủ chữ → tự động tính 100% theo điểm Cao độ như phòng thật)"
                                            : ""}
                                    </p>
                                </div>
                            </div>
                            <span className="singtest-total-pill">{latestResult.finalScore.toFixed(1)}đ</span>
                        </div>

                        <div className="singtest-metrics">
                            <div className="singtest-metric-card">
                                <span className="pixel-label p-tiny">CAO ĐỘ GIỌNG (DTW)</span>
                                <strong>{latestResult.toneScore.toFixed(1)} / 100</strong>
                                <span className="p-tiny p-muted">
                                    Mic bắt {latestResult.capturedVoicedCount} mẫu có giọng / {latestResult.referenceVoicedCount} mẫu gốc
                                </span>
                            </div>

                            <div className="singtest-metric-card">
                                <span className="pixel-label p-tiny">ĐỘ KHỚP LỜI HÁT</span>
                                <strong>
                                    {latestResult.lyricsUnavailable
                                        ? "Bỏ qua (tính 100% nốt)"
                                        : `${latestResult.lyricsScore.toFixed(1)} / 100`}
                                </strong>
                                <span className="p-tiny p-muted">
                                    Trọng số cấu hình: {lyricsWeightPct}% lời · {toneWeightPct}% cao độ
                                </span>
                            </div>
                        </div>

                        <div className="singtest-transcript-box">
                            <span className="pixel-label p-tiny">LỜI TRÌNH DUYỆT NGHE ĐƯỢC TỪ MIC:</span>
                            <p>{latestResult.capturedLyrics || "(Không nhận diện được chữ nào — im lặng hoặc trình duyệt chặn Web Speech)"}</p>
                        </div>

                        {resolvedVocalSrc && (
                            <div className="singtest-ref-vocal">
                                <span className="p-tiny p-muted">Nghe đối chiếu giọng ca sĩ gốc đang dùng làm chuẩn chấm:</span>
                                <audio
                                    className="studio-audio"
                                    src={resolvedVocalSrc}
                                    controls
                                    preload="none"
                                    crossOrigin={target.mode === "draft" ? "use-credentials" : undefined}
                                />
                            </div>
                        )}

                        {history.length > 0 && (
                            <div className="singtest-history">
                                <span className="pixel-label p-tiny">SO SÁNH CÁC LƯỢT THỬ TRONG PHIÊN NÀY</span>
                                <div className="admin-table-wrap">
                                    <table className="admin-table singtest-history-table">
                                        <thead>
                                            <tr>
                                                <th scope="col">Lượt</th>
                                                <th scope="col">Lúc</th>
                                                <th scope="col">Cao độ</th>
                                                <th scope="col">Lời hát</th>
                                                <th scope="col">Tổng</th>
                                                <th scope="col">Kết quả</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map(item => (
                                                <tr key={item.attempt}>
                                                    <td className="pixel-label p-tiny">#{item.attempt}</td>
                                                    <td className="p-tiny">{item.timeLabel}</td>
                                                    <td>{item.result.toneScore.toFixed(1)}</td>
                                                    <td>
                                                        {item.result.lyricsUnavailable
                                                            ? "—"
                                                            : item.result.lyricsScore.toFixed(1)}
                                                    </td>
                                                    <td>
                                                        <strong>{item.result.finalScore.toFixed(1)}</strong>
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={`p-chip p-tiny ${
                                                                item.result.passed ? "p-chip--sage" : "p-chip--rose"
                                                            }`}
                                                        >
                                                            {item.result.passed ? "ĐẠT" : "TRƯỢT"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AdminSingTestModal;
