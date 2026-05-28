import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";

import type { SocketMessage, RtcSignalPayload } from "../types/socket";
import type { GameState, MusicInfo } from "../types/game";
import type { MessageType } from "../types/message";
import { websocketService } from "../services/websocketService";
import type { User } from "../types/user";
import type { PerformanceResultPayload } from "../types/room";
import { storage } from "../utils/storage";
import { roomService } from "../services/roomService";
import { API_BASE_URL } from "../constants/api";
import GameHeader from "../components/game/GameHeader";
import GameRoot from "../components/game/GameRoot";
import GameMain from "../components/game/GameMain";
import Leaderboard from "../components/game/Leaderboard";
import type { RankedUser } from "../components/game/Leaderboard";
import GameStage from "../components/game/GameStage";
import ChatPanel from "../components/game/ChatPanel";
import GameControls from "../components/game/GameControls";
import Toast from "../components/ui/Toast";

export default function GamePage() {
    type SpeechRecognitionEventLike = {
        results: Array<Array<{ transcript: string }>>;
    };

    type SpeechRecognitionErrorEventLike = {
        error?: string;
    };

    type SpeechRecognitionLike = {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: SpeechRecognitionEventLike) => void) | null;
        onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
    };

    type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

    const maxPlayers = 5;
    const { roomId } = useParams();
    const [messages, setMessages] = useState<SocketMessage[]>([]);
    const [inputMessage, setInputMessage] = useState("");
    const [userName, setUserName] = useState(() => storage.getUserName() || "Người chơi ẩn danh");
    const userId = storage.getUserId();
    const roomName = storage.getRoomName();
    const [perfCountdown, setPerfCountdown] = useState(60);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const pitchContourRef = useRef<number[]>([]);
    const pitchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [gameState, setGameState] = useState<GameState>("LOBBY");
    const [clickCount, setClickCount] = useState(0);
    const [winnerUser, setWinnerUser] = useState<User | null>(null);
    const [notification, setNotification] = useState<string | null>(null);
    const [noWinnerMessage, setNoWinnerMessage] = useState<string | null>(null);
    const [countdownNum, setCountdownNum] = useState(3);
    const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
    const [showRename, setShowRename] = useState(false);
    const [renameValue, setRenameValue] = useState(userName);
    const [kickTarget, setKickTarget] = useState<User | null>(null);
    const [canConnect, setCanConnect] = useState(false);

    const [myScore, setMyScore] = useState(0);
    const [playerList, setPlayerList] = useState<User[]>([]);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [hasMicPermission, setHasMicPermission] = useState(false);
    const [micPermissionAsked, setMicPermissionAsked] = useState(false);

    const fullTranscriptRef = useRef("");
    const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);

    const currentSongLyricsRef = useRef("");

    const sendRoomMessage = (type: MessageType, content: SocketMessage["content"], senderOverride?: string) => {
        if (!roomId) return;
        websocketService.sendMessage(roomId, {
            type,
            content,
            sender: senderOverride ?? userId,
            roomId: roomId,
        });
    };

    const showToast = (type: "success" | "error" | "info", text: string) => {
        setToast({ type, text });
        window.setTimeout(() => setToast(null), 3200);
    };

    const evaluateLyricsResult = (userSangText: string) => {
        const cleanUserText = userSangText.toLowerCase();

        console.log("===============================");
        console.log("🎤 LỜI BÀI HÁT GỬI ĐI:", cleanUserText);
        console.log("🎵 MẢNG TẦN SỐ (TONE) GỬI ĐI:", pitchContourRef.current);
        console.log("===============================");
        sendRoomMessage("USER_LYRICS", {
            lyrics: cleanUserText,
            pitchContour: pitchContourRef.current,
            songId: musicInfo.songId || null
        });
    };

    useEffect(() => {
        if (gameState === "PERFORMANCE") {
            setPerfCountdown(60);
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
            pitchContourRef.current = [];

            const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (AudioContextClass && localStreamRef.current) {
                audioContextRef.current = new AudioContextClass();
                analyserRef.current = audioContextRef.current.createAnalyser();
                analyserRef.current.fftSize = 2048;
                const source = audioContextRef.current.createMediaStreamSource(localStreamRef.current);
                source.connect(analyserRef.current);

                pitchIntervalRef.current = setInterval(() => {
                    if (!analyserRef.current || !audioContextRef.current) return;
                    const buffer = new Float32Array(analyserRef.current.fftSize);
                    analyserRef.current.getFloatTimeDomainData(buffer);
                    const hz = autoCorrelate(buffer, audioContextRef.current.sampleRate);

                    let validHz = 0.0;
                    if (hz !== -1 && hz >= 80 && hz <= 1000) {
                        validHz = Number(hz.toFixed(2));
                    }

                    pitchContourRef.current.push(validHz);
                }, 200);
            }

            const SpeechRecognition = (window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition
                || (window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                speechRecognitionRef.current = recognition;

                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'vi-VN';

                recognition.onresult = (event) => {
                    let textBlock = '';
                    for (let i = 0; i < event.results.length; i++) {
                        textBlock += event.results[i][0].transcript + ' ';
                    }
                    fullTranscriptRef.current = textBlock;
                };

                recognition.onerror = (event) => {
                    console.error("🚨 Lỗi cỗ máy AI:", event.error);
                };

                recognition.onend = () => {
                    if (speechRecognitionRef.current) {
                        try {
                            speechRecognitionRef.current.start();
                        } catch (error) {
                            console.error("🚨 Lỗi khi bắt đầu nhận diện giọng nói:", error);
                        }
                    }
                };

                recognition.start();
            }

        } else {
            if (pitchIntervalRef.current) clearInterval(pitchIntervalRef.current);
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }

            if (speechRecognitionRef.current) {
                speechRecognitionRef.current.stop();
                speechRecognitionRef.current = null;
            }

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
                showToast("error", "Trình duyệt không hỗ trợ Micro.");
            }
            return false;
        }
        try {
            await ensureLocalStream();
            return true;
        } catch (err) {
            console.error("Lỗi Mic:", err);
            if (showAlert) {
                showToast("error", "Vui lòng cấp quyền Micro để dùng voice.");
            }
            return false;
        }
    };

    const ensureLocalStream = async () => {
        if (localStreamRef.current) {
            return localStreamRef.current;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            showToast("error", "Trình duyệt không hỗ trợ Micro.");
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
        sendRoomMessage("RTC_SIGNAL", payload);
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
    const isOtherPerformance = gameState === "PERFORMANCE" && !!winnerUser?.userId && winnerUser.userId !== userId;
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

    useEffect(() => {
        if (!roomId) return;
        const storedName = storage.getUserName();
        if (!storedName) {
            window.location.href = "/";
            return;
        }
        const joinToken = storage.getRoomJoinToken();
        if (joinToken && joinToken === roomId) {
            storage.clearRoomJoinToken();
            setCanConnect(true);
            return;
        }

        let active = true;
        setCanConnect(false);
        roomService.joinRoom(roomId, storedName)
            .then((data) => {
                if (!active) return;
                storage.setUserId(data.user.userId);
                storage.setRoomName(data.room.roomName);
                storage.setRoomId(data.room.roomId);
                setUserName(storedName);
                setCanConnect(true);
            })
            .catch((error) => {
                if (!active) return;
                const err = error as { response?: { status?: number; data?: { message?: string } } };
                const status = err.response?.status;
                const reason = err.response?.data?.message;
                if (status === 404) {
                    showToast("error", "Không tìm thấy phòng.");
                } else if (status === 409 && reason === "ROOM_FULL") {
                    showToast("error", "Phòng đã đầy (5/5).");
                } else if (status === 409 && reason === "ROOM_PLAYING") {
                    showToast("error", "Phòng đang chơi, bạn không thể vào lại lúc này.");
                } else {
                    showToast("error", "Không thể vào phòng. Vui lòng thử lại.");
                }
                window.setTimeout(() => {
                    window.location.href = "/";
                }, 1400);
            });

        return () => {
            active = false;
        };
    }, [roomId]);

    useEffect(() => {
        if (roomId && userId && canConnect) {
            console.log("Connecting to WebSocket for room:", roomId);

            websocketService.connect(roomId, userId, (message) => {
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
                }

                else if (message.type === "PLAY_SEGMENT") {
                    try {
                        const state = message.content as MusicInfo;
                        setMusicInfo(state);
                        setGameState("PLAY_SEGMENT");
                        setClickCount(0);
                        setNoWinnerMessage(null);
                    } catch (error) {
                        console.error("Failed to parse game state message", error);
                    }
                } else if (message.type === "PRELOAD") {
                    try {
                        const state = message.content as MusicInfo;
                        // store preload info so VideoPlayer can preload next/current media
                        setMusicInfo(state);
                        try {
                            let existing = document.getElementById("preload-video") as HTMLVideoElement | null;
                            if (!existing) {
                                existing = document.createElement("video");
                                existing.id = "preload-video";
                                existing.preload = "auto";
                                existing.muted = true;
                                existing.style.display = "none";
                                document.body.appendChild(existing);
                            }
                            existing.pause();
                            existing.removeAttribute("src");
                            existing.load();
                            if (state.videoUrl) {
                                existing.src = state.videoUrl;
                                existing.load();
                            }
                        } catch (err) {
                            console.warn("Failed to create preload video element:", err);
                        }
                    } catch (error) {
                        console.error("Failed to parse preload message", error);
                    }
                } else if (message.type === "BATTLE") {
                    setGameState("BATTLE");
                    setMusicInfo(prev => ({ ...prev, isPlaying: false }));
                } else if (message.type === "WINNER_SHOW") {
                    setGameState("WINNER_SHOW");
                    if (typeof message.content !== "string" && "userName" in message.content) {
                        setWinnerUser(message.content as User);
                    }
                } else if (message.type === "COUNTDOWN") {
                    setNoWinnerMessage(null);
                    setGameState("COUNTDOWN");
                } else if (message.type === "PERFORMANCE") {
                    currentSongLyricsRef.current = message.content as string;
                    setGameState("PERFORMANCE");
                } else if (message.type === "PERFORMANCE_EVALUATION") {
                    setGameState("PERFORMANCE_EVALUATION");
                } else if (message.type === "SCORE_SHOW") {
                    setGameState("SCORE_SHOW");
                    const payload = message.content as PerformanceResultPayload;
                    const performanceUser = payload.user;
                    const isSuccess = payload.isSuccess;

                    if (performanceUser.userId === userId) {
                        setMyScore(performanceUser.score);
                    }

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
                else if (message.type === "NO_WINNER") {
                    if (typeof message.content === "string") {
                        setNoWinnerMessage(message.content);
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
                    setWinnerUser(null);
                    setNoWinnerMessage(null);
                    setGameState("LOBBY");
                }
                else if (message.type === "KICK_PLAYER") {
                    if (typeof message.content === "string" && message.content === userId) {
                        showToast("error", "Bạn đã bị chủ phòng đá khỏi phòng. 😢");
                        window.setTimeout(() => {
                            window.location.href = "/";
                        }, 1400);
                    }
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

            const joinTimeout = setTimeout(() => {
                sendRoomMessage("JOIN", "");
            }, 1000);

            return () => {
                clearTimeout(joinTimeout);
                if (roomId && userId) {
                    sendRoomMessage("LEAVE", "");
                }
                if (roomId && userId) {
                    const data = new URLSearchParams({ roomId, userId });
                    const leaveUrl = `${API_BASE_URL}/api/rooms/leave`;
                    if (navigator.sendBeacon) {
                        navigator.sendBeacon(leaveUrl, data);
                    } else {
                        fetch(leaveUrl, {
                            method: "POST",
                            body: data,
                            keepalive: true,
                            headers: { "Content-Type": "application/x-www-form-urlencoded" }
                        }).catch(() => undefined);
                    }
                }
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
    }, [roomId, userId, canConnect]);

    const handleLeaveRoom = async () => {
        if (!roomId || !userId) return;
        try {
            sendRoomMessage("LEAVE", "");
            await roomService.leaveRoom(roomId, userId);
        } catch (error) {
            console.error("Failed to leave room", error);
        } finally {
            storage.setRoomId("");
            storage.clearRoomJoinToken();
            window.location.href = "/";
        }
    };

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

    const me = playerList.find(u => u.userId === userId);
    const isHost = me?.isHost || false;
    const isReady = me?.isReady || false;

    const allReady = playerList.length > 1 && playerList.every(u => u.isHost || u.isReady);

    const handleToggleReady = () => {
        sendRoomMessage("TOGGLE_READY", "");
    };

    const handleKickPlayer = (kickedId: string) => {
        const target = playerList.find(user => user.userId === kickedId);
        if (!roomId || !target) return;
        setKickTarget(target);
    };

    const confirmKick = () => {
        if (!kickTarget) return;
        sendRoomMessage("KICK_PLAYER", kickTarget.userId);
        setKickTarget(null);
    };

    const handleRename = () => {
        const trimmed = renameValue.trim();
        if (!trimmed) {
            showToast("error", "Tên không được để trống.");
            return;
        }
        storage.setUserName(trimmed);
        setUserName(trimmed);
        sendRoomMessage("RENAME", { userName: trimmed });
        setShowRename(false);
        showToast("success", "Đã cập nhật tên hiển thị.");
    };

    const sortedPlayers = [...playerList].sort((a, b) => b.score - a.score);
    let currentRank = 1;
    const rankedPlayers: RankedUser[] = sortedPlayers.map((user, index) => {
        if (index > 0 && user.score < sortedPlayers[index - 1].score) {
            currentRank = index + 1;
        }
        let rankIcon = `${currentRank}.`;
        if (currentRank === 1) rankIcon = '🥇';
        else if (currentRank === 2) rankIcon = '🥈';
        else if (currentRank === 3) rankIcon = '🥉';
        return { ...user, rankIcon };
    });

    return (
        <GameRoot
            header={
                <GameHeader
                    myScore={myScore}
                    roomId={roomId}
                    userName={userName}
                    playerCount={playerList.length}
                    maxPlayers={maxPlayers}
                    roomName={roomName}
                    isForcedVoice={isForcedVoice}
                    isMusicPlaying={isMusicPlaying}
                    isOtherPerformance={isOtherPerformance}
                    hasMicPermission={hasMicPermission}
                    micPermissionAsked={micPermissionAsked}
                    shouldStreamVoice={shouldStreamVoice}
                    onToggleVoice={handleToggleVoice}
                    onLeaveRoom={handleLeaveRoom}
                    onRename={() => {
                        setRenameValue(userName);
                        setShowRename(true);
                    }}
                />
            }
            main={
                <GameMain
                    left={<Leaderboard rankedPlayers={rankedPlayers} userId={userId} />}
                    center={
                        <GameStage
                            gameState={gameState}
                            playerList={playerList}
                            isHost={isHost}
                            onKick={handleKickPlayer}
                            perfCountdown={perfCountdown}
                            lyrics={currentSongLyricsRef.current}
                            isSinger={winnerUser?.userId === userId}
                            onFinishPerformance={() => sendRoomMessage("PERFORMANCE_EVALUATION", "")}
                            musicInfo={musicInfo}
                            clickCount={clickCount}
                            onBuzzer={handleBuzzerClick}
                            winnerUser={winnerUser}
                            userId={userId}
                            countdownNum={countdownNum}
                            notification={notification}
                            noWinnerMessage={noWinnerMessage}
                            rankedPlayers={rankedPlayers}
                        />
                    }
                    controls={
                        <GameControls
                            gameState={gameState}
                            isHost={isHost}
                            isReady={isReady}
                            allReady={allReady}
                            onStart={handleStartGame}
                            onToggleReady={handleToggleReady}
                        />
                    }
                    right={
                        <ChatPanel
                            messages={messages}
                            inputMessage={inputMessage}
                            onInputChange={setInputMessage}
                            onSend={handleSendMessage}
                            userName={userName}
                        />
                    }
                />
            }
            overlay={
                <>
                    {toast && (
                        <Toast
                            message={toast.text}
                            type={toast.type}
                            onClose={() => setToast(null)}
                        />
                    )}
                    {showRename && (
                        <div style={{
                            position: "fixed",
                            inset: 0,
                            background: "rgba(5, 8, 20, 0.75)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 1600
                        }}>
                            <div style={{
                                width: "min(420px, 92vw)",
                                background: "rgba(20, 24, 38, 0.98)",
                                borderRadius: "20px",
                                padding: "24px",
                                border: "1px solid rgba(255,255,255,0.12)",
                                boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
                            }}>
                                <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px", color: "#f8f8ff" }}>
                                    Đổi tên hiển thị
                                </div>
                                <input
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    placeholder="Nhập tên mới"
                                    style={{
                                        width: "100%",
                                        padding: "12px 14px",
                                        borderRadius: "12px",
                                        border: "1px solid rgba(255,255,255,0.12)",
                                        background: "rgba(255,255,255,0.05)",
                                        color: "#f8f8ff",
                                        fontSize: "15px",
                                        marginBottom: "16px"
                                    }}
                                />
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                                    <button
                                        onClick={() => setShowRename(false)}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: "999px",
                                            border: "1px solid rgba(255,255,255,0.12)",
                                            background: "rgba(255,255,255,0.06)",
                                            color: "#f8f8ff",
                                            cursor: "pointer"
                                        }}
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        onClick={handleRename}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: "999px",
                                            border: "none",
                                            background: "linear-gradient(135deg, #06d6a0, #118ab2)",
                                            color: "#001219",
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}
                                    >
                                        Lưu
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {kickTarget && (
                        <div style={{
                            position: "fixed",
                            inset: 0,
                            background: "rgba(5, 8, 20, 0.75)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 1600
                        }}>
                            <div style={{
                                width: "min(420px, 92vw)",
                                background: "rgba(20, 24, 38, 0.98)",
                                borderRadius: "20px",
                                padding: "24px",
                                border: "1px solid rgba(255,255,255,0.12)",
                                boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
                            }}>
                                <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px", color: "#f8f8ff" }}>
                                    Mời người chơi rời phòng?
                                </div>
                                <div style={{ fontSize: "14px", color: "#b8c1ec", marginBottom: "20px" }}>
                                    Bạn có chắc chắn muốn mời {kickTarget.userName} ra khỏi phòng không?
                                </div>
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                                    <button
                                        onClick={() => setKickTarget(null)}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: "999px",
                                            border: "1px solid rgba(255,255,255,0.12)",
                                            background: "rgba(255,255,255,0.06)",
                                            color: "#f8f8ff",
                                            cursor: "pointer"
                                        }}
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        onClick={confirmKick}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: "999px",
                                            border: "none",
                                            background: "linear-gradient(135deg, #ff7a59, #f72585)",
                                            color: "#fff",
                                            fontWeight: 700,
                                            cursor: "pointer"
                                        }}
                                    >
                                        Đồng ý
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            }
        />
    );
}
function autoCorrelate(buf: Float32Array, sampleRate: number) {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
        const val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    let r1 = 0, r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++)
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++)
        if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    const c: number[] = new Array(SIZE).fill(0);
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
    const x1 = c[T0 - 1];
    const x2 = c[T0];
    const x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
}
