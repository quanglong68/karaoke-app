import React, { useEffect, useRef, useState } from "react";
import PixelIcon from "../ui/PixelIcon";
import AdminSingTestModal, { type SingTestTarget } from "./AdminSingTestModal";
import DecimalSecondInput from "./DecimalSecondInput";
import DualTimelineTrack from "./DualTimelineTrack";
import {
    adminService,
    getAdminErrorCode,
    getAdminErrorMessage,
    isUnauthorized,
    type SongDraftAnalyzeResponse,
} from "../../services/adminService";
import {
    MIN_LISTEN_SEC,
    MIN_SING_SEC,
    applySegmentChange,
    cleanClientFilenameTitle,
    computeDefaultSegments,
    formatSecondsLabel,
    isLikelyYoutubeUrl,
    round2,
    validateSegments,
    type SegmentRange,
} from "./songSegmentUtils";

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;
const MAX_SONG_TITLE_LENGTH = 120;
const MAX_SONG_LYRICS_LENGTH = 10_000;
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"];
const AUDIO_EXTENSIONS = [".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac"];

type SourceMode = "youtube" | "local" | "legacy";
type PreviewTab = "vocal" | "clip";

const hasAllowedExtension = (fileName: string, allowed: string[]) => {
    const lower = fileName.toLowerCase();
    return allowed.some(ext => lower.endsWith(ext));
};

const createRequestId = () => {
    const randomUuid = globalThis.crypto?.randomUUID?.();
    return randomUuid ?? `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const readVideoDuration = (file: File): Promise<number> =>
    new Promise((resolve, reject) => {
        const videoElement = document.createElement("video");
        videoElement.preload = "metadata";
        const objectUrl = URL.createObjectURL(file);
        videoElement.onloadedmetadata = () => {
            window.URL.revokeObjectURL(objectUrl);
            resolve(Number.isFinite(videoElement.duration) ? videoElement.duration : 0);
        };
        videoElement.onerror = () => {
            window.URL.revokeObjectURL(objectUrl);
            reject(new Error("METADATA_ERROR"));
        };
        videoElement.src = objectUrl;
    });

function formatLyricsSourceTag(raw: string): string {
    if (!raw) return "Thủ công";
    if (raw === "YOUTUBE_SUBTITLES") return "Phụ đề gốc";
    if (raw.startsWith("GEMINI_AUDIO")) return raw.replace("GEMINI_AUDIO", "Gemini").trim();
    return "Nhập tay";
}

interface AdminUploadPanelProps {
    onUnauthorized: () => void;
    onOpenAiConfig?: () => void;
}

const AdminUploadPanel: React.FC<AdminUploadPanelProps> = ({ onUnauthorized, onOpenAiConfig }) => {
    const [mode, setMode] = useState<SourceMode>("youtube");

    // --- Smart Studio State ---
    const [youtubeUrl, setYoutubeUrl] = useState("");
    const [localVideoFile, setLocalVideoFile] = useState<File | null>(null);
    const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
    const [vocalOverrideFile, setVocalOverrideFile] = useState<File | null>(null);
    const [showVocalOverride, setShowVocalOverride] = useState(false);

    const [draftId, setDraftId] = useState<string | null>(null);
    const [serverVideoUrl, setServerVideoUrl] = useState("");
    const [totalDuration, setTotalDuration] = useState(0);
    const [hasOfficialSubs, setHasOfficialSubs] = useState(false);

    const [segments, setSegments] = useState<SegmentRange>({
        listenStart: 0,
        listenEnd: 15,
        singStart: 15,
        singEnd: 35,
    });
    const [linkedBoundary, setLinkedBoundary] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlayingVideo, setIsPlayingVideo] = useState(false);
    const [previewTab, setPreviewTab] = useState<PreviewTab>("vocal");

    const stopPreviewAtRef = useRef<number | null>(null);
    const sourceVideoRef = useRef<HTMLVideoElement | null>(null);

    const [smartTitle, setSmartTitle] = useState("");
    const [smartLyrics, setSmartLyrics] = useState("");
    const [analyzed, setAnalyzed] = useState<SongDraftAnalyzeResponse | null>(null);
    const [segmentsDirtySinceAnalyze, setSegmentsDirtySinceAnalyze] = useState(false);

    const [busyStage, setBusyStage] = useState<"" | "loading-source" | "analyzing" | "committing">("");
    const [busyLabel, setBusyLabel] = useState("");
    const [busySeconds, setBusySeconds] = useState(0);
    const smartAbortRef = useRef<AbortController | null>(null);
    const smartRequestIdRef = useRef<string | null>(null);

    // --- Legacy 2-file State ---
    const [legacyTitle, setLegacyTitle] = useState("");
    const [legacyLyrics, setLegacyLyrics] = useState("");
    const [legacyVideo, setLegacyVideo] = useState<File | null>(null);
    const [legacyVocal, setLegacyVocal] = useState<File | null>(null);
    const [legacyDuration, setLegacyDuration] = useState(0);
    const [legacyLoading, setLegacyLoading] = useState(false);
    const legacyAbortRef = useRef<AbortController | null>(null);
    const legacyRequestIdRef = useRef<string | null>(null);
    const legacyFormRef = useRef<HTMLFormElement | null>(null);
    const videoSelectionSeqRef = useRef(0);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [lastSavedSongId, setLastSavedSongId] = useState<string | null>(null);
    const [singTestTarget, setSingTestTarget] = useState<SingTestTarget | null>(null);

    useEffect(() => {
        if (!busyStage) return;
        const timer = setInterval(() => {
            setBusySeconds(s => s + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [busyStage]);

    const validateFile = (file: File, allowed: string[]): string | null => {
        if (file.size > MAX_FILE_BYTES) {
            return "File quá lớn (tối đa 200MB mỗi file).";
        }
        if (!hasAllowedExtension(file.name, allowed)) {
            return `Định dạng không hỗ trợ. Chỉ nhận: ${allowed.join(", ")}`;
        }
        return null;
    };

    const resetSmartWorkspace = (dropServerDraft = true) => {
        if (dropServerDraft && draftId) {
            void Promise.resolve(adminService.deleteSongDraft(draftId)).catch(() => undefined);
        }
        if (localPreviewUrl) {
            URL.revokeObjectURL(localPreviewUrl);
        }
        setLocalVideoFile(null);
        setLocalPreviewUrl(null);
        setVocalOverrideFile(null);
        setShowVocalOverride(false);
        setDraftId(null);
        setServerVideoUrl("");
        setTotalDuration(0);
        setHasOfficialSubs(false);
        setAnalyzed(null);
        setSegmentsDirtySinceAnalyze(false);
        setSmartTitle("");
        setSmartLyrics("");
        setCurrentTime(0);
        setIsPlayingVideo(false);
        stopPreviewAtRef.current = null;
    };

    const handleSwitchMode = (nextMode: SourceMode) => {
        if (busyStage || legacyLoading || nextMode === mode) return;
        setError("");
        setSuccess("");
        if (nextMode !== "legacy") {
            resetSmartWorkspace(true);
        }
        setMode(nextMode);
    };

    const handleFetchYoutube = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        if (!isLikelyYoutubeUrl(youtubeUrl)) {
            setError("Link YouTube không hợp lệ (hãy dán link youtube.com hoặc youtu.be).");
            return;
        }
        resetSmartWorkspace(true);

        const controller = new AbortController();
        const requestId = createRequestId();
        smartAbortRef.current = controller;
        smartRequestIdRef.current = requestId;
        setBusySeconds(0);
        setBusyStage("loading-source");
        setBusyLabel("Đang tải video từ YouTube...");

        try {
            const res = await adminService.createYoutubeDraft(youtubeUrl.trim(), requestId, controller.signal);
            setDraftId(res.draftId);
            setServerVideoUrl(adminService.resolveMediaUrl(res.sourceStreamUrl));
            setTotalDuration(res.totalDuration);
            setHasOfficialSubs(res.hasOfficialSubtitles);
            setSmartTitle(res.suggestedTitle || "");
            setSegments(computeDefaultSegments(res.totalDuration));
            setLinkedBoundary(true);
        } catch (err) {
            if ((err as { code?: string } | null)?.code === "ERR_CANCELED") {
                setError("Đã huỷ tải video.");
                return;
            }
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không thể tải video từ link YouTube này."));
        } finally {
            smartAbortRef.current = null;
            setBusyStage("");
            setBusyLabel("");
        }
    };

    const loadLocalFile = (file: File) => {
        const seq = ++videoSelectionSeqRef.current;
        setError("");
        setSuccess("");
        resetSmartWorkspace(true);

        const fileErr = validateFile(file, VIDEO_EXTENSIONS);
        if (fileErr) {
            setError(fileErr);
            return false;
        }

        const objUrl = URL.createObjectURL(file);
        setLocalVideoFile(file);
        setLocalPreviewUrl(objUrl);
        setSmartTitle(cleanClientFilenameTitle(file.name));

        readVideoDuration(file)
            .then(dur => {
                if (videoSelectionSeqRef.current !== seq) return;
                setTotalDuration(dur);
                setSegments(computeDefaultSegments(dur));
                setLinkedBoundary(true);
            })
            .catch(() => {
                if (videoSelectionSeqRef.current !== seq) return;
                setError("Không đọc được thời lượng file video này.");
            });
        return true;
    };

    const handleLocalSourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            resetSmartWorkspace(true);
            return;
        }
        if (!loadLocalFile(file)) {
            e.target.value = "";
        }
    };

    const handleDropSourceFile = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (busyStage || legacyLoading) return;
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (mode !== "local") {
            setMode("local");
        }
        loadLocalFile(file);
    };

    const handleVocalOverrideChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        if (file) {
            const fileErr = validateFile(file, AUDIO_EXTENSIONS);
            if (fileErr) {
                setError(fileErr);
                e.target.value = "";
                setVocalOverrideFile(null);
                return;
            }
        }
        setError("");
        setVocalOverrideFile(file);
        if (analyzed) setSegmentsDirtySinceAnalyze(true);
    };

    // --- Video transport & segment controls ---
    const seekVideoTo = (seconds: number) => {
        const clamped = round2(Math.max(0, Math.min(totalDuration || 0, seconds)));
        stopPreviewAtRef.current = null;
        setCurrentTime(clamped);
        if (sourceVideoRef.current) {
            sourceVideoRef.current.currentTime = clamped;
        }
    };

    const nudgePlayhead = (delta: number) => {
        const base = sourceVideoRef.current?.currentTime ?? currentTime;
        seekVideoTo(base + delta);
    };

    const togglePlayVideo = () => {
        const video = sourceVideoRef.current;
        if (!video) return;
        stopPreviewAtRef.current = null;
        if (video.paused) {
            void video.play().catch(() => undefined);
        } else {
            video.pause();
        }
    };

    const playPreviewRange = (startSec: number, endSec: number) => {
        const video = sourceVideoRef.current;
        if (!video) return;
        stopPreviewAtRef.current = endSec;
        video.currentTime = Math.max(0, startSec);
        void video.play().catch(() => undefined);
    };

    const handleVideoTimeUpdate = () => {
        const video = sourceVideoRef.current;
        if (!video) return;
        setCurrentTime(video.currentTime);
        if (stopPreviewAtRef.current !== null && video.currentTime >= stopPreviewAtRef.current) {
            video.pause();
            stopPreviewAtRef.current = null;
        }
    };

    const handleChangeSegment = (field: keyof SegmentRange, nextSeconds: number) => {
        setSegments(prev => applySegmentChange(prev, field, nextSeconds, totalDuration, linkedBoundary));
        if (analyzed) {
            setSegmentsDirtySinceAnalyze(true);
        }
    };

    const snapFromPlayhead = (field: keyof SegmentRange) => {
        const exact = round2(sourceVideoRef.current?.currentTime ?? currentTime);
        handleChangeSegment(field, exact);
    };

    const handleToggleLinked = () => {
        setLinkedBoundary(prev => {
            const nextLinked = !prev;
            if (nextLinked) {
                setSegments(cur => applySegmentChange(cur, "listenEnd", cur.listenEnd, totalDuration, true));
                if (analyzed) setSegmentsDirtySinceAnalyze(true);
            }
            return nextLinked;
        });
    };

    const handleAnalyzeSmart = async () => {
        setError("");
        setSuccess("");
        const segErr = validateSegments(segments, totalDuration);
        if (segErr) {
            setError(segErr);
            return;
        }

        const controller = new AbortController();
        smartAbortRef.current = controller;
        setBusySeconds(0);

        const buildAnalyzeForm = (reqId: string) => {
            const form = new FormData();
            form.append("listenStart", String(segments.listenStart));
            form.append("listenEnd", String(segments.listenEnd));
            form.append("singStart", String(segments.singStart));
            form.append("singEnd", String(segments.singEnd));
            if (smartTitle.trim()) {
                form.append("titleHint", smartTitle.trim());
            }
            if (vocalOverrideFile) {
                form.append("vocalOverrideFile", vocalOverrideFile);
            }
            form.append("requestId", reqId);
            return form;
        };

        const hydrateSourceDraft = async (): Promise<string> => {
            if (mode === "youtube" && isLikelyYoutubeUrl(youtubeUrl)) {
                const ytReqId = createRequestId();
                smartRequestIdRef.current = ytReqId;
                setBusyStage("loading-source");
                setBusyLabel("Đang đồng bộ lại nguồn YouTube trên máy chủ...");
                const res = await adminService.createYoutubeDraft(youtubeUrl.trim(), ytReqId, controller.signal);
                setDraftId(res.draftId);
                setServerVideoUrl(adminService.resolveMediaUrl(res.sourceStreamUrl));
                setHasOfficialSubs(res.hasOfficialSubtitles);
                return res.draftId;
            }
            if (localVideoFile) {
                const uploadReqId = createRequestId();
                smartRequestIdRef.current = uploadReqId;
                setBusyStage("loading-source");
                setBusyLabel("Đang tải video nguồn lên máy chủ...");
                const upForm = new FormData();
                upForm.append("sourceVideo", localVideoFile);
                upForm.append("requestId", uploadReqId);
                const uploaded = await adminService.uploadDraftSource(upForm, controller.signal);
                setDraftId(uploaded.draftId);
                return uploaded.draftId;
            }
            throw new Error("MISSING_SOURCE");
        };

        try {
            let activeDraftId = draftId;
            if (!activeDraftId) {
                try {
                    activeDraftId = await hydrateSourceDraft();
                } catch (hydrateErr) {
                    if ((hydrateErr as Error)?.message === "MISSING_SOURCE") {
                        setError("Hãy nạp video nguồn trước khi tách.");
                        return;
                    }
                    throw hydrateErr;
                }
            }

            const startAnalyzeCall = async (targetDraftId: string) => {
                const analyzeReqId = createRequestId();
                smartRequestIdRef.current = analyzeReqId;
                setBusyStage("analyzing");
                setBusyLabel(
                    vocalOverrideFile
                        ? "Đang cắt clip mồi, đo nốt vocal & lấy lời..."
                        : "Đang cắt clip, tách giọng UVR & lấy lời...",
                );
                return adminService.analyzeSongDraft(
                    targetDraftId,
                    buildAnalyzeForm(analyzeReqId),
                    controller.signal,
                );
            };

            let result: SongDraftAnalyzeResponse;
            try {
                result = await startAnalyzeCall(activeDraftId);
            } catch (firstErr) {
                // Auto-recover transparently if server draft expired or was restarted
                if (getAdminErrorCode(firstErr) === "DRAFT_NOT_FOUND") {
                    activeDraftId = await hydrateSourceDraft();
                    result = await startAnalyzeCall(activeDraftId);
                } else {
                    throw firstErr;
                }
            }

            setAnalyzed(result);
            setSegmentsDirtySinceAnalyze(false);
            setPreviewTab("vocal");
            if (!smartTitle.trim() && result.suggestedTitle) {
                setSmartTitle(result.suggestedTitle);
            }
            setSmartLyrics(result.lyrics ?? "");
        } catch (err) {
            if ((err as { code?: string } | null)?.code === "ERR_CANCELED") {
                setError("Đã huỷ xử lý.");
                return;
            }
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không thể tách đoạn nhạc này."));
        } finally {
            smartAbortRef.current = null;
            setBusyStage("");
            setBusyLabel("");
        }
    };

    const handleCommitSmart = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        if (!draftId || !analyzed || segmentsDirtySinceAnalyze) {
            setError("Mốc giây đã thay đổi — hãy bấm Tách lại trước khi lưu.");
            return;
        }
        if (!smartTitle.trim() || !smartLyrics.trim()) {
            setError("Vui lòng điền đủ tên bài và lời đoạn hát.");
            return;
        }

        const controller = new AbortController();
        const requestId = createRequestId();
        smartAbortRef.current = controller;
        smartRequestIdRef.current = requestId;
        setBusySeconds(0);
        setBusyStage("committing");
        setBusyLabel("Đang lưu lên Cloudinary...");

        try {
            const saved = await adminService.commitSongDraft(
                draftId,
                {
                    title: smartTitle.trim(),
                    lyrics: smartLyrics.trim(),
                    requestId,
                },
                controller.signal,
            );
            setSuccess(`Đã lưu "${saved.title}" (${saved.id}) vào thư viện!`);
            setLastSavedSongId(saved.id);
            setYoutubeUrl("");
            resetSmartWorkspace(false);
        } catch (err) {
            if ((err as { code?: string } | null)?.code === "ERR_CANCELED") {
                setError("Đã huỷ lưu bài hát.");
                return;
            }
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không thể lưu bài hát vào thư viện."));
        } finally {
            smartAbortRef.current = null;
            setBusyStage("");
            setBusyLabel("");
        }
    };

    const handleCancelSmart = () => {
        const reqId = smartRequestIdRef.current;
        smartAbortRef.current?.abort();
        if (reqId) {
            void Promise.resolve(adminService.cancelSongDraftOperation(reqId)).catch(() => undefined);
        }
    };

    // --- Legacy 2-file Handlers ---
    const handleLegacyVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const seq = ++videoSelectionSeqRef.current;
        const file = e.target.files?.[0];
        if (!file) {
            setLegacyVideo(null);
            setLegacyDuration(0);
            return;
        }
        const fileError = validateFile(file, VIDEO_EXTENSIONS);
        if (fileError) {
            setError(fileError);
            e.target.value = "";
            setLegacyVideo(null);
            setLegacyDuration(0);
            return;
        }
        setError("");
        setLegacyVideo(file);
        if (!legacyTitle.trim()) {
            setLegacyTitle(cleanClientFilenameTitle(file.name));
        }
        setLegacyDuration(0);
        readVideoDuration(file)
            .then(detected => {
                if (videoSelectionSeqRef.current === seq) {
                    setLegacyDuration(detected);
                }
            })
            .catch(() => {
                if (videoSelectionSeqRef.current === seq) {
                    setLegacyDuration(0);
                    setError("Không đọc được thời lượng video.");
                }
            });
    };

    const handleLegacyVocalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        if (file) {
            const fileError = validateFile(file, AUDIO_EXTENSIONS);
            if (fileError) {
                setError(fileError);
                e.target.value = "";
                setLegacyVocal(null);
                return;
            }
        }
        setError("");
        setLegacyVocal(file);
    };

    const handleLegacyUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        if (!legacyVideo || !legacyVocal || !legacyTitle.trim() || !legacyLyrics.trim()) {
            setError("Vui lòng điền và chọn đủ các trường.");
            return;
        }
        if (legacyVideo.size + legacyVocal.size > MAX_TOTAL_BYTES) {
            setError("Tổng dung lượng video + giọng gốc tối đa 400MB.");
            return;
        }
        if (!Number.isFinite(legacyDuration) || legacyDuration <= 0) {
            setError("Chưa đọc được thời lượng video hợp lệ.");
            return;
        }

        const controller = new AbortController();
        legacyAbortRef.current = controller;
        setLegacyLoading(true);
        const requestId = createRequestId();
        legacyRequestIdRef.current = requestId;
        const formData = new FormData();
        formData.append("requestId", requestId);
        formData.append("mainVideo", legacyVideo);
        formData.append("vocalFile", legacyVocal);
        formData.append("title", legacyTitle.trim());
        formData.append("lyrics", legacyLyrics.trim());
        formData.append("duration", legacyDuration.toString());

        try {
            const saved = await adminService.uploadSong(formData, controller.signal);
            setSuccess(`Đã lưu "${saved.title}" (${saved.id}) vào thư viện!`);
            setLastSavedSongId(saved.id);
            setLegacyTitle("");
            setLegacyLyrics("");
            setLegacyVideo(null);
            setLegacyVocal(null);
            setLegacyDuration(0);
            legacyFormRef.current?.reset();
        } catch (uploadError) {
            if ((uploadError as { code?: string } | null)?.code === "ERR_CANCELED") {
                setError("Đã huỷ tải lên.");
                return;
            }
            if (isUnauthorized(uploadError)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(uploadError, "Không thể tải bài hát lên."));
        } finally {
            legacyAbortRef.current = null;
            setLegacyLoading(false);
        }
    };

    const handleCancelLegacy = () => {
        const reqId = legacyRequestIdRef.current;
        legacyAbortRef.current?.abort();
        if (reqId) {
            void Promise.resolve(adminService.cancelUpload(reqId)).catch(() => undefined);
        }
    };

    const openSavedSongTest = async (songId: string) => {
        try {
            const detail = await adminService.getSong(songId);
            setSingTestTarget({
                mode: "song",
                id: detail.id,
                songName: detail.songName,
                videoUrl: detail.videoUrl,
                vocalUrl: detail.vocalUrl,
                listenDuration: detail.listenDuration,
                lyrics: detail.lyrics,
            });
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không mở được phòng hát thử."));
        }
    };

    const openDraftSingTest = () => {
        if (!draftId || !analyzed || segmentsDirtySinceAnalyze) return;
        setSingTestTarget({
            mode: "draft",
            id: draftId,
            songName: smartTitle.trim() || "Bản nháp đang cắt",
            videoUrl: analyzed.listenClipUrl,
            vocalUrl: analyzed.vocalPreviewUrl,
            listenDuration: analyzed.listenDuration,
            lyrics: smartLyrics.trim(),
        });
    };

    const activePreviewSrc = localPreviewUrl || serverVideoUrl;
    const hasLoadedSource = totalDuration > 0 && Boolean(activePreviewSrc);
    const segmentValidationError = hasLoadedSource ? validateSegments(segments, totalDuration) : "";
    const listenLen = round2(segments.listenEnd - segments.listenStart);
    const singLen = round2(segments.singEnd - segments.singStart);
    const lyricLines = smartLyrics.trim() ? smartLyrics.trim().split(/\r?\n/).filter(Boolean).length : 0;

    return (
        <div className="studio-root">
            {/* --- TOP COMPACT SOURCE BAR --- */}
            <div className="studio-source-bar">
                <div className="studio-segmented" role="group" aria-label="Nguồn bài hát">
                    <button
                        type="button"
                        className={`studio-seg-btn${mode === "youtube" ? " is-active" : ""}`}
                        onClick={() => handleSwitchMode("youtube")}
                        disabled={Boolean(busyStage) || legacyLoading}
                    >
                        <PixelIcon name="link" size={14} />
                        YouTube
                    </button>
                    <button
                        type="button"
                        className={`studio-seg-btn${mode === "local" ? " is-active" : ""}`}
                        onClick={() => handleSwitchMode("local")}
                        disabled={Boolean(busyStage) || legacyLoading}
                    >
                        <PixelIcon name="upload" size={14} />
                        File máy
                    </button>
                    <button
                        type="button"
                        className={`studio-seg-btn${mode === "legacy" ? " is-active" : ""}`}
                        onClick={() => handleSwitchMode("legacy")}
                        disabled={Boolean(busyStage) || legacyLoading}
                    >
                        <PixelIcon name="gear" size={14} />
                        2 file lẻ
                    </button>
                </div>

                {mode === "youtube" && (
                    <form className="studio-source-form" onSubmit={handleFetchYoutube}>
                        <input
                            id="smart-youtube-url"
                            className="p-input studio-source-input"
                            type="url"
                            value={youtubeUrl}
                            onChange={e => setYoutubeUrl(e.target.value)}
                            placeholder="Dán link youtube.com hoặc youtu.be..."
                            aria-label="Link YouTube bài hát"
                            disabled={Boolean(busyStage)}
                            required
                        />
                        <button
                            type="submit"
                            className="pbtn pbtn--primary pbtn--sm"
                            disabled={Boolean(busyStage) || !youtubeUrl.trim()}
                        >
                            <PixelIcon name={busyStage === "loading-source" ? "clock" : "play"} size={14} />
                            {busyStage === "loading-source" ? "Đang tải..." : "Nạp video"}
                        </button>
                    </form>
                )}

                {mode === "local" && (
                    <div className="studio-local-picker">
                        <input
                            id="smart-local-video"
                            className="p-input studio-file-input"
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.m4v"
                            onChange={handleLocalSourceChange}
                            aria-label="Chọn file video bài hát từ máy"
                            disabled={Boolean(busyStage)}
                        />
                    </div>
                )}

                {hasLoadedSource && mode !== "legacy" && (
                    <div className="studio-source-meta">
                        <span className="p-chip p-chip--sage p-tiny">
                            {formatSecondsLabel(totalDuration)}
                        </span>
                        {hasOfficialSubs && (
                            <span className="p-chip p-chip--mustard p-tiny">Có phụ đề gốc</span>
                        )}
                    </div>
                )}
            </div>

            {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
            {success && (
                <div className="admin-alert admin-alert--success studio-warn" role="status">
                    <span>{success}</span>
                    {lastSavedSongId && (
                        <button
                            type="button"
                            className="pbtn pbtn--primary pbtn--sm"
                            onClick={() => void openSavedSongTest(lastSavedSongId)}
                        >
                            <PixelIcon name="mic" size={13} />
                            Hát thử bài vừa lưu
                        </button>
                    )}
                </div>
            )}

            {busyStage && (
                <div className="studio-busy-bar" role="status">
                    <span>
                        <PixelIcon name="clock" size={14} /> {busyLabel} ({busySeconds}s)
                    </span>
                    <button type="button" className="pbtn pbtn--danger pbtn--sm" onClick={handleCancelSmart}>
                        Huỷ
                    </button>
                </div>
            )}

            {mode !== "legacy" ? (
                hasLoadedSource ? (
                    /* --- 2-COLUMN WORKBENCH --- */
                    <div className="studio-workbench">
                        {/* LEFT COLUMN: VIDEO + INTERACTIVE TIMELINE + PRECISION DECIMAL INPUTS */}
                        <div className="studio-pane studio-pane--left">
                            <div className="studio-monitor-wrap">
                                <video
                                    ref={sourceVideoRef}
                                    className="studio-monitor"
                                    src={activePreviewSrc}
                                    preload="metadata"
                                    crossOrigin={localPreviewUrl ? undefined : "use-credentials"}
                                    onTimeUpdate={handleVideoTimeUpdate}
                                    onPlay={() => setIsPlayingVideo(true)}
                                    onPause={() => setIsPlayingVideo(false)}
                                    onClick={togglePlayVideo}
                                />
                                <div className="studio-transport">
                                    <div className="studio-transport-btns">
                                        <button
                                            type="button"
                                            className="pbtn pbtn--sm studio-step-btn"
                                            onClick={togglePlayVideo}
                                            aria-label={isPlayingVideo ? "Tạm dừng" : "Phát"}
                                        >
                                            <PixelIcon name="play" size={13} />
                                            {isPlayingVideo ? "Dừng" : "Phát"}
                                        </button>
                                        <button
                                            type="button"
                                            className="pbtn pbtn--sm studio-step-btn"
                                            onClick={() => nudgePlayhead(-1)}
                                            title="Lùi 1 giây"
                                        >
                                            -1s
                                        </button>
                                        <button
                                            type="button"
                                            className="pbtn pbtn--sm studio-step-btn"
                                            onClick={() => nudgePlayhead(-0.1)}
                                            title="Lùi 0.1 giây"
                                        >
                                            -0.1s
                                        </button>
                                        <button
                                            type="button"
                                            className="pbtn pbtn--sm studio-step-btn"
                                            onClick={() => nudgePlayhead(0.1)}
                                            title="Tiến 0.1 giây"
                                        >
                                            +0.1s
                                        </button>
                                        <button
                                            type="button"
                                            className="pbtn pbtn--sm studio-step-btn"
                                            onClick={() => nudgePlayhead(1)}
                                            title="Tiến 1 giây"
                                        >
                                            +1s
                                        </button>
                                    </div>
                                    <code className="studio-clock">
                                        {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
                                    </code>
                                </div>
                            </div>

                            <DualTimelineTrack
                                totalDuration={totalDuration}
                                currentTime={currentTime}
                                segments={segments}
                                linked={linkedBoundary}
                                disabled={Boolean(busyStage)}
                                onSeek={seekVideoTo}
                                onChangeField={handleChangeSegment}
                            />

                            <div className="studio-link-row">
                                <span className="p-tiny p-muted">
                                    Kéo vạch trên thanh hoặc gõ trực tiếp số lẻ (vd: <code>44.5</code>, <code>1:04.5</code>, phím <code>↑/↓</code> chỉnh <code>0.1s</code>)
                                </span>
                                <button
                                    type="button"
                                    className={`p-chip p-tiny studio-link-toggle${linkedBoundary ? " p-chip--mustard" : ""}`}
                                    onClick={handleToggleLinked}
                                    disabled={Boolean(busyStage)}
                                    title="Khi bật, điểm cuối Đoạn mồi và điểm đầu Đoạn hát tự khớp liền nhau"
                                >
                                    <PixelIcon name="link" size={12} />
                                    {linkedBoundary ? "Nối đuôi tự động: Bật" : "Nối đuôi: Tắt"}
                                </button>
                            </div>

                            <div className="studio-seg-rows">
                                {/* Row 1: Listen Segment */}
                                <div className="studio-seg-row studio-seg-row--listen">
                                    <div className="studio-seg-row-head">
                                        <span className="studio-seg-badge">
                                            <i className="studio-swatch studio-swatch--listen" />
                                            Đoạn nghe mồi
                                            <strong>{listenLen.toFixed(1)}s</strong>
                                        </span>
                                        <button
                                            type="button"
                                            className="pbtn pbtn--secondary pbtn--sm"
                                            onClick={() => playPreviewRange(segments.listenStart, segments.listenEnd)}
                                        >
                                            <PixelIcon name="play" size={12} />
                                            Nghe mồi
                                        </button>
                                    </div>

                                    <div className="studio-seg-controls">
                                        <div className="studio-bound-group">
                                            <label className="studio-bound-label" htmlFor="seg-listen-start">Từ</label>
                                            <DecimalSecondInput
                                                id="seg-listen-start"
                                                value={segments.listenStart}
                                                max={totalDuration}
                                                liveRange={[0, Math.max(0, round2(segments.listenEnd - MIN_LISTEN_SEC))]}
                                                disabled={Boolean(busyStage)}
                                                ariaLabel="Giây bắt đầu đoạn nghe mồi"
                                                onChange={val => handleChangeSegment("listenStart", val)}
                                            />
                                            <button
                                                type="button"
                                                className="pbtn pbtn--sm studio-snap-btn"
                                                onClick={() => snapFromPlayhead("listenStart")}
                                                disabled={Boolean(busyStage)}
                                                title="Lấy đúng giây hiện tại của video"
                                            >
                                                Chốt
                                            </button>
                                        </div>

                                        <div className="studio-bound-group">
                                            <label className="studio-bound-label" htmlFor="seg-listen-end">Đến</label>
                                            <DecimalSecondInput
                                                id="seg-listen-end"
                                                value={segments.listenEnd}
                                                max={totalDuration}
                                                liveRange={[
                                                    round2(segments.listenStart + MIN_LISTEN_SEC),
                                                    linkedBoundary
                                                        ? Math.max(
                                                              round2(segments.listenStart + MIN_LISTEN_SEC),
                                                              round2(segments.singEnd - MIN_SING_SEC),
                                                          )
                                                        : totalDuration,
                                                ]}
                                                disabled={Boolean(busyStage)}
                                                ariaLabel="Giây kết thúc đoạn nghe mồi"
                                                onChange={val => handleChangeSegment("listenEnd", val)}
                                            />
                                            <button
                                                type="button"
                                                className="pbtn pbtn--sm studio-snap-btn"
                                                onClick={() => snapFromPlayhead("listenEnd")}
                                                disabled={Boolean(busyStage)}
                                                title="Lấy đúng giây hiện tại của video"
                                            >
                                                Chốt
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Row 2: Sing Segment */}
                                <div className="studio-seg-row studio-seg-row--sing">
                                    <div className="studio-seg-row-head">
                                        <span className="studio-seg-badge">
                                            <i className="studio-swatch studio-swatch--sing" />
                                            Đoạn hát tiếp
                                            <strong>{singLen.toFixed(1)}s</strong>
                                        </span>
                                        <button
                                            type="button"
                                            className="pbtn pbtn--primary pbtn--sm"
                                            onClick={() => playPreviewRange(segments.singStart, segments.singEnd)}
                                        >
                                            <PixelIcon name="play" size={12} />
                                            Nghe đoạn hát
                                        </button>
                                    </div>

                                    <div className="studio-seg-controls">
                                        <div className="studio-bound-group">
                                            <label className="studio-bound-label" htmlFor="seg-sing-start">Từ</label>
                                            <DecimalSecondInput
                                                id="seg-sing-start"
                                                value={segments.singStart}
                                                max={totalDuration}
                                                liveRange={[
                                                    linkedBoundary ? round2(segments.listenStart + MIN_LISTEN_SEC) : 0,
                                                    Math.max(0, round2(segments.singEnd - MIN_SING_SEC)),
                                                ]}
                                                disabled={Boolean(busyStage)}
                                                ariaLabel="Giây bắt đầu đoạn hát"
                                                onChange={val => handleChangeSegment("singStart", val)}
                                            />
                                            <button
                                                type="button"
                                                className="pbtn pbtn--sm studio-snap-btn"
                                                onClick={() => snapFromPlayhead("singStart")}
                                                disabled={Boolean(busyStage)}
                                                title="Lấy đúng giây hiện tại của video"
                                            >
                                                Chốt
                                            </button>
                                        </div>

                                        <div className="studio-bound-group">
                                            <label className="studio-bound-label" htmlFor="seg-sing-end">Đến</label>
                                            <DecimalSecondInput
                                                id="seg-sing-end"
                                                value={segments.singEnd}
                                                max={totalDuration}
                                                liveRange={[round2(segments.singStart + MIN_SING_SEC), totalDuration]}
                                                disabled={Boolean(busyStage)}
                                                ariaLabel="Giây kết thúc đoạn hát"
                                                onChange={val => handleChangeSegment("singEnd", val)}
                                            />
                                            <button
                                                type="button"
                                                className="pbtn pbtn--sm studio-snap-btn"
                                                onClick={() => snapFromPlayhead("singEnd")}
                                                disabled={Boolean(busyStage)}
                                                title="Lấy đúng giây hiện tại của video"
                                            >
                                                Chốt
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {segmentValidationError && (
                                <div className="admin-alert admin-alert--error" role="alert">
                                    {segmentValidationError}
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: EXTRACT, PREVIEW STEMS, EDIT METADATA & SAVE */}
                        <form className="studio-pane studio-pane--right" onSubmit={handleCommitSmart}>
                            <div className="p-field">
                                <label className="p-label" htmlFor="smart-song-title">
                                    <PixelIcon name="note" size={14} />
                                    Tên bài hát
                                </label>
                                <input
                                    id="smart-song-title"
                                    className="p-input"
                                    type="text"
                                    maxLength={MAX_SONG_TITLE_LENGTH}
                                    value={smartTitle}
                                    onChange={e => setSmartTitle(e.target.value)}
                                    placeholder="Nhập tên bài hát..."
                                    required
                                    disabled={Boolean(busyStage)}
                                />
                            </div>

                            <div className="studio-extract-box">
                                <div className="studio-extract-actions">
                                    <button
                                        type="button"
                                        className="pbtn pbtn--accent studio-extract-btn"
                                        onClick={handleAnalyzeSmart}
                                        disabled={Boolean(busyStage) || Boolean(segmentValidationError)}
                                    >
                                        <PixelIcon name={busyStage === "analyzing" ? "clock" : "scissors"} size={15} />
                                        {analyzed
                                            ? segmentsDirtySinceAnalyze
                                                ? "Tách lại theo mốc mới"
                                                : "Tách lại"
                                            : "Tách giọng & Lấy lời"}
                                    </button>
                                    <button
                                        type="button"
                                        className={`pbtn pbtn--sm${vocalOverrideFile ? " pbtn--secondary" : ""}`}
                                        onClick={() => setShowVocalOverride(s => !s)}
                                        disabled={Boolean(busyStage)}
                                        title="Tuỳ chọn tự tải file vocal riêng thay vì tách tự động"
                                    >
                                        <PixelIcon name="mic" size={13} />
                                        {vocalOverrideFile ? "Đã chọn vocal riêng" : "Vocal riêng"}
                                    </button>
                                </div>

                                {showVocalOverride && (
                                    <div className="studio-override-box">
                                        <input
                                            id="smart-vocal-override"
                                            className="p-input studio-file-input"
                                            type="file"
                                            accept="audio/*"
                                            aria-label="Chọn file giọng gốc riêng"
                                            onChange={handleVocalOverrideChange}
                                            disabled={Boolean(busyStage)}
                                        />
                                        {vocalOverrideFile && (
                                            <button
                                                type="button"
                                                className="pbtn pbtn--sm"
                                                onClick={() => {
                                                    setVocalOverrideFile(null);
                                                    if (analyzed) setSegmentsDirtySinceAnalyze(true);
                                                }}
                                            >
                                                Bỏ chọn
                                            </button>
                                        )}
                                    </div>
                                )}

                                {analyzed && (
                                    <div className={`studio-result-card${segmentsDirtySinceAnalyze ? " is-stale" : ""}`}>
                                        <div className="studio-result-tabs">
                                            <button
                                                type="button"
                                                className={`studio-mini-tab${previewTab === "vocal" ? " is-active" : ""}`}
                                                onClick={() => setPreviewTab("vocal")}
                                            >
                                                Vocal đã tách ({analyzed.voicedSampleCount} nốt)
                                            </button>
                                            <button
                                                type="button"
                                                className={`studio-mini-tab${previewTab === "clip" ? " is-active" : ""}`}
                                                onClick={() => setPreviewTab("clip")}
                                            >
                                                Clip mồi ({analyzed.listenDuration.toFixed(1)}s)
                                            </button>
                                            <span className="studio-source-tag">
                                                {formatLyricsSourceTag(analyzed.lyricsSource)}
                                            </span>
                                            {!segmentsDirtySinceAnalyze && (
                                                <button
                                                    type="button"
                                                    className="pbtn pbtn--secondary pbtn--sm"
                                                    onClick={openDraftSingTest}
                                                    title="Mở phòng hát thử & chấm điểm ngay trên bản nháp trước khi lưu"
                                                >
                                                    <PixelIcon name="mic" size={12} />
                                                    Hát thử nháp
                                                </button>
                                            )}
                                        </div>

                                        {previewTab === "vocal" ? (
                                            <audio
                                                className="studio-audio"
                                                src={adminService.resolveMediaUrl(analyzed.vocalPreviewUrl)}
                                                controls
                                                preload="metadata"
                                                crossOrigin="use-credentials"
                                            />
                                        ) : (
                                            <video
                                                className="studio-clip-preview"
                                                src={adminService.resolveMediaUrl(analyzed.listenClipUrl)}
                                                controls
                                                preload="metadata"
                                                crossOrigin="use-credentials"
                                            />
                                        )}

                                        {segmentsDirtySinceAnalyze && (
                                            <p className="studio-stale-hint">
                                                Bạn vừa đổi mốc giây — bấm &ldquo;Tách lại theo mốc mới&rdquo; để cập nhật.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {analyzed?.lyricsWarning && (
                                    <div className="admin-alert admin-alert--warn studio-warn" role="alert">
                                        <span>{analyzed.lyricsWarning}</span>
                                        {onOpenAiConfig && analyzed.lyricsSource === "MANUAL_REQUIRED" && (
                                            <button
                                                type="button"
                                                className="pbtn pbtn--sm"
                                                onClick={onOpenAiConfig}
                                            >
                                                <PixelIcon name="key" size={13} />
                                                Cấu hình AI
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="p-field studio-lyrics-field">
                                <div className="studio-label-row">
                                    <label className="p-label" htmlFor="smart-song-lyrics" style={{ marginBottom: 0 }}>
                                        <PixelIcon name="chat" size={14} />
                                        Lời đoạn hát tiếp
                                    </label>
                                    <span className="p-tiny p-muted">
                                        {lyricLines > 0 ? `${lyricLines} dòng` : "Chưa có lời"}
                                    </span>
                                </div>
                                <textarea
                                    id="smart-song-lyrics"
                                    className="p-input studio-lyrics-textarea"
                                    rows={7}
                                    maxLength={MAX_SONG_LYRICS_LENGTH}
                                    value={smartLyrics}
                                    onChange={e => setSmartLyrics(e.target.value)}
                                    placeholder={
                                        analyzed
                                            ? "Nhập hoặc chỉnh lại lời của đoạn hát tiếp..."
                                            : "Bấm 'Tách giọng & Lấy lời' để điền tự động, hoặc dán trực tiếp vào đây..."
                                    }
                                    required
                                    disabled={Boolean(busyStage)}
                                />
                            </div>

                            <button
                                type="submit"
                                className="pbtn pbtn--primary pbtn--block"
                                disabled={
                                    Boolean(busyStage) ||
                                    !analyzed ||
                                    segmentsDirtySinceAnalyze ||
                                    !smartTitle.trim() ||
                                    !smartLyrics.trim()
                                }
                            >
                                <PixelIcon name={busyStage === "committing" ? "clock" : "upload"} size={16} />
                                {busyStage === "committing" ? "Đang lưu..." : "Lưu vào thư viện"}
                            </button>
                        </form>
                    </div>
                ) : (
                    /* CALM EMPTY STATE WHEN NO VIDEO IS LOADED YET */
                    <div
                        className="studio-empty"
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleDropSourceFile}
                    >
                        <PixelIcon name={mode === "youtube" ? "link" : "upload"} size={24} />
                        <p>
                            {mode === "youtube"
                                ? "Dán link YouTube bài hát ở thanh trên để mở bàn cắt (hoặc kéo thả thẳng file video vào đây)."
                                : "Chọn hoặc kéo thả file video bài hát (.mp4, .webm, .mov) vào đây để mở bàn cắt."}
                        </p>
                    </div>
                )
            ) : (
                /* --- COMPACT 2-COLUMN LEGACY FORM --- */
                <form ref={legacyFormRef} id="form-upload" className="studio-legacy-grid" onSubmit={handleLegacyUpload}>
                    <div className="studio-pane">
                        <div className="p-field">
                            <label className="p-label" htmlFor="song-title">
                                <PixelIcon name="note" size={14} />
                                Tên bài hát
                            </label>
                            <input
                                id="song-title"
                                className="p-input"
                                type="text"
                                value={legacyTitle}
                                maxLength={MAX_SONG_TITLE_LENGTH}
                                onChange={e => setLegacyTitle(e.target.value)}
                                required
                                placeholder="Nhập tên bài hát..."
                            />
                        </div>

                        <div className="p-field">
                            <label className="p-label" htmlFor="main-video">
                                <PixelIcon name="play" size={14} />
                                Video đoạn mồi đã cắt sẵn
                            </label>
                            <input
                                id="main-video"
                                className="p-input"
                                type="file"
                                accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.m4v"
                                onChange={handleLegacyVideoChange}
                                required
                            />
                            {legacyDuration > 0 && (
                                <span className="admin-note" style={{ marginTop: 4 }}>
                                    <PixelIcon name="check" size={13} />
                                    Thời lượng: {legacyDuration.toFixed(1)}s
                                </span>
                            )}
                        </div>

                        <div className="p-field">
                            <label className="p-label" htmlFor="vocal-file">
                                <PixelIcon name="mic" size={14} />
                                File giọng gốc đã tách sẵn
                            </label>
                            <input
                                id="vocal-file"
                                className="p-input"
                                type="file"
                                accept="audio/*"
                                onChange={handleLegacyVocalChange}
                                required
                            />
                        </div>
                    </div>

                    <div className="studio-pane">
                        <div className="p-field studio-lyrics-field">
                            <label className="p-label" htmlFor="song-lyrics">
                                <PixelIcon name="chat" size={14} />
                                Lời đoạn hát tiếp
                            </label>
                            <textarea
                                id="song-lyrics"
                                className="p-input studio-lyrics-textarea"
                                rows={7}
                                value={legacyLyrics}
                                maxLength={MAX_SONG_LYRICS_LENGTH}
                                onChange={e => setLegacyLyrics(e.target.value)}
                                required
                                placeholder="Dán lời bài hát vào đây..."
                            />
                        </div>

                        <div className="studio-legacy-actions">
                            {legacyLoading && (
                                <button type="button" className="pbtn pbtn--sm" onClick={handleCancelLegacy}>
                                    Huỷ
                                </button>
                            )}
                            <button
                                type="submit"
                                className="pbtn pbtn--primary pbtn--block"
                                disabled={legacyLoading}
                            >
                                <PixelIcon name={legacyLoading ? "clock" : "upload"} size={16} />
                                {legacyLoading ? "Đang tải lên..." : "Tải lên thư viện"}
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {singTestTarget && (
                <AdminSingTestModal
                    target={singTestTarget}
                    onClose={() => setSingTestTarget(null)}
                    onUnauthorized={onUnauthorized}
                />
            )}
        </div>
    );
};

export default AdminUploadPanel;
