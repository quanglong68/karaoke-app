import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from "../constants/api";

const AdminPage: React.FC = () => {
    const [title, setTitle] = useState('');
    const [lyrics, setLyrics] = useState('');
    const [mainVideo, setMainVideo] = useState<File | null>(null);
    const [vocalFile, setVocalFile] = useState<File | null>(null);
    const [duration, setDuration] = useState<number>(0);
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const handleMainVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setMainVideo(file);
            const videoElement = document.createElement('video');
            videoElement.preload = 'metadata';
            videoElement.onloadedmetadata = () => {
                window.URL.revokeObjectURL(videoElement.src);
                setDuration(videoElement.duration);
            };
            videoElement.src = URL.createObjectURL(file);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mainVideo || !vocalFile || !title || !lyrics) {
            return alert("⚠️ Vui lòng điền và chọn đủ các trường!");
        }

        setLoading(true);
        const formData = new FormData();
        formData.append("mainVideo", mainVideo);
        formData.append("vocalFile", vocalFile);
        formData.append("title", title);
        formData.append("lyrics", lyrics);
        formData.append("duration", duration.toString());

        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/upload-song`, {
                method: "POST",
                body: formData,
            });

            if (response.ok) {
                alert("🎉 Đã lên bài thành công!");
                setTitle(''); setLyrics(''); setMainVideo(null); setVocalFile(null); setDuration(0);
                (document.getElementById('form-upload') as HTMLFormElement).reset();
            } else {
                const errorText = await response.text();
                alert("❌ Lỗi Backend: " + errorText);
            }
        } catch (error) {
            console.error(error);
            alert("❌ Không thể kết nối với Backend!");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #121212, #1e1e24)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px 20px', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(10px)', padding: '40px', borderRadius: '20px', boxShadow: '0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.05)', maxWidth: '650px', width: '100%', color: '#e0e0e0' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                    <h2 style={{ margin: 0, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>THÊM BÀI HÁT</h2>
                    <button onClick={() => navigate('/')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}> Về Sảnh</button>
                </div>

                <form id="form-upload" onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    <div>
                        <label style={{ fontWeight: 'bold', color: '#aaa' }}>1. Tên bài hát:</label>
                        <input style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', boxShadow: 'inset 0 4px 6px rgba(0,0,0,0.5)', boxSizing: 'border-box' }} type="text" value={title} onChange={e => setTitle(e.target.value)} required placeholder="VD: Ex Hate Me..." />
                    </div>

                    <div style={{ padding: '20px', background: 'linear-gradient(145deg, #1a2a3a, #111d29)', borderRadius: '15px', boxShadow: '8px 8px 16px rgba(0,0,0,0.4), -8px -8px 16px rgba(255,255,255,0.02)', border: '1px solid rgba(0, 150, 255, 0.2)' }}>
                        <label style={{ color: '#66b2ff', fontWeight: 'bold' }}>🎬 2. File Video Beat (Phát cho người chơi):</label><br />
                        <input type="file" accept="video/mp4" onChange={handleMainVideoChange} required style={{ marginTop: '10px', color: '#fff' }} />
                        {duration > 0 && <div style={{ color: '#4CAF50', marginTop: '8px', fontSize: '14px', fontWeight: 'bold', textShadow: '0 0 5px rgba(76, 175, 80, 0.5)' }}>✅ Đã nhận diện thời lượng: {duration.toFixed(2)}s</div>}
                    </div>

                    <div style={{ padding: '20px', background: 'linear-gradient(145deg, #3a1a1f, #291114)', borderRadius: '15px', boxShadow: '8px 8px 16px rgba(0,0,0,0.4), -8px -8px 16px rgba(255,255,255,0.02)', border: '1px solid rgba(255, 100, 100, 0.2)' }}>
                        <label style={{ color: '#ff6666', fontWeight: 'bold' }}>🎙️ 3.File Voice Gốc (Cho AI phân tích Tone):</label><br />
                        <input type="file" accept="audio/*,video/mp4" onChange={e => setVocalFile(e.target.files?.[0] || null)} required style={{ marginTop: '10px', color: '#fff' }} />
                    </div>

                    <div>
                        <label style={{ fontWeight: 'bold', color: '#aaa' }}>4. Lời bài hát:</label>
                        <textarea style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', boxShadow: 'inset 0 4px 6px rgba(0,0,0,0.5)', boxSizing: 'border-box', resize: 'vertical' }} rows={6} value={lyrics} onChange={e => setLyrics(e.target.value)} required placeholder="Dán lời bài hát vào đây..." />
                    </div>

                    <button type="submit" disabled={loading} style={{ padding: '16px', background: loading ? '#555' : 'linear-gradient(145deg, #00c6ff, #0072ff)', color: 'white', border: 'none', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', borderRadius: '12px', fontSize: '16px', boxShadow: loading ? 'none' : '0 10px 20px rgba(0, 114, 255, 0.4)', transition: 'transform 0.1s', textTransform: 'uppercase' }}>
                        {loading ? "⚙️ Đang xử lý AI..." : " Xác nhận nộp lên Server"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminPage;