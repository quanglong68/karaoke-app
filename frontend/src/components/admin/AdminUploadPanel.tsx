import React, { useRef, useState } from 'react';
import PixelIcon from "../ui/PixelIcon";
import { adminService, getAdminErrorMessage, isUnauthorized } from "../../services/adminService";

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;
const MAX_SONG_TITLE_LENGTH = 120;
const MAX_SONG_LYRICS_LENGTH = 10_000;
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v'];
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.aac'];

const hasAllowedExtension = (fileName: string, allowed: string[]) => {
    const lower = fileName.toLowerCase();
    return allowed.some(extension => lower.endsWith(extension));
};

const createRequestId = () => {
    const randomUuid = globalThis.crypto?.randomUUID?.();
    return randomUuid ?? `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const readVideoDuration = (file: File): Promise<number> => new Promise((resolve, reject) => {
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    const objectUrl = URL.createObjectURL(file);
    videoElement.onloadedmetadata = () => {
        window.URL.revokeObjectURL(objectUrl);
        resolve(Number.isFinite(videoElement.duration) ? videoElement.duration : 0);
    };
    videoElement.onerror = () => {
        window.URL.revokeObjectURL(objectUrl);
        reject(new Error('METADATA_ERROR'));
    };
    videoElement.src = objectUrl;
});

interface AdminUploadPanelProps {
    onUnauthorized: () => void;
}

const AdminUploadPanel: React.FC<AdminUploadPanelProps> = ({ onUnauthorized }) => {
    const [title, setTitle] = useState('');
    const [lyrics, setLyrics] = useState('');
    const [mainVideo, setMainVideo] = useState<File | null>(null);
    const [vocalFile, setVocalFile] = useState<File | null>(null);
    const [duration, setDuration] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [uploadController, setUploadController] = useState<AbortController | null>(null);
    const formRef = useRef<HTMLFormElement | null>(null);
    const requestIdRef = useRef<string | null>(null);
    const videoSelectionSeqRef = useRef(0);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const validateFile = (file: File, allowed: string[]): string | null => {
        if (file.size > MAX_FILE_BYTES) {
            return 'File quá lớn (tối đa 200MB mỗi file).';
        }
        if (!hasAllowedExtension(file.name, allowed)) {
            return `Định dạng không hỗ trợ. Chỉ chấp nhận: ${allowed.join(', ')}`;
        }
        return null;
    };

    const handleMainVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const seq = ++videoSelectionSeqRef.current;
        const file = e.target.files?.[0];
        if (!file) {
            setMainVideo(null);
            setDuration(0);
            return;
        }
        const fileError = validateFile(file, VIDEO_EXTENSIONS);
        if (fileError) {
            setError(fileError);
            e.target.value = '';
            setMainVideo(null);
            setDuration(0);
            return;
        }
        setError('');
        setMainVideo(file);
        setDuration(0);
        readVideoDuration(file)
            .then(detectedDuration => {
                if (videoSelectionSeqRef.current === seq) {
                    setDuration(detectedDuration);
                }
            })
            .catch(() => {
                if (videoSelectionSeqRef.current === seq) {
                    setDuration(0);
                    setError('Không đọc được thời lượng video.');
                }
            });
    };

    const handleVocalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        if (file) {
            const fileError = validateFile(file, AUDIO_EXTENSIONS);
            if (fileError) {
                setError(fileError);
                e.target.value = '';
                setVocalFile(null);
                return;
            }
        }
        setError('');
        setVocalFile(file);
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (!mainVideo || !vocalFile || !title.trim() || !lyrics.trim()) {
            setError('Vui lòng điền và chọn đủ các trường.');
            return;
        }
        if (mainVideo.size + vocalFile.size > MAX_TOTAL_BYTES) {
            setError('Tổng dung lượng video + giọng gốc tối đa 400MB.');
            return;
        }
        if (!Number.isFinite(duration) || duration <= 0) {
            setError('Chưa đọc được thời lượng video hợp lệ.');
            return;
        }

        const controller = new AbortController();
        setUploadController(controller);
        setLoading(true);
        const requestId = createRequestId();
        requestIdRef.current = requestId;
        const formData = new FormData();
        formData.append("requestId", requestId);
        formData.append("mainVideo", mainVideo);
        formData.append("vocalFile", vocalFile);
        formData.append("title", title.trim());
        formData.append("lyrics", lyrics.trim());
        formData.append("duration", duration.toString());

        try {
            await adminService.uploadSong(formData, controller.signal);
            setSuccess('Đã thêm bài hát thành công!');
            setTitle('');
            setLyrics('');
            setMainVideo(null);
            setVocalFile(null);
            setDuration(0);
            formRef.current?.reset();
        } catch (uploadError) {
            if ((uploadError as { code?: string } | null)?.code === 'ERR_CANCELED') {
                setError('Đã huỷ tải lên.');
                return;
            }
            if (isUnauthorized(uploadError)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(uploadError, 'Không thể tải bài hát lên.'));
        } finally {
            setUploadController(null);
            setLoading(false);
        }
    };

    const handleCancelUpload = () => {
        const requestId = requestIdRef.current;
        uploadController?.abort();
        if (requestId) {
            // Aborting only drops the HTTP connection; tell the server to stop the
            // Cloudinary uploads / pitch extraction that are already running.
            void adminService.cancelUpload(requestId).catch(() => undefined);
        }
    };

    return (
        <>
            <p className="p-muted p-tiny">
                Tải lên video beat, file giọng gốc và lời bài hát để thêm vào danh sách phát.
            </p>

            <form ref={formRef} id="form-upload" className="admin-form" onSubmit={handleUpload}>
                <div className="p-field">
                    <label className="p-label" htmlFor="song-title">
                        <PixelIcon name="note" size={15} />
                        1. Tên bài hát
                    </label>
                    <input
                        id="song-title"
                        className="p-input"
                        type="text"
                        value={title}
                        maxLength={MAX_SONG_TITLE_LENGTH}
                        onChange={e => setTitle(e.target.value)}
                        required
                        placeholder="Ví dụ: Ex Hate Me..."
                    />
                </div>

                <section className="admin-section admin-section--video">
                    <label className="p-label" htmlFor="main-video">
                        <PixelIcon name="play" size={15} />
                        2. File video beat (phát cho người chơi)
                    </label>
                    <input
                        id="main-video"
                        className="p-input"
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.m4v"
                        onChange={handleMainVideoChange}
                        required
                    />
                    {duration > 0 && (
                        <div className="admin-note">
                            <PixelIcon name="check" size={14} />
                            Đã nhận diện thời lượng: {duration.toFixed(2)}s
                        </div>
                    )}
                </section>

                <section className="admin-section admin-section--audio">
                    <label className="p-label" htmlFor="vocal-file">
                        <PixelIcon name="mic" size={15} />
                        3. File giọng gốc (cho AI phân tích tone)
                    </label>
                    <input
                        id="vocal-file"
                        className="p-input"
                        type="file"
                        accept="audio/*"
                        onChange={handleVocalChange}
                        required
                    />
                </section>

                <div className="p-field">
                    <label className="p-label" htmlFor="song-lyrics">
                        <PixelIcon name="chat" size={15} />
                        4. Lời bài hát
                    </label>
                    <textarea
                        id="song-lyrics"
                        className="p-input"
                        rows={6}
                        value={lyrics}
                        maxLength={MAX_SONG_LYRICS_LENGTH}
                        onChange={e => setLyrics(e.target.value)}
                        required
                        placeholder="Dán lời bài hát vào đây..."
                    />
                </div>

                {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
                {success && <div className="admin-alert admin-alert--success" role="status">{success}</div>}

                <button
                    type="submit"
                    className="pbtn pbtn--primary pbtn--block pbtn--xl"
                    disabled={loading}
                >
                    <PixelIcon name={loading ? "clock" : "upload"} size={18} />
                    {loading ? "Đang xử lý..." : "Xác nhận tải lên"}
                </button>
                {loading && (
                    <button
                        type="button"
                        className="pbtn pbtn--secondary pbtn--block"
                        onClick={handleCancelUpload}
                    >
                        Huỷ tải lên
                    </button>
                )}
            </form>
        </>
    );
};

export default AdminUploadPanel;
