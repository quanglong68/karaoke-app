import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";

import VideoPlayer from "../components/VideoPlayer";
import type { SocketMessage, RtcSignalPayload } from "../types/socket";
import type { GameState, MusicInfo } from "../types/game";
import { websocketService } from "../services/websocketService";
import type { User } from "../types/user";
import type { PerformanceResultPayload } from "../types/room";
import { storage } from "../utils/storage";

export default function GamePage() {
    const { roomId } = useParams();
    const [messages, setMessages] = useState<SocketMessage[]>([]);
    const [inputMessage, setInputMessage] = useState("");
    const userName = storage.getUserName() || "Người chơi ẩn danh";
    const userId = storage.getUserId();
    const [perfCountdown, setPerfCountdown] = useState(30);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const pitchContourRef = useRef<number[]>([]);
    const pitchIntervalRef = useRef<any>(null);

    const [gameState, setGameState] = useState<GameState>("LOBBY");
    const [clickCount, setClickCount] = useState(0);
    const [winnerUser, setWinnerUser] = useState<User | null>(null);
    const [notification, setNotification] = useState<string | null>(null);
    const [countdownNum, setCountdownNum] = useState(3);

    const [myScore, setMyScore] = useState(0);
    const [playerList, setPlayerList] = useState<User[]>([]);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [hasMicPermission, setHasMicPermission] = useState(false);
    const [micPermissionAsked, setMicPermissionAsked] = useState(false);

    const fullTranscriptRef = useRef("");
    const speechRecognitionRef = useRef<any>(null);

    const currentSongLyricsRef = useRef("");

    const sendRoomMessage = (type: GameState, content: SocketMessage["content"], senderOverride?: string) => {
        if (!roomId) return;
        websocketService.sendMessage(roomId, {
            type,
            content,
            sender: senderOverride ?? userId,
            roomId: roomId,
        });
    };

    const evaluateLyricsResult = (userSangText: string) => {
        const cleanUserText = userSangText.toLowerCase();

        console.log("===============================");
        console.log("🎤 LỜI BÀI HÁT GỬI ĐI:", cleanUserText);
        console.log("🎵 MẢNG TẦN SỐ (TONE) GỬI ĐI:", pitchContourRef.current);
        console.log("===============================");
        sendRoomMessage("USER_LYRICS", {
            lyrics: cleanUserText,
            pitchContour: pitchContourRef.current
        });
    };

    useEffect(() => {
        if (gameState === "PERFORMANCE") {
            setPerfCountdown(30); // Reset về 30 giây khi bắt đầu hát
            const timer = setInterval(() => {
                setPerfCountdown((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState]);


    useEffect(() => {
        const isSinger = winnerUser?.userId === userId;
        if (gameState === "PERFORMANCE" && isSinger) {
            fullTranscriptRef.current = "";
            pitchContourRef.current = []; // Xóa dữ liệu cũ

            // 1. KHỞI ĐỘNG MÁY ĐO TẦN SỐ (PITCH DETECTOR)
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass && localStreamRef.current) {
                audioContextRef.current = new AudioContextClass();
                analyserRef.current = audioContextRef.current.createAnalyser();
                analyserRef.current.fftSize = 2048;
                const source = audioContextRef.current.createMediaStreamSource(localStreamRef.current);
                source.connect(analyserRef.current);

                // Cứ 0.2s đo 1 lần 
                pitchIntervalRef.current = setInterval(() => {
                    if (!analyserRef.current || !audioContextRef.current) return;
                    const buffer = new Float32Array(analyserRef.current.fftSize);
                    analyserRef.current.getFloatTimeDomainData(buffer);
                    const hz = autoCorrelate(buffer, audioContextRef.current.sampleRate);

                    // 👉 BỘ LỌC NHIỄU: Chỉ chấp nhận tần số giọng người thật (80Hz - 1000Hz)
                    let validHz = 0.0;
                    if (hz !== -1 && hz >= 80 && hz <= 1000) {
                        validHz = Number(hz.toFixed(2));
                    }

                    pitchContourRef.current.push(validHz);
                }, 200);
            }

            // 2. KHỞI ĐỘNG CỖ MÁY AI BẮT CHỮ (Đã khôi phục lại máy trợ tim)
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                speechRecognitionRef.current = recognition;

                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'vi-VN';

                recognition.onresult = (event: any) => {
                    let textBlock = '';
                    for (let i = 0; i < event.results.length; i++) {
                        textBlock += event.results[i][0].transcript + ' ';
                    }
                    fullTranscriptRef.current = textBlock;
                };

                recognition.onerror = (event: any) => {
                    console.error("🚨 Lỗi cỗ máy AI:", event.error);
                };

                recognition.onend = () => {
                    if (speechRecognitionRef.current) {
                        try {
                            speechRecognitionRef.current.start();
                        } catch (err) { }
                    }
                };

                recognition.start();
            }

        } else {
            // 👉 KHI DỪNG HÁT: Tắt máy đo tần số trước
            if (pitchIntervalRef.current) clearInterval(pitchIntervalRef.current);
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }

            // 👉 KHI DỪNG HÁT: Tắt máy bắt chữ
            if (speechRecognitionRef.current) {
                speechRecognitionRef.current.stop();
                speechRecognitionRef.current = null;
            }

            // 👉 LUÔN LUÔN NỘP BÀI (Dù máy thu âm có bị lỗi hay không)
            const finalVoiceText = fullTranscriptRef.current.trim();
            if (gameState === "PERFORMANCE_EVALUATION" && isSinger) {
                evaluateLyricsResult(finalVoiceText || " ");
            } else {
                fullTranscriptRef.current = "";
            }
        }
    }, [gameState, winnerUser, userId]);

    const [musicInfo, setMusicInfo] = useState<MusicInfo>({
        videoUrl: "",
        startSeconds: 0,
        isPlaying: false,
        serverStartTime: 0,
    });

    const playSound = (fileName: string) => {
        const audio = new Audio(`/sounds/${fileName}`);
        audio.play().catch(error => console.log("Chưa thể phát âm thanh:", error));
    };

    const localStreamRef = useRef<MediaStream | null>(null);
    const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
    const remoteAudioRef = useRef<Record<string, HTMLAudioElement>>({});
    const remoteStreamRef = useRef<Record<string, MediaStream>>({});

    const rtcConfig: RTCConfiguration = {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    };

    // Xử lý đếm ngược
    useEffect(() => {
        if (gameState === "COUNTDOWN") {
            setCountdownNum(3);
            const timer = setInterval(() => {
                setCountdownNum((prev) => (prev > 1 ? prev - 1 : 1));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState]);

    const requestMicPermission = async (showAlert: boolean) => {
        setMicPermissionAsked(true);
        if (!navigator.mediaDevices?.getUserMedia) {
            if (showAlert) {
                alert("Trình duyệt không hỗ trợ Micro.");
            }
            return false;
        }
        try {
            await ensureLocalStream();
            return true;
        } catch (err) {
            console.error("Lỗi Mic:", err);
            if (showAlert) {
                alert("Vui lòng cấp quyền Micro để dùng voice.");
            }
            return false;
        }
    };

    const ensureLocalStream = async () => {
        if (localStreamRef.current) {
            return localStreamRef.current;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            alert("Trình duyệt không hỗ trợ Micro.");
            return null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
            },
        });
        localStreamRef.current = stream;
        setHasMicPermission(true);
        setMicPermissionAsked(true);
        stream.getAudioTracks().forEach(track => {
            track.enabled = false;
        });
        attachLocalTracks();
        return stream;
    };

    const setLocalTrackEnabled = (enabled: boolean) => {
        if (!localStreamRef.current) return;
        localStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = enabled;
        });
    };

    const attachLocalTracks = () => {
        if (!localStreamRef.current) return;
        const tracks = localStreamRef.current.getTracks();
        Object.values(peerConnectionsRef.current).forEach(pc => {
            tracks.forEach(track => {
                const existingSender = pc.getSenders().find(sender => sender.track?.kind === track.kind);
                if (existingSender) {
                    existingSender.replaceTrack(track);
                } else {
                    pc.addTrack(track, localStreamRef.current as MediaStream);
                }
            });
        });
    };

    const sendRtcSignal = (payload: RtcSignalPayload) => {
        if (!roomId) return;
        websocketService.sendMessage(roomId, {
            type: "RTC_SIGNAL",
            content: payload,
            sender: userId,
            roomId: roomId,
        });
    };

    const createPeerConnection = (peerId: string) => {
        const existing = peerConnectionsRef.current[peerId];
        if (existing) return existing;
        const pc = new RTCPeerConnection(rtcConfig);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendRtcSignal({
                    action: "candidate",
                    from: userId,
                    to: peerId,
                    candidate: event.candidate.toJSON(),
                });
            }
        };

        pc.ontrack = (event) => {
            let stream = remoteStreamRef.current[peerId];
            if (!stream) {
                stream = new MediaStream();
                remoteStreamRef.current[peerId] = stream;
            }
            stream.addTrack(event.track);

            let audio = remoteAudioRef.current[peerId];
            if (!audio) {
                audio = new Audio();
                audio.autoplay = true;
                audio.preload = "auto";
                audio.playsInline = true;
                remoteAudioRef.current[peerId] = audio;
            }
            if (audio.srcObject !== stream) {
                audio.srcObject = stream;
            }
            audio.play().catch(() => undefined);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
                pc.close();
                delete peerConnectionsRef.current[peerId];
                const audio = remoteAudioRef.current[peerId];
                if (audio) {
                    audio.srcObject = null;
                    delete remoteAudioRef.current[peerId];
                }
                if (remoteStreamRef.current[peerId]) {
                    delete remoteStreamRef.current[peerId];
                }
            }
        };

        peerConnectionsRef.current[peerId] = pc;
        if (localStreamRef.current) {
            attachLocalTracks();
        }
        return pc;
    };

    const isForcedVoice = gameState === "PERFORMANCE" && winnerUser?.userId === userId;
    const isMusicPlaying = gameState === "PLAY_SEGMENT";
    const isOtherPerformance = gameState === "PERFORMANCE" && winnerUser?.userId && winnerUser.userId !== userId;
    const shouldStreamVoice = voiceEnabled || isForcedVoice;

    useEffect(() => {
        setLocalTrackEnabled(shouldStreamVoice);
        if (shouldStreamVoice && !localStreamRef.current) {
            ensureLocalStream().catch(() => undefined);
        }
    }, [shouldStreamVoice]);

    useEffect(() => {
        requestMicPermission(false);
    }, []);

    useEffect(() => {
        if ((isMusicPlaying || isOtherPerformance) && voiceEnabled) {
            setVoiceEnabled(false);
        }
    }, [isMusicPlaying, isOtherPerformance, voiceEnabled]);

    useEffect(() => {
        if (!userId) return;
        const peers = playerList.map(p => p.userId).filter(id => id && id !== userId);
        peers.forEach((peerId) => {
            const pc = createPeerConnection(peerId);
            const shouldCreateOffer = userId < peerId
                && pc.signalingState === "stable"
                && !pc.currentLocalDescription
                && !pc.currentRemoteDescription;
            if (shouldCreateOffer) {
                pc.createOffer()
                    .then(offer => pc.setLocalDescription(offer).then(() => offer))
                    .then(offer => {
                        sendRtcSignal({ action: "offer", from: userId, to: peerId, sdp: offer });
                    })
                    .catch(err => console.error("Lỗi tạo offer:", err));
            }
        });
    }, [playerList, userId]);

    // Xử lý WebSocket
    useEffect(() => {
        if (roomId) {
            console.log("Connecting to WebSocket for room:", roomId);

            websocketService.connect(roomId, (message) => {
                if (message.type === "JOIN") {
                    if (Array.isArray(message.content)) {
                        setPlayerList(message.content as User[]);
                    }
                }
                else if (message.type === "CHAT") {
                    setMessages((prevMessages) => [...prevMessages, message]);
                    if (message.sender !== userName) {
                        playSound("ting.mp3");
                    }
                } else if (message.type === "PLAY_SEGMENT") {
                    try {
                        const state = message.content as MusicInfo;
                        setMusicInfo(state);
                        setGameState("PLAY_SEGMENT");
                        setClickCount(0);
                    } catch (error) {
                        console.error("Failed to parse game state message", error);
                    }
                } else if (message.type === "PAUSE") {
                    setMusicInfo((prevState) => ({ ...prevState, isPlaying: false }));
                } else if (message.type === "BATTLE") {
                    setGameState("BATTLE");
                    setMusicInfo(prev => ({ ...prev, isPlaying: false }));
                } else if (message.type === "WINNER_SHOW") {
                    setGameState("WINNER_SHOW");
                    if (typeof message.content !== "string" && "userName" in message.content) {
                        setWinnerUser(message.content as User);
                    }
                } else if (message.type === "COUNTDOWN") {
                    setGameState("COUNTDOWN");
                } else if (message.type === "PERFORMANCE") {
                    currentSongLyricsRef.current = message.content as string;
                    setGameState("PERFORMANCE");
                } else if (message.type === "PERFORMANCE_EVALUATION") {
                    setGameState("PERFORMANCE_EVALUATION");
                    //lúc này in ra màn hình là chờ kết quả đánh giá, khi nào dưới be phân tích kết quả xong rồi, gửi state là score show sẽ tiếp tục
                } else if (message.type === "SCORE_SHOW") {
                    setGameState("SCORE_SHOW");
                    const payload = message.content as PerformanceResultPayload;
                    const performanceUser = payload.user;
                    const isSuccess = payload.isSuccess;

                    if (performanceUser.userId === userId) {
                        setMyScore(performanceUser.score);
                    }

                    // Cập nhật lại điểm của người hát trong danh sách
                    setPlayerList((prevList) =>
                        prevList.map((user) =>
                            user.userId === performanceUser.userId
                                ? { ...user, score: performanceUser.score }
                                : user
                        )
                    );

                    if (isSuccess) {
                        playSound("success.mp3");
                        setNotification(`Chúc mừng ${performanceUser.userName} đã được cộng 1 điểm! 🎉`);
                    } else {
                        playSound("failure.mp3");
                        setNotification(`Rất tiếc ${performanceUser.userName} chưa được cộng điểm. 😢`);
                    }
                }
                else if (message.type === "END_GAME") {
                    setGameState("END_GAME");
                    playSound("applause.mp3");
                }
                else if (message.type === "LOBBY") {
                    if (Array.isArray(message.content)) {
                        setPlayerList(message.content as User[]);
                    } else if (typeof message.content === "string") {
                        console.log("Thông báo từ Lobby:", message.content);
                        setNotification(message.content);
                    }

                    setMyScore(0);
                    // Giữ lại các reset khác
                    // setNotification(null); // Tạm thời xóa dòng này để xem thông báo ở trên
                    setWinnerUser(null);
                    setGameState("LOBBY");
                }
                else if (message.type === "KICK_PLAYER") {
                    if (typeof message.content === "string" && message.content === userId) {
                        alert("Bạn đã bị chủ phòng đá khỏi phòng. 😢");
                        window.location.href = "/";
                    }
                }
                else if (message.type === "VOICE") {
                    return;
                }
                else if (message.type === "RTC_SIGNAL") {
                    if (typeof message.content === "string") return;
                    const payload = message.content as RtcSignalPayload;
                    if (!payload || payload.from === userId) return;
                    if (payload.to && payload.to !== userId) return;

                    const peerId = payload.from;
                    const pc = createPeerConnection(peerId);

                    if (payload.action === "offer" && payload.sdp) {
                        pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
                            .then(() => pc.createAnswer())
                            .then(answer => pc.setLocalDescription(answer).then(() => answer))
                            .then(answer => {
                                sendRtcSignal({ action: "answer", from: userId, to: peerId, sdp: answer });
                            })
                            .catch(err => console.error("Lỗi nhận offer:", err));
                    } else if (payload.action === "answer" && payload.sdp) {
                        pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
                            .catch(err => console.error("Lỗi nhận answer:", err));
                    } else if (payload.action === "candidate" && payload.candidate) {
                        pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
                            .catch(err => console.error("Lỗi ICE candidate:", err));
                    }
                }
            });

            // Gửi lời chào JOIN sau khi delay 1s để đảm bảo WS đã connect
            const joinTimeout = setTimeout(() => {
                sendRoomMessage("JOIN", "");
            }, 1000);

            return () => {
                clearTimeout(joinTimeout); // Dọn dẹp timeout nếu user thoát trang sớm
                websocketService.disconnect();
                Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
                peerConnectionsRef.current = {};
                Object.values(remoteAudioRef.current).forEach(audio => {
                    audio.srcObject = null;
                });
                remoteAudioRef.current = {};
                remoteStreamRef.current = {};
                if (localStreamRef.current) {
                    localStreamRef.current.getTracks().forEach(track => track.stop());
                    localStreamRef.current = null;
                }
            }
        }
    }, [roomId, userId]);

    // Các hàm xử lý sự kiện
    const handleStartGame = () => {
        sendRoomMessage("PLAY_SEGMENT", "");
    };

    const handleBuzzerClick = () => {
        playSound("buzzer.mp3");
        setClickCount(prev => prev + 1);
        sendRoomMessage("BATTLE", "");
    };

    const handleSendMessage = () => {
        if (roomId && inputMessage.trim()) {
            sendRoomMessage("CHAT", inputMessage, userName);
            setInputMessage("");
        }
    };

    const handleToggleVoice = async () => {
        if (isForcedVoice || isMusicPlaying || isOtherPerformance) return;
        if (!voiceEnabled && !hasMicPermission) {
            const ok = await requestMicPermission(true);
            if (!ok) return;
        }
        if (!voiceEnabled && !localStreamRef.current) {
            await ensureLocalStream();
        }
        setVoiceEnabled(prev => !prev);
    };

    // --- CÁC BIẾN & HÀM CHUẨN BỊ CHO LOBBY ---
    const me = playerList.find(u => u.userId === userId);
    const isHost = me?.isHost || false;
    const isReady = me?.isReady || false;

    // Điều kiện bắt đầu: Có nhiều hơn 1 người VÀ tất cả (trừ Host) đều đã ready
    const allReady = playerList.length > 1 && playerList.every(u => u.isHost || u.isReady);

    const handleToggleReady = () => {
        sendRoomMessage("TOGGLE_READY", "");
    };

    const handleKickPlayer = (kickedId: string) => {
        if (!roomId) return;
        if (window.confirm("Bạn có chắc chắn muốn mời người này ra khỏi phòng?")) {
            sendRoomMessage("KICK_PLAYER", kickedId);
        }
    };

    // Thuật toán Xếp hạng (Tie-breaker)
    const sortedPlayers = [...playerList].sort((a, b) => b.score - a.score);
    let currentRank = 1;
    const rankedPlayers = sortedPlayers.map((user, index) => {
        if (index > 0 && user.score < sortedPlayers[index - 1].score) {
            currentRank = index + 1;
        }
        let rankIcon = `${currentRank}.`;
        if (currentRank === 1) rankIcon = '🥇';
        else if (currentRank === 2) rankIcon = '🥈';
        else if (currentRank === 3) rankIcon = '🥉';
        return { ...user, rankIcon };
    });

    // --- GIAO DIỆN CHÍNH ---
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100vh',
            width: '100vw', position: 'fixed', top: 0, left: 0,
            backgroundColor: '#0f0f1b', color: '#ffffff', fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            overflow: 'hidden'
        }}>
            {/* HEADER */}
            <div style={{
                padding: '15px 30px', textAlign: 'center', background: 'linear-gradient(90deg, #ff4757, #3742fa)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.6)', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <h1 style={{ margin: 0, fontSize: '28px', textShadow: '2px 2px 4px rgba(0,0,0,0.5)', letterSpacing: '2px' }}>
                    🎤 KARAOKE BATTLE
                </h1>
                <div style={{ display: 'flex', gap: '15px', fontSize: '18px', fontWeight: 'bold' }}>
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '5px 20px', borderRadius: '30px', border: '1px solid #2ed573' }}>
                        ⭐ Điểm của bạn: <span style={{ color: '#2ed573', fontSize: '22px' }}>{myScore}</span>
                    </div>
                    <button
                        onClick={handleToggleVoice}
                        disabled={isForcedVoice || isMusicPlaying || isOtherPerformance}
                        title={isMusicPlaying
                            ? "Đang phát nhạc, không thể mở mic"
                            : (isOtherPerformance
                                ? "Đang có người khác hát"
                                : (!hasMicPermission && micPermissionAsked ? "Bạn cần cấp quyền truy cập Micro" : undefined))}
                        style={{
                            padding: '6px 18px', borderRadius: '30px', border: '1px solid #ff4757',
                            backgroundColor: shouldStreamVoice ? '#ff4757' : 'rgba(0,0,0,0.4)',
                            color: 'white', fontWeight: 'bold', cursor: isForcedVoice ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {isForcedVoice ? '🎙️ MIC BẮT BUỘC' : (voiceEnabled ? '🔊 VOICE ON' : '🔇 VOICE OFF')}
                        {!hasMicPermission && micPermissionAsked && (
                            <span style={{ marginLeft: '6px', color: '#ffdd59', fontWeight: 'bold' }}>!</span>
                        )}
                    </button>
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '5px 20px', borderRadius: '30px' }}>
                        Phòng: <span style={{ color: '#FFD700' }}>{roomId}</span> | ID: {userName}
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT (Layout 3 cột) */}
            <div style={{ display: 'flex', flex: 1, padding: '20px', gap: '20px', overflow: 'hidden' }}>

                {/* CỘT TRÁI: Bảng Xếp Hạng */}
                <div style={{ width: '280px', backgroundColor: '#1e1e2f', borderRadius: '15px', border: '1px solid #2f3542', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                    <div style={{ padding: '15px', backgroundColor: '#2f3542', fontWeight: 'bold', textAlign: 'center', fontSize: '18px', borderBottom: '1px solid #1e1e2f', color: '#FFD700', letterSpacing: '1px' }}>
                        🏆 BẢNG XẾP HẠNG
                    </div>
                    <div style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {rankedPlayers.map((user) => {
                            const isMeUser = user.userId === userId;
                            return (
                                <div key={user.userId} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 15px', backgroundColor: isMeUser ? 'rgba(46, 213, 115, 0.15)' : '#2f3542',
                                    borderRadius: '10px', border: isMeUser ? '1px solid #2ed573' : '1px solid transparent',
                                    transition: 'transform 0.2s',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '20px', width: '25px', textAlign: 'center' }}>{user.rankIcon}</span>
                                        <span style={{ fontSize: '16px', fontWeight: isMeUser ? 'bold' : 'normal', color: isMeUser ? '#2ed573' : 'white' }}>
                                            {user.userName} {isMeUser && "(Bạn)"}
                                        </span>
                                    </div>
                                    <div style={{ fontWeight: 'bold', color: '#FFD700', fontSize: '18px' }}>
                                        {user.score} ⭐
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* CỘT GIỮA: Màn hình Game / Lobby */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

                    {/* KHU VỰC HIỂN THỊ CHÍNH */}
                    <div style={{
                        position: "relative", width: "100%", maxWidth: "900px", aspectRatio: '16/9',
                        backgroundColor: '#000', borderRadius: '15px', overflow: 'hidden',
                        boxShadow: '0 15px 40px rgba(0,0,0,0.8)', border: '2px solid #2f3542',
                        display: 'flex', flexDirection: 'column'
                    }}>

                        {/* HIỂN THỊ LOBBY NẾU CHƯA START */}
                        {gameState === "LOBBY" ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '30px', backgroundColor: '#1e1e2f', overflowY: 'auto' }}>
                                <h2 style={{ color: '#FFD700', textAlign: 'center', fontSize: '32px', marginBottom: '30px' }}>SẢNH CHỜ KHỞI ĐỘNG</h2>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                                    {playerList.map(user => (
                                        <div key={user.userId} style={{
                                            backgroundColor: '#2f3542', padding: '15px', borderRadius: '15px',
                                            border: user.isHost ? '2px solid #FFD700' : (user.isReady ? '2px solid #2ed573' : '2px solid #747d8c'),
                                            position: 'relative', textAlign: 'center'
                                        }}>
                                            <div style={{ fontSize: '40px', marginBottom: '10px' }}>{user.isHost ? '👑' : '👤'}</div>
                                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '10px' }}>{user.userName}</div>

                                            {/* TRẠNG THÁI SẴN SÀNG */}
                                            {user.isHost ? (
                                                <span style={{ color: '#FFD700', fontWeight: 'bold' }}>Chủ phòng</span>
                                            ) : (
                                                <span style={{ color: user.isReady ? '#2ed573' : '#a4b0be', fontWeight: 'bold' }}>
                                                    {user.isReady ? "✅ Đã sẵn sàng" : "⏳ Đang chờ..."}
                                                </span>
                                            )}

                                            {/* NÚT KICK CỦA CHỦ PHÒNG */}
                                            {isHost && !user.isHost && (
                                                <button
                                                    onClick={() => handleKickPlayer(user.userId)}
                                                    style={{
                                                        position: 'absolute', top: '-10px', right: '-10px', width: '30px', height: '30px',
                                                        borderRadius: '50%', backgroundColor: '#ff4757', color: 'white', border: 'none',
                                                        fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.5)'
                                                    }}
                                                >X</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : gameState === "PERFORMANCE" ? (
                            // KHUNG BAO NGOÀI CỐ ĐỊNH CHIỀU CAO THEO MÀN HÌNH 16:9
                            <div style={{
                                width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                                justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e1e2f',
                                padding: '20px', boxSizing: 'border-box'
                            }}>

                                {/* TẦNG 1: HEADER - TIÊU ĐỀ VÀ THANH THỜI GIAN ĐẾM NGƯỢC */}
                                <div style={{ width: '100%', textAlign: 'center', flexShrink: 0 }}>
                                    <h2 style={{ color: '#FFD700', fontSize: '26px', margin: '0 0 10px 0', animation: 'pulse 1s infinite' }}>
                                        🎤 HÃY HÁT THEO LỜI SAU (Còn {perfCountdown}s) 🎤
                                    </h2>

                                    {/* THANH PROGRESS BAR XỊN XÒ */}
                                    <div style={{ width: '80%', height: '12px', backgroundColor: '#2f3542', borderRadius: '6px', margin: '0 auto', overflow: 'hidden', border: '1px solid #747d8c' }}>
                                        <div style={{
                                            width: `${(perfCountdown / 30) * 100}%`,
                                            height: '100%',
                                            background: 'linear-gradient(90deg, #ff4757, #ffa502)',
                                            transition: 'width 1s linear', // Tạo hiệu ứng mượt mà khi tụt thời gian
                                            borderRadius: '6px'
                                        }} />
                                    </div>
                                </div>

                                {/* TẦNG 2: THÂN MÀN HÌNH - CHỨA LYRICS TỰ CO GIÃN VÀ CÓ THANH CUỘN */}
                                <div style={{
                                    backgroundColor: 'rgba(0,0,0,0.5)', padding: '20px', borderRadius: '15px', border: '2px solid #ff4757',
                                    width: '80%', textAlign: 'center', boxShadow: '0 0 20px rgba(255, 71, 87, 0.3)',
                                    flex: 1, margin: '15px 0', overflowY: 'auto' // flex:1 giúp nó nuốt trọn không gian thừa, overflowY giúp tự xuất hiện thanh cuộn
                                }}>
                                    <p style={{ fontSize: '24px', color: '#fff', whiteSpace: 'pre-wrap', lineHeight: '1.6', margin: 0 }}>
                                        {currentSongLyricsRef.current || "Đang tải lời bài hát..."}
                                    </p>
                                </div>

                                {/* TẦNG 3: FOOTER - NÚT BẤM KẾT THÚC (KHÓA CHẾT VỊ TRÍ Ở ĐÁY) */}
                                <div style={{ width: '100%', display: 'flex', justifyContent: 'center', height: '55px', flexShrink: 0 }}>
                                    {winnerUser?.userId === userId ? (
                                        <button
                                            onClick={() => {
                                                sendRoomMessage("PERFORMANCE_EVALUATION", "");
                                            }}
                                            style={{
                                                padding: '10px 40px', fontSize: '20px', fontWeight: 'bold',
                                                backgroundColor: '#2ed573', color: 'white', border: 'none', borderRadius: '40px',
                                                cursor: 'pointer', boxShadow: '0 5px 15px rgba(46, 213, 115, 0.5)'
                                            }}>
                                            ✅ HÁT XONG RỒI!
                                        </button>
                                    ) : (
                                        // Khán giả không bấm được nút nhưng vẫn giữ khoảng trống để giao diện cân đối
                                        <p style={{ color: '#a4b0be', fontSize: '16px', margin: 0 }}>Bạn đang lắng nghe ca sĩ biểu diễn...</p>
                                    )}
                                </div>
                            </div>

                        ) : (
                            // 👉 2. NẾU LÀ CÁC TRẠNG THÁI KHÁC (Nghe nhạc, Đập nút...): Vẫn hiện Video
                            <VideoPlayer
                                videoUrl={musicInfo.videoUrl}
                                startSeconds={musicInfo.startSeconds}
                                isPlaying={musicInfo.isPlaying}
                                serverStartTime={musicInfo.serverStartTime}
                                muted={false} // Không cần tắt tiếng nữa
                            />
                        )}

                        {/* --- CÁC LỚP PHỦ INGAME --- */}
                        {gameState === "BATTLE" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <button onClick={handleBuzzerClick} style={{ padding: '25px 60px', fontSize: '36px', fontWeight: 'bold', backgroundColor: '#ff4757', color: 'white', border: '4px solid white', borderRadius: '60px', cursor: 'pointer', boxShadow: '0 0 40px rgba(255, 71, 87, 0.8)' }}>
                                    ĐẬP NÚT! ({clickCount})
                                </button>
                            </div>
                        )}

                        {gameState === "WINNER_SHOW" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
                                <h2 style={{ fontSize: '40px', color: '#FFD700', textShadow: '0 0 20px #FFD700' }}>🎤 MIC THUỘC VỀ 🎤</h2>
                                <h1 style={{ fontSize: '70px', color: '#00ffcc', textShadow: '0 0 30px #00ffcc', margin: 0 }}>
                                    {winnerUser && winnerUser.userId === userId ? "BẠN!" : winnerUser?.userName}
                                </h1>
                            </div>
                        )}

                        {gameState === "COUNTDOWN" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <h1 style={{ fontSize: '150px', color: '#ff4757', animation: 'pulse 1s infinite', textShadow: '0 0 30px #ff4757', margin: 0 }}>{countdownNum}</h1>
                            </div>
                        )}

                        {gameState === "PERFORMANCE" && (
                            <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 20, backgroundColor: 'rgba(0,0,0,0.7)', padding: '10px 20px', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #ff4757' }}>
                                <div style={{ width: '15px', height: '15px', backgroundColor: '#ff4757', borderRadius: '50%', animation: 'blink 1s infinite' }} />
                                <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>
                                    {winnerUser && winnerUser.userId === userId ? "BẠN ĐANG HÁT" : `${winnerUser?.userName} ĐANG HÁT`}
                                </span>
                            </div>
                        )}

                        {gameState === "PERFORMANCE_EVALUATION" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <h2 style={{ color: '#FFD700', fontSize: '36px' }}>🎤 Đã biểu diễn xong!</h2>
                                    <p style={{ fontSize: '24px', color: '#00ffcc', animation: 'blink 1.5s infinite' }}>
                                        🤖 AI đang phân tích và chấm điểm giọng hát... ⏳
                                    </p>
                                </div>
                            </div>
                        )}

                        {gameState === "SCORE_SHOW" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                                <h1 style={{ color: notification?.includes('Chúc mừng') ? '#2ed573' : '#ff4757', fontSize: '45px', textAlign: 'center', textShadow: '0px 0px 30px currentColor' }}>
                                    {notification}
                                </h1>
                            </div>
                        )}

                        {gameState === "END_GAME" && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
                                <h1 style={{ fontSize: '55px', color: '#FFD700', textShadow: '0 0 30px #FFD700', marginBottom: '20px', animation: 'pulse 1s infinite' }}>
                                    🎉 TỔNG KẾT GAME 🎉
                                </h1>
                                {rankedPlayers.length > 0 && (
                                    <div style={{ textAlign: 'center', backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '40px 60px', borderRadius: '20px', border: '2px solid #FFD700' }}>
                                        <h2 style={{ fontSize: '28px', color: '#fff', margin: '0 0 15px 0' }}>QUÁN QUÂN LÀ</h2>
                                        <h1 style={{ fontSize: '65px', color: '#2ed573', textShadow: '0 0 30px #2ed573', margin: '0' }}>
                                            🥇 {rankedPlayers[0].userName} 🥇
                                        </h1>
                                        <p style={{ fontSize: '24px', color: '#FFD700', margin: '20px 0 0 0', fontWeight: 'bold' }}>
                                            Đạt được {rankedPlayers[0].score} điểm!
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* KHU VỰC NÚT ĐIỀU KHIỂN BÊN DƯỚI */}
                    <div style={{ marginTop: '30px' }}>
                        {gameState === "LOBBY" ? (
                            isHost ? (
                                <button
                                    onClick={handleStartGame}
                                    disabled={!allReady}
                                    style={{
                                        padding: '15px 50px', fontSize: '24px', fontWeight: 'bold', cursor: allReady ? 'pointer' : 'not-allowed',
                                        background: allReady ? 'linear-gradient(45deg, #3742fa, #5f27cd)' : '#747d8c',
                                        color: 'white', border: 'none', borderRadius: '50px',
                                        boxShadow: allReady ? '0 8px 25px rgba(55, 66, 250, 0.5)' : 'none'
                                    }}>
                                    {allReady ? "🎮 BẮT ĐẦU GAME" : "⏳ CHỜ MỌI NGƯỜI SẴN SÀNG..."}
                                </button>
                            ) : (
                                <button
                                    onClick={handleToggleReady}
                                    style={{
                                        padding: '15px 50px', fontSize: '24px', fontWeight: 'bold', cursor: 'pointer',
                                        background: isReady ? '#ff4757' : '#2ed573',
                                        color: 'white', border: 'none', borderRadius: '50px',
                                        boxShadow: `0 8px 25px ${isReady ? 'rgba(255, 71, 87, 0.5)' : 'rgba(46, 213, 115, 0.5)'}`
                                    }}>
                                    {isReady ? "❌ HỦY SẴN SÀNG" : "✅ SẴN SÀNG"}
                                </button>
                            )
                        ) : (
                            <p style={{ color: '#a4b0be', fontSize: '18px' }}>Trò chơi đang diễn ra...</p>
                        )}
                    </div>
                </div>

                {/* CỘT PHẢI: Khung Chat */}
                <div style={{ width: '380px', backgroundColor: '#1e1e2f', borderRadius: '15px', border: '1px solid #2f3542', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                    <div style={{ padding: '15px', backgroundColor: '#2f3542', fontWeight: 'bold', textAlign: 'center', fontSize: '18px', borderBottom: '1px solid #1e1e2f' }}>💬 Kênh Chat Phòng</div>
                    <div style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {messages.map((msg, index) => {
                            const isMeChat = msg.sender === userName;
                            return (
                                <div key={index} style={{ alignSelf: isMeChat ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                    {!isMeChat && <div style={{ fontSize: '13px', color: '#a4b0be', marginBottom: '5px', marginLeft: '5px' }}>{msg.sender}</div>}
                                    <div style={{ backgroundColor: isMeChat ? '#3742fa' : '#4a69bd', padding: '12px 18px', fontSize: '15px', borderRadius: isMeChat ? '20px 20px 5px 20px' : '20px 20px 20px 5px', wordWrap: 'break-word', boxShadow: '0 3px 10px rgba(0,0,0,0.2)' }}>
                                        {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ padding: '15px', backgroundColor: '#2f3542', display: 'flex', gap: '10px' }}>
                        <input value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Nhập tin nhắn..." style={{ flex: 1, padding: '12px 20px', borderRadius: '30px', border: '1px solid #1e1e2f', backgroundColor: '#1e1e2f', color: 'white', outline: 'none', fontSize: '15px' }} />
                        <button onClick={handleSendMessage} style={{ padding: '10px 25px', borderRadius: '30px', border: 'none', fontSize: '15px', backgroundColor: '#ff4757', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Gửi</button>
                    </div>
                </div>
            </div>

            <style>
                {`
                @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
                @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: #1e1e2f; }
                ::-webkit-scrollbar-thumb { background: #2f3542; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: #57606f; }
                `}
            </style>
        </div>
    );
}
// THUẬT TOÁN ĐO TẦN SỐ (PITCH DETECTION) TỪ SÓNG ÂM
function autoCorrelate(buf: Float32Array, sampleRate: number) {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
        let val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1; // Nếu âm thanh quá nhỏ (im lặng) -> Bỏ qua

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++)
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++)
        if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++)
        for (let j = 0; j < SIZE - i; j++)
            c[i] = c[i] + buf[j] * buf[j + i];

    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    let T0 = maxpos;
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0; // Trả về Hz
}