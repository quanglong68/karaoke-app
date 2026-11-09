import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from "../constants/api";
import PixelIcon from "../components/ui/PixelIcon";

const ADMIN_KEY_STORAGE = "adminKey";
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.mkv', '.m4v'];
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.aac'];

const hasAllowedExtension = (fileName: string, allowed: string[]) => {
    const lower = fileName.toLowerCase();
    return allowed.some(extension => lower.endsWith(extension));
};

const AdminPage: React.FC = () => {
    const [title, setTitle] = useState('');
    const [lyrics, setLyrics] = useState('');
    const [mainVideo, setMainVideo] = useState<File | null>(null);
    const [vocalFile, setVocalFile] = useState<File | null>(null);
    const [duration, setDuration] = useState<number>(0);
    const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const navigate = useNavigate();

    const validateFile = (file: File, allowed: string[]): string | null => {
        if (file.size > MAX_FILE_BYTES) {
            return 'File quá lớn (tối đa 200MB).';
        }
        if (!hasAllowedExtension(file.name, allowed)) {
            return `Định dạng không hỗ trợ. Chỉ chấp nhận: ${allowed.join(', ')}`;
        }
        return null;
    };

    const handleMainVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            setMainVideo(null);
            return;
        }
        const fileError = validateFile(file, VIDEO_EXTENSIONS);
        if (fileError) {
            setError(fileError);
            e.target.value = '';
            setMainVideo(null);
            return;
        }
        setError('');
        setMainVideo(file);
        const videoElement = document.createElement('video');
        videoElement.preload = 'metadata';
        videoElement.onloadedmetadata = () => {
            window.URL.revokeObjectURL(videoElement.src);
            setDuration(Number.isFinite(videoElement.duration) ? videoElement.duration : 0);
        };
        videoElement.onerror = () => {
            window.URL.revokeObjectURL(videoElement.src);
            setDuration(0);
            setError('Không đọc được thời lượng video.');
        };
        videoElement.src = URL.createObjectURL(file);
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
        if (!adminKey.trim()) {
            setError('Vui lòng nhập API key quản trị (ADMIN_API_KEY).');
            return;
        }
        if (!mainVideo || !vocalFile || !title.trim() || !lyrics.trim()) {
            setError('Vui lòng điền và chọn đủ các trường.');
            return;
        }
        if (!Number.isFinite(duration) || duration <= 0) {
            setError('Chưa đọc được thời lượng video hợp lệ.');
            return;
        }

        sessionStorage.setItem(ADMIN_KEY_STORAGE, adminKey.trim());
        setLoading(true);
        const formData = new FormData();
        formData.append("mainVideo", mainVideo);
        formData.append("vocalFile", vocalFile);
        formData.append("title", title.trim());
        formData.append("lyrics", lyrics.trim());
        formData.append("duration", duration.toString());

        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/upload-song`, {
                method: "POST",
                headers: { "X-Admin-Key": adminKey.trim() },
                body: formData,
            });

            if (response.ok) {
                setSuccess('Đã thêm bài hát thành công!');
                setTitle(''); setLyrics(''); setMainVideo(null); setVocalFile(null); setDuration(0);
                (document.getElementById('form-upload') as HTMLFormElement | null)?.reset();
            } else {
                let message = 'Không thể tải bài hát lên.';
                try {
                    const body = await response.json() as { code?: string; message?: string };
                    if (response.status === 401) {
                        message = 'API key không đúng hoặc chưa được cấu hình.';
                    } else if (body?.message) {
                        message = body.message;
                    }
                } catch {
                    // keep generic message when the body is not JSON
                }
                setError(message);
            }
        } catch (uploadError) {
            console.error(uploadError);
            setError('Không thể kết nối với Backend.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-page">
            <div className="admin-card">
                <div className="p-window-bar">
                    <span className="p-window-dots" aria-hidden="true">
                        <i /><i /><i />
                    </span>
                    <span className="p-window-title pixel-label">music-upload.exe</span>
                    <button type="button" className="pbtn pbtn--sm" onClick={() => navigate('/')}>
                        <PixelIcon name="arrowLeft" size={15} />
                        Về sảnh
                    </button>
                </div>

                <div className="admin-body">
                    <div className="admin-head">
                        <h1 className="admin-title">
                            <PixelIcon name="upload" size={22} />
                            Thêm bài hát
                        </h1>
                        <span className="p-chip p-chip--rose">
                            <PixelIcon name="warning" size={13} />
                            Khu vực quản trị
                        </span>
                    </div>

                    <p className="p-muted p-tiny">
                        Tải lên video beat, file giọng gốc và lời bài hát để thêm vào danh sách phát.
                    </p>

                    <form id="form-upload" className="admin-form" onSubmit={handleUpload}>
                        <div className="p-field">
                            <label className="p-label" htmlFor="admin-key">
                                <PixelIcon name="gear" size={15} />
                                API key quản trị
                            </label>
                            <input
                                id="admin-key"
                                className="p-input"
                                type="password"
                                value={adminKey}
                                onChange={e => setAdminKey(e.target.value)}
                                placeholder="Nhập ADMIN_API_KEY"
                                autoComplete="off"
                                required
                            />
                        </div>

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
                                maxLength={120}
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
                                accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
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
                                maxLength={10000}
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
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AdminPage;
