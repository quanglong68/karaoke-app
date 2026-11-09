import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";

import type { SocketMessage, RtcSignalPayload } from "../types/socket";
import type { GameState, LyricsStatus, MusicInfo } from "../types/game";
import type { MessageType } from "../types/message";
import { websocketService } from "../services/websocketService";
import type { User } from "../types/user";
import type { JoinRoomResponse, PerformanceResultPayload } from "../types/room";
import { storage } from "../utils/storage";
import { getApiErrorCode, getApiErrorMessage, roomService } from "../services/roomService";
import { API_BASE_URL } from "../constants/api";
import { MAX_CHAT_LENGTH, MAX_MESSAGES, MAX_PLAYERS, PERFORMANCE_SECONDS } from "../constants/game";
import GameHeader from "../components/game/GameHeader";
import GameRoot from "../components/game/GameRoot";
import GameMain from "../components/game/GameMain";
import type { MobileGameTab } from "../components/game/GameMain";
import MobilePlayerStrip from "../components/game/MobilePlayerStrip";
import Leaderboard from "../components/game/Leaderboard";
import type { RankedUser } from "../components/game/Leaderboard";
import GameStage from "../components/game/GameStage";
import ChatPanel from "../components/game/ChatPanel";
import GameControls from "../components/game/GameControls";
import Toast from "../components/ui/Toast";
import Modal from "../components/ui/Modal";
import PixelIcon from "../components/ui/PixelIcon";

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

    const maxPlayers = MAX_PLAYERS;
    const { roomId } = useParams();
    const [messages, setMessages] = useState<SocketMessage[]>([]);
    const [inputMessage, setInputMessage] = useState("");
    const [userName, setUserName] = useState(() => storage.getUserName() || "Người chơi ẩn danh");
    const [userId, setUserId] = useState(() => storage.getUserId());
    const [sessionToken, setSessionToken] = useState(() => storage.getSessionToken());
    const roomName = storage.getRoomName();
    const [perfCountdown, setPerfCountdown] = useState(PERFORMANCE_SECONDS);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const pitchContourRef = useRef<number[]>([]);
    const pitchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pitchHistoryRef = useRef<number[]>([]);
    const pitchRejectStreakRef = useRef(0);

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
    const [removalNotice, setRemovalNotice] = useState<string | null>(null);
    const [canConnect, setCanConnect] = useState(false);
    const [mobileTab, setMobileTab] = useState<MobileGameTab>("stage");
    const [unreadChat, setUnreadChat] = useState(0);
    const mobileTabRef = useRef<MobileGameTab>("stage");

    const [myScore, setMyScore] = useState(0);
    const [playerList, setPlayerList] = useState<User[]>([]);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [mutedAll, setMutedAll] = useState(false);
    const [remoteVolume, setRemoteVolume] = useState(() => storage.getRemoteVolume());
    const [playerVolumes, setPlayerVolumes] = useState<Record<string, number>>(() => storage.getPlayerVolumes());
    const [hasMicPermission, setHasMicPermission] = useState(false);
    const [micPermissionAsked, setMicPermissionAsked] = useState(false);

    const fullTranscriptRef = useRef("");
    const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const speechRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const speechShouldRunRef = useRef(false);
    const [lyricsStatus, setLyricsStatus] = useState<LyricsStatus>("idle");

    const currentSongLyricsRef = useRef("");
    const toastTimerRef = useRef<number | null>(null);
    const removedRef = useRef(false);
    const mutedAllRef = useRef(mutedAll);
    const shouldStreamVoiceRef = useRef(false);

    useEffect(() => {
        mutedAllRef.current = mutedAll;
    }, [mutedAll]);

    const sendRoomMessage = (type: MessageType, content: SocketMessage["content"]) => {
        if (!roomId) return;
        websocketService.sendMessage(roomId, {
            type,
            content,
            sender: userId,
            roomId: roomId,
        });
    };

    const showToast = (type: "success" | "error" | "info", text: string) => {
        if (toastTimerRef.current !== null) {
            window.clearTimeout(toastTimerRef.current);
        }
        setToast({ type, text });
        toastTimerRef.current = window.setTimeout(() => {
            setToast(null);
            toastTimerRef.current = null;
        }, 3200);
    };

    useEffect(() => () => {
        if (toastTimerRef.current !== null) {
            window.clearTimeout(toastTimerRef.current);
        }
    }, []);

    const preloadVideo = (videoUrl: string) => {
        if (!videoUrl) return;

        try {
            let existing = document.getElementById("preload-video") as HTMLVideoElement | null;
            if (!existing) {
                existing = document.createElement("video");
                existing.id = "preload-video";
                existing.preload = "auto";
                existing.muted = true;
                existing.playsInline = true;
                existing.style.display = "none";
                document.body.appendChild(existing);
            }

            existing.pause();
            existing.removeAttribute("src");
            existing.load();
            existing.src = videoUrl;
            existing.load();
        } catch (err) {
            console.warn("Failed to preload video:", err);
        }
    };

    const evaluateLyricsResult = (userSangText: string) => {
        const cleanUserText = userSangText.toLowerCase();
        const pitchSamples = pitchContourRef.current;
        const voicedSamples = pitchSamples.filter((hz) => hz > 0).length;

        console.log("===============================");
        console.log("🎤 LỜI BÀI HÁT GỬI ĐI:", cleanUserText);
        console.log(`🎵 TẦN SỐ: ${pitchSamples.length} mẫu, ${voicedSamples} mẫu hợp lệ`);
        console.log("🎵 MẢNG TẦN SỐ (TONE) GỬI ĐI:", pitchSamples);
        console.log("===============================");
        sendRoomMessage("USER_LYRICS", {
            lyrics: cleanUserText,
            pitchContour: pitchSamples,
            songId: musicInfo.songId || null
        });
    };

    useEffect(() => {
        if (gameState === "PERFORMANCE") {
            setPerfCountdown(PERFORMANCE_SECONDS);
            const timer = setInterval(() => {
                setPerfCountdown((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState]);


    useEffect(() => {
        const isSinger = winnerUser?.userId === userId;
        let cancelled = false;
        let wakeLock: { release: () => Promise<void> } | null = null;

        const resumePitchContext = () => {
            // Mobile browsers only resume audio after a gesture, so hook any touch.
            void audioContextRef.current?.resume().catch(() => undefined);
        };

        const requestWakeLock = async () => {
            const wakeLockApi = (navigator as Navigator & {
                wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
            }).wakeLock;
            if (!wakeLockApi || wakeLock) return;
            try {
                wakeLock = await wakeLockApi.request("screen");
            } catch {
                /* browsers may reject when the tab is not focused */
            }
        };

        const reacquireWakeLock = () => {
            if (document.visibilityState !== "visible") return;
            wakeLock = null;
            void requestWakeLock();
        };

        const startPitchCapture = (stream: MediaStream) => {
            if (cancelled) return;
            const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextClass) return;

            const context = new AudioContextClass();
            audioContextRef.current = context;
            // A context created outside a user gesture can stay "suspended" and then the
            // analyser only yields zeros, which silently wipes the tone score.
            if (context.state === "suspended") {
                void context.resume().catch(() => undefined);
            }
            console.debug("Pitch capture context:", context.state);

            // Trim rumble and hiss before analysis. Phone mics pick up handling noise and
            // strong harmonics; without this the detector reports octave-jumped notes.
            const highpass = context.createBiquadFilter();
            highpass.type = "highpass";
            highpass.frequency.value = 70;
            highpass.Q.value = 0.7;
            const lowpass = context.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.frequency.value = 1500;
            lowpass.Q.value = 0.7;

            const analyser = context.createAnalyser();
            analyser.fftSize = 2048;
            analyserRef.current = analyser;

            const source = context.createMediaStreamSource(stream);
            source.connect(highpass);
            highpass.connect(lowpass);
            lowpass.connect(analyser);

            pitchIntervalRef.current = setInterval(() => {
                if (!analyserRef.current || !audioContextRef.current) return;
                if (audioContextRef.current.state === "suspended") {
                    void audioContextRef.current.resume().catch(() => undefined);
                }
                const buffer = new Float32Array(analyserRef.current.fftSize);
                analyserRef.current.getFloatTimeDomainData(buffer);
                const hz = autoCorrelate(buffer, audioContextRef.current.sampleRate);

                let validHz = 0.0;
                if (hz !== -1 && hz >= 70 && hz <= 1200) {
                    const semitone = 12 * Math.log2(hz / 440);
                    const history = pitchHistoryRef.current;
                    const reference = history.length >= 3 ? medianOf(history.slice(-3)) : Number.NaN;
                    const offset = semitone - reference;
                    // Harmonic-rich voices make the detector jump exactly one octave.
                    // Drop those until they persist, which means a real register change.
                    const octaveJump = Number.isFinite(offset) && Math.abs(Math.abs(offset) - 12) < 1.5;
                    if (octaveJump && pitchRejectStreakRef.current < 3) {
                        pitchRejectStreakRef.current += 1;
                    } else {
                        if (octaveJump) {
                            history.length = 0;
                        }
                        pitchRejectStreakRef.current = 0;
                        validHz = Number(hz.toFixed(2));
                        history.push(semitone);
                        if (history.length > 5) history.shift();
                    }
                }

                pitchContourRef.current.push(validHz);
            }, 200);
        };

        if (gameState === "PERFORMANCE" && isSinger) {
            fullTranscriptRef.current = "";
            pitchContourRef.current = [];
            pitchHistoryRef.current = [];
            pitchRejectStreakRef.current = 0;
            setLyricsStatus("idle");

            document.addEventListener("pointerdown", resumePitchContext);
            void requestWakeLock();
            document.addEventListener("visibilitychange", reacquireWakeLock);

            // The stream is created lazily when the performance starts, so wait for it
            // instead of silently skipping pitch analysis when it is not ready yet.
            if (localStreamRef.current) {
                startPitchCapture(localStreamRef.current);
            } else {
                ensureLocalStream()
                    .then((stream) => {
                        if (stream) startPitchCapture(stream);
                    })
                    .catch(() => undefined);
            }

            const SpeechRecognition = (window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition
                || (window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                speechRecognitionRef.current = recognition;
                speechShouldRunRef.current = true;

                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'vi-VN';

                recognition.onresult = (event) => {
                    let textBlock = '';
                    for (let i = 0; i < event.results.length; i++) {
                        textBlock += event.results[i][0].transcript + ' ';
                    }
                    fullTranscriptRef.current = textBlock;
                    setLyricsStatus("listening");
                };

                recognition.onerror = (event) => {
                    console.error("Lỗi nhận diện lời:", event.error);
                    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                        speechShouldRunRef.current = false;
                        setLyricsStatus("error");
                    } else if (event.error === "network") {
                        setLyricsStatus("error");
                    }
                };

                recognition.onend = () => {
                    if (!speechShouldRunRef.current || speechRecognitionRef.current !== recognition) return;
                    if (speechRestartTimerRef.current) {
                        clearTimeout(speechRestartTimerRef.current);
                    }
                    // Restarting inside onend throws on some phones, so wait briefly.
                    speechRestartTimerRef.current = setTimeout(() => {
                        if (!speechShouldRunRef.current || speechRecognitionRef.current !== recognition) return;
                        try {
                            recognition.start();
                            setLyricsStatus("listening");
                        } catch {
                            setLyricsStatus("error");
                        }
                    }, 600);
                };

                try {
                    recognition.start();
                    setLyricsStatus("listening");
                } catch {
                    setLyricsStatus("error");
                }
            } else {
                setLyricsStatus("unsupported");
            }

        } else {
            if (pitchIntervalRef.current) clearInterval(pitchIntervalRef.current);
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }

            speechShouldRunRef.current = false;
            if (speechRestartTimerRef.current) {
                clearTimeout(speechRestartTimerRef.current);
                speechRestartTimerRef.current = null;
            }
            if (speechRecognitionRef.current) {
                try {
                    speechRecognitionRef.current.stop();
                } catch {
                    /* ignore */
                }
                speechRecognitionRef.current = null;
            }
            setLyricsStatus("idle");

            const finalVoiceText = fullTranscriptRef.current.trim();
            if (gameState === "PERFORMANCE_EVALUATION" && isSinger) {
                evaluateLyricsResult(finalVoiceText || " ");
            } else {
                fullTranscriptRef.current = "";
            }
        }

        return () => {
            cancelled = true;
            document.removeEventListener("pointerdown", resumePitchContext);
            document.removeEventListener("visibilitychange", reacquireWakeLock);
            if (wakeLock) {
                void wakeLock.release().catch(() => undefined);
                wakeLock = null;
            }
            speechShouldRunRef.current = false;
            if (speechRestartTimerRef.current) {
                clearTimeout(speechRestartTimerRef.current);
                speechRestartTimerRef.current = null;
            }
            if (pitchIntervalRef.current) {
                clearInterval(pitchIntervalRef.current);
                pitchIntervalRef.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => undefined);
                audioContextRef.current = null;
            }
            if (speechRecognitionRef.current) {
                try {
                    speechRecognitionRef.current.stop();
                } catch {
                    /* ignore */
                }
                speechRecognitionRef.current = null;
            }
        };
    }, [gameState, winnerUser, userId]);

    const [musicInfo, setMusicInfo] = useState<MusicInfo>({
        videoUrl: "",
        startSeconds: 0,
        isPlaying: false,
        serverStartTime: 0,
    });

    const playSound = (fileName: string) => {
        const audio = new Audio(`/sounds/${fileName}`);
        audio.muted = mutedAllRef.current;
        audio.play().catch(error => console.log("Chưa thể phát âm thanh:", error));
    };

    const localStreamRef = useRef<MediaStream | null>(null);
    const localStreamPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
    const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
    const remoteAudioRef = useRef<Record<string, HTMLAudioElement>>({});
    const remoteStreamRef = useRef<Record<string, MediaStream>>({});
    // Received voice is processed locally: a compressor lifts quiet laptop mics,
    // the gain node is the user's volume slider, and a limiter stops loud peaks
    // from distorting when that slider is above 100%.
    const remoteAudioContextRef = useRef<AudioContext | null>(null);
    const remoteVolumeRef = useRef(remoteVolume);
    const playerVolumesRef = useRef(playerVolumes);
    const remoteAudioGraphRef = useRef<Record<string, {
        source: MediaStreamAudioSourceNode;
        gain: GainNode;
        nodes: AudioNode[];
    }>>({});

    const rtcConfig: RTCConfiguration = {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    };

    useEffect(() => {
        if (gameState === "COUNTDOWN") {
            setCountdownNum(3);
            const timer = setInterval(() => {
                setCountdownNum((prev) => (prev > 0 ? prev - 1 : 0));
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
        if (localStreamPromiseRef.current) {
            return localStreamPromiseRef.current;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            showToast("error", "Trình duyệt không hỗ trợ Micro.");
            return null;
        }
        const promise = navigator.mediaDevices.getUserMedia({
            audio: {
                // During a performance the backing track is paused, so echo cancellation
                // has nothing useful to remove and only ends up thinning out the voice,
                // which breaks pitch detection. Keep AGC so quiet singers still register.
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: true,
                channelCount: 1,
            },
        }).catch(() => navigator.mediaDevices.getUserMedia({ audio: true })).then(stream => {
            localStreamRef.current = stream;
            setHasMicPermission(true);
            setMicPermissionAsked(true);
            stream.getAudioTracks().forEach(track => {
                track.enabled = shouldStreamVoiceRef.current;
            });
            attachLocalTracks();
            return stream;
        }).finally(() => {
            localStreamPromiseRef.current = null;
        });
        localStreamPromiseRef.current = promise;
        return promise;
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
        console.debug("attachLocalTracks: attaching", tracks.map(t => t.kind));
        Object.values(peerConnectionsRef.current).forEach(pc => {
            tracks.forEach(track => {
                console.debug("attachLocalTracks: pc", pc, "track", track.kind);
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

    const applyRemoteGain = (gain: GainNode, value: number) => {
        try {
            gain.gain.setTargetAtTime(value, gain.context.currentTime, 0.03);
        } catch {
            try { gain.gain.value = value; } catch { /* ignore */ }
        }
    };

    const ensureRemoteAudioContext = () => {
        if (!remoteAudioContextRef.current) {
            const AudioCtor = window.AudioContext
                || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtor) return null;
            try {
                const ctx = new AudioCtor();
                ctx.onstatechange = () => {
                    Object.keys(remoteStreamRef.current).forEach(peerId => syncRemotePlayback(peerId));
                };
                remoteAudioContextRef.current = ctx;
            } catch {
                return null;
            }
        }
        const ctx = remoteAudioContextRef.current;
        if (ctx.state === "suspended") {
            ctx.resume().catch(() => undefined);
        }
        return ctx;
    };

    const detachRemoteAudioGraph = (peerId: string) => {
        const graph = remoteAudioGraphRef.current[peerId];
        if (!graph) return;
        graph.nodes.forEach(node => {
            try { node.disconnect(); } catch { /* ignore */ }
        });
        delete remoteAudioGraphRef.current[peerId];
    };

    // A per-player slider overrides the shared level; unmuting keeps whichever
    // value that player already has.
    const remoteGainValue = (peerId: string) => {
        if (mutedAllRef.current) return 0;
        const percent = playerVolumesRef.current[peerId] ?? remoteVolumeRef.current;
        return percent / 100;
    };

    // Keeps the <audio> element as the audible path only while WebAudio is not
    // running yet (autoplay policy), so a suspended context never means silence.
    const syncRemotePlayback = (peerId: string) => {
        const audio = remoteAudioRef.current[peerId];
        if (!audio) return;
        const ctx = remoteAudioContextRef.current;
        const graph = remoteAudioGraphRef.current[peerId];
        const graphRunning = !!graph && !!ctx && ctx.state === "running";
        try {
            if (graphRunning) {
                audio.muted = true;
            } else {
                audio.muted = mutedAllRef.current;
                audio.volume = Math.min(1, Math.max(0, remoteGainValue(peerId)));
            }
        } catch { /* ignore */ }
    };

    const attachRemoteAudioGraph = (peerId: string, stream: MediaStream) => {
        const ctx = ensureRemoteAudioContext();
        if (!ctx) return false;
        detachRemoteAudioGraph(peerId);
        try {
            const source = ctx.createMediaStreamSource(stream);

            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = -28;
            compressor.knee.value = 12;
            compressor.ratio.value = 3;
            compressor.attack.value = 0.006;
            compressor.release.value = 0.25;

            const gain = ctx.createGain();
            gain.gain.value = remoteGainValue(peerId);

            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = -2;
            limiter.knee.value = 0;
            limiter.ratio.value = 20;
            limiter.attack.value = 0.002;
            limiter.release.value = 0.15;

            source.connect(compressor).connect(gain).connect(limiter).connect(ctx.destination);
            remoteAudioGraphRef.current[peerId] = {
                source,
                gain,
                nodes: [source, compressor, gain, limiter],
            };
            return true;
        } catch (err) {
            console.debug("Không tạo được xử lý âm thanh cho", peerId, err);
            detachRemoteAudioGraph(peerId);
            return false;
        }
    };

    const teardownPeer = (peerId: string) => {
        const pc = peerConnectionsRef.current[peerId];
        if (pc) {
            try { pc.close(); } catch { /* ignore */ }
            delete peerConnectionsRef.current[peerId];
        }
        detachRemoteAudioGraph(peerId);
        const audio = remoteAudioRef.current[peerId];
        if (audio) {
            try {
                audio.pause();
                audio.srcObject = null;
            } catch { /* ignore */ }
            delete remoteAudioRef.current[peerId];
        }
        delete remoteStreamRef.current[peerId];
    };

    const createPeerConnection = (peerId: string) => {
        const existing = peerConnectionsRef.current[peerId];
        if (existing) return existing;
        const pc = new RTCPeerConnection(rtcConfig);
        let negotiating = false;

        pc.onnegotiationneeded = async () => {
            if (negotiating || !localStreamRef.current) return;
            negotiating = true;
            try {
                await pc.setLocalDescription();
                if (pc.localDescription) {
                    sendRtcSignal({ action: "offer", from: userId, to: peerId, sdp: pc.localDescription });
                }
            } catch (err) {
                console.error("Lỗi gửi offer:", err);
            } finally {
                negotiating = false;
            }
        };

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
            console.debug("pc.ontrack from", peerId, "tracks:", event.streams?.length, event.track && event.track.kind);
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
                console.debug("setting audio.srcObject for", peerId);
                audio.srcObject = stream;
            }

            if (!remoteAudioGraphRef.current[peerId]) {
                attachRemoteAudioGraph(peerId, stream);
            }
            syncRemotePlayback(peerId);

            audio.play().catch((err) => {
                console.debug("audio.play failed for", peerId, err);
                // If autoplay is blocked, wait for first user gesture to resume
                const onFirstGesture = () => {
                    try {
                        syncRemotePlayback(peerId);
                        audio.play().catch(() => undefined);
                    } catch { /* ignore */ }
                    document.removeEventListener("click", onFirstGesture);
                    document.removeEventListener("keydown", onFirstGesture);
                };
                document.addEventListener("click", onFirstGesture, { once: true });
                document.addEventListener("keydown", onFirstGesture, { once: true });
            });
        };

        pc.onconnectionstateChange = () => {
            if (pc.connectionState === "failed") {
                teardownPeer(peerId);
            } else if (pc.connectionState === "disconnected") {
                window.setTimeout(() => {
                    if (peerConnectionsRef.current[peerId] === pc && pc.connectionState === "disconnected") {
                        pc.restartIce();
                    }
                }, 3000);
            }
        };

        peerConnectionsRef.current[peerId] = pc;
        if (localStreamRef.current) {
            attachLocalTracks();
        }
        return pc;
    };

    useEffect(() => {
        remoteVolumeRef.current = remoteVolume;
        storage.setRemoteVolume(remoteVolume);
        Object.entries(remoteAudioGraphRef.current).forEach(([peerId, { gain }]) => {
            applyRemoteGain(gain, remoteGainValue(peerId));
        });
        Object.keys(remoteAudioRef.current).forEach(syncRemotePlayback);
    }, [remoteVolume]);

    useEffect(() => {
        playerVolumesRef.current = playerVolumes;
        storage.setPlayerVolumes(playerVolumes);
        Object.entries(remoteAudioGraphRef.current).forEach(([peerId, { gain }]) => {
            applyRemoteGain(gain, remoteGainValue(peerId));
        });
        Object.keys(remoteAudioRef.current).forEach(syncRemotePlayback);
    }, [playerVolumes]);

    useEffect(() => {
        Object.entries(remoteAudioGraphRef.current).forEach(([peerId, { gain }]) => {
            applyRemoteGain(gain, remoteGainValue(peerId));
        });
        Object.keys(remoteAudioRef.current).forEach(syncRemotePlayback);
    }, [mutedAll]);

    useEffect(() => {
        // Browsers start the audio context suspended until the user interacts.
        const resumePlayback = () => {
            const ctx = remoteAudioContextRef.current;
            if (!ctx || ctx.state === "running") return;
            ctx.resume().then(() => {
                Object.keys(remoteAudioRef.current).forEach(syncRemotePlayback);
            }).catch(() => undefined);
        };
        document.addEventListener("pointerdown", resumePlayback);
        document.addEventListener("keydown", resumePlayback);
        return () => {
            document.removeEventListener("pointerdown", resumePlayback);
            document.removeEventListener("keydown", resumePlayback);
        };
    }, []);

    const isForcedVoice = gameState === "PERFORMANCE" && winnerUser?.userId === userId;
    const isMusicPlaying = gameState === "PLAY_SEGMENT";
    const isOtherPerformance = gameState === "PERFORMANCE" && !!winnerUser?.userId && winnerUser.userId !== userId;
    const shouldStreamVoice = voiceEnabled || isForcedVoice;

    useEffect(() => {
        if (removedRef.current) return;
        shouldStreamVoiceRef.current = shouldStreamVoice;
        setLocalTrackEnabled(shouldStreamVoice);
        if (!shouldStreamVoice || localStreamRef.current) return;
        let cancelled = false;
        ensureLocalStream()
            .then(() => {
                if (!cancelled) setLocalTrackEnabled(true);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [shouldStreamVoice]);

    useEffect(() => {
        if ((isMusicPlaying || isOtherPerformance) && voiceEnabled) {
            setVoiceEnabled(false);
        }
    }, [isMusicPlaying, isOtherPerformance, voiceEnabled]);

    useEffect(() => {
        if (!userId) return;
        playerList
            .map(p => p.userId)
            .filter(id => id && id !== userId)
            .forEach((peerId) => {
                createPeerConnection(peerId);
            });
    }, [playerList, userId]);

    // The roster broadcast is authoritative: if someone was kicked or left,
    // drop their audio path right away instead of waiting for ICE to fail.
    useEffect(() => {
        if (!userId) return;
        const activeIds = new Set(playerList.map(p => p.userId));
        Object.keys(peerConnectionsRef.current).forEach(peerId => {
            if (peerId !== userId && !activeIds.has(peerId)) {
                teardownPeer(peerId);
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
        let active = true;

        const applySession = (data: JoinRoomResponse) => {
            if (removedRef.current) return;
            storage.setUserId(data.user.userId);
            storage.setRoomName(data.room.roomName);
            storage.setRoomId(data.room.roomId);
            storage.setSessionToken(data.sessionToken);
            setUserId(data.user.userId);
            setSessionToken(data.sessionToken);
            setUserName(data.user.userName);
            if (data.room.upcomingVideoUrl) {
                preloadVideo(data.room.upcomingVideoUrl);
            }
            setCanConnect(true);
        };

        const fail = (error: unknown) => {
            const code = getApiErrorCode(error);
            if (code === "ROOM_NOT_FOUND") {
                showToast("error", "Không tìm thấy phòng.");
            } else if (code === "ROOM_FULL") {
                showToast("error", "Phòng đã đầy (5/5).");
            } else if (code === "ROOM_PLAYING") {
                showToast("error", "Phòng đang chơi, bạn không thể vào lại lúc này.");
            } else if (code === "RATE_LIMITED") {
                showToast("error", "Bạn thao tác quá nhanh, vui lòng thử lại sau.");
            } else {
                showToast("error", getApiErrorMessage(error, "Không thể vào phòng. Vui lòng thử lại."));
            }
            storage.clearSessionToken();
            setSessionToken("");
            window.setTimeout(() => {
                window.location.href = "/";
            }, 1400);
        };

        const enterRoom = async () => {
            const token = storage.getSessionToken();
            if (token) {
                try {
                    const data = await roomService.rejoin(token);
                    if (!active) return;
                    applySession(data);
                    return;
                } catch (error) {
                    if (!active) return;
                    if (getApiErrorCode(error) !== "SESSION_INVALID") {
                        fail(error);
                        return;
                    }
                    storage.clearSessionToken();
                    setSessionToken("");
                }
            }
            try {
                const data = await roomService.joinRoom(roomId, storedName);
                if (!active) return;
                applySession(data);
            } catch (error) {
                if (!active) return;
                fail(error);
            }
        };

        setCanConnect(false);
        enterRoom();

        return () => {
            active = false;
        };
    }, [roomId]);

    // Kicked or invalid session: stop every media path immediately and keep a
    // blocking notice on screen. There is deliberately no auto-redirect, so a
    // backgrounded tab still shows the reason when the player comes back.
    const handleRemovedFromRoom = (reason: string) => {
        if (removedRef.current) return;
        removedRef.current = true;
        setRemovalNotice(reason);
        setKickTarget(null);
        setVoiceEnabled(false);
        shouldStreamVoiceRef.current = false;
        setLocalTrackEnabled(false);
        Object.keys(peerConnectionsRef.current).forEach(teardownPeer);
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        if (remoteAudioContextRef.current) {
            remoteAudioContextRef.current.close().catch(() => undefined);
            remoteAudioContextRef.current = null;
        }
        if (pitchIntervalRef.current) {
            clearInterval(pitchIntervalRef.current);
            pitchIntervalRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => undefined);
            audioContextRef.current = null;
            analyserRef.current = null;
        }
        speechShouldRunRef.current = false;
        if (speechRestartTimerRef.current) {
            clearTimeout(speechRestartTimerRef.current);
            speechRestartTimerRef.current = null;
        }
        if (speechRecognitionRef.current) {
            try {
                speechRecognitionRef.current.stop();
            } catch { /* ignore */ }
            speechRecognitionRef.current = null;
        }
        fullTranscriptRef.current = "";
        setLyricsStatus("idle");
        const preload = document.getElementById("preload-video") as HTMLVideoElement | null;
        preload?.pause();
        setMusicInfo(prev => (prev.isPlaying ? { ...prev, isPlaying: false } : prev));
        storage.setRoomId("");
        storage.clearSessionToken();
        setSessionToken("");
    };

    useEffect(() => {
        if (!roomId || !userId || !sessionToken || !canConnect) return;

        websocketService.connect(roomId, sessionToken, {
            onMessage: (message) => {
                if (message.type === "JOIN") {
                    if (Array.isArray(message.content)) {
                        setPlayerList(message.content as User[]);
                    }
                }
                else if (message.type === "CHAT") {
                    setMessages((prevMessages) => [...prevMessages, message].slice(-MAX_MESSAGES));
                    if (message.sender !== userId) {
                        playSound("ting.mp3");
                        if (mobileTabRef.current !== "chat") {
                            setUnreadChat((count) => count + 1);
                        }
                    }
                }

                else if (message.type === "PLAY_SEGMENT") {
                    if (typeof message.content === "string") return;
                    const state = message.content as MusicInfo;
                    setMusicInfo(state);
                    setGameState("PLAY_SEGMENT");
                    setClickCount(0);
                    setNoWinnerMessage(null);
                } else if (message.type === "PRELOAD") {
                    if (typeof message.content === "string") return;
                    const state = message.content as MusicInfo;
                    if (state?.videoUrl) {
                        setMusicInfo(state);
                        preloadVideo(state.videoUrl);
                    }
                } else if (message.type === "BATTLE") {
                    setGameState("BATTLE");
                    setClickCount(0);
                    setMusicInfo(prev => ({ ...prev, isPlaying: false }));
                } else if (message.type === "WINNER_SHOW") {
                    setGameState("WINNER_SHOW");
                    if (message.content && typeof message.content === "object" && "userName" in message.content) {
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
                    if (!message.content || typeof message.content !== "object") return;
                    const payload = message.content as PerformanceResultPayload;
                    if (!payload.user) return;
                    setGameState("SCORE_SHOW");
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
                        setNotification(`Chúc mừng ${performanceUser.userName} đã được cộng 1 điểm!`);
                    } else {
                        playSound("failure.mp3");
                        setNotification(`Rất tiếc ${performanceUser.userName} chưa được cộng điểm.`);
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
                    setClickCount(0);
                    setGameState("LOBBY");
                }
                else if (message.type === "KICK_PLAYER") {
                    if (typeof message.content === "string" && message.content === userId) {
                        handleRemovedFromRoom("Bạn đã bị chủ phòng mời ra khỏi phòng.");
                    }
                }
                else if (message.type === "RTC_SIGNAL") {
                    if (!message.content || typeof message.content !== "object") return;
                    const payload = message.content as RtcSignalPayload;
                    if (!payload.from || payload.from === userId) return;
                    if (payload.to && payload.to !== userId) return;

                    const peerId = payload.from;
                    const pc = createPeerConnection(peerId);
                    const remoteSdp = payload.sdp;

                    if (payload.action === "offer" && remoteSdp) {
                        // Perfect negotiation: the peer with the larger id politely yields on glare.
                        const polite = userId > peerId;
                        const collision = pc.signalingState !== "stable";
                        if (collision && !polite) return;
                        (async () => {
                            try {
                                if (collision) {
                                    await pc.setLocalDescription({ type: "rollback" });
                                }
                                await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
                                await pc.setLocalDescription();
                                if (pc.localDescription) {
                                    sendRtcSignal({
                                        action: "answer",
                                        from: userId,
                                        to: peerId,
                                        sdp: pc.localDescription,
                                    });
                                }
                            } catch (err) {
                                console.error("Lỗi nhận offer:", err);
                            }
                        })();
                    } else if (payload.action === "answer" && remoteSdp) {
                        if (pc.signalingState !== "have-local-offer") return;
                        pc.setRemoteDescription(new RTCSessionDescription(remoteSdp))
                            .catch(err => console.error("Lỗi nhận answer:", err));
                    } else if (payload.action === "candidate" && payload.candidate) {
                        pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
                            .catch(err => console.error("Lỗi ICE candidate:", err));
                    }
                }
            },
            onConnected: () => {
                sendRoomMessage("JOIN", "");
            },
            onError: (text) => {
                showToast("error", text);
            },
            onSessionInvalid: () => {
                handleRemovedFromRoom("Phiên của bạn đã hết hiệu lực hoặc bạn đã được mời ra khỏi phòng.");
            },
        });

        return () => {
            websocketService.disconnect();
        };
    }, [roomId, userId, sessionToken, canConnect]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            if (!sessionToken) return;
            const data = new URLSearchParams({ sessionToken });
            const blob = new Blob([data.toString()], { type: "application/x-www-form-urlencoded" });
            navigator.sendBeacon?.(`${API_BASE_URL}/api/rooms/leave`, blob);
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [sessionToken]);

    useEffect(() => () => {
        Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
        peerConnectionsRef.current = {};
        Object.keys(remoteAudioGraphRef.current).forEach(detachRemoteAudioGraph);
        Object.values(remoteAudioRef.current).forEach(audio => {
            audio.srcObject = null;
        });
        remoteAudioRef.current = {};
        remoteStreamRef.current = {};
        if (remoteAudioContextRef.current) {
            remoteAudioContextRef.current.close().catch(() => undefined);
            remoteAudioContextRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
    }, []);

    const handleLeaveRoom = async () => {
        try {
            if (sessionToken) {
                await roomService.leaveRoom(sessionToken);
            }
        } catch (error) {
            console.error("Failed to leave room", error);
        } finally {
            storage.setRoomId("");
            storage.clearSessionToken();
            setSessionToken("");
            window.location.href = "/";
        }
    };

    const isHiddenPreloadReady = () => {
        const preloadVideo = document.getElementById("preload-video") as HTMLVideoElement | null;
        if (!preloadVideo) return false;
        return preloadVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    };

    const handleStartGame = () => {
        if (!isHost || gameState !== "LOBBY") return;
        const startGameNow = () => sendRoomMessage("PLAY_SEGMENT", "");

        if (isHiddenPreloadReady()) {
            startGameNow();
            return;
        }

        const preloadVideo = document.getElementById("preload-video") as HTMLVideoElement | null;
        if (!preloadVideo) {
            startGameNow();
            return;
        }

        const onReady = () => {
            preloadVideo.removeEventListener("canplay", onReady);
            preloadVideo.removeEventListener("loadeddata", onReady);
            startGameNow();
        };

        preloadVideo.addEventListener("canplay", onReady, { once: true });
        preloadVideo.addEventListener("loadeddata", onReady, { once: true });
    };

    const handleBuzzerClick = () => {
        playSound("buzzer.mp3");
        setClickCount(prev => prev + 1);
        sendRoomMessage("BATTLE", "");
    };

    const handleSendMessage = () => {
        const content = inputMessage.trim().slice(0, MAX_CHAT_LENGTH);
        if (!roomId || !content) return;
        sendRoomMessage("CHAT", content);
        setInputMessage("");
    };

    const handlePlayerVolumeChange = (peerId: string, value: number) => {
        const clamped = Math.min(300, Math.max(0, Math.round(value)));
        setPlayerVolumes(prev => ({ ...prev, [peerId]: clamped }));
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

    const handleToggleReady = async () => {
        if (!isReady && !hasMicPermission) {
            await requestMicPermission(false);
        }
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
        showToast("success", `Đã mời ${kickTarget.userName} ra khỏi phòng.`);
    };

    const handleRename = () => {
        const trimmed = renameValue.trim();
        if (!trimmed) {
            showToast("error", "Tên không được để trống.");
            return;
        }
        if (trimmed.length > 24) {
            showToast("error", "Tên tối đa 24 ký tự.");
            return;
        }
        storage.setUserName(trimmed);
        setUserName(trimmed);
        sendRoomMessage("RENAME", { userName: trimmed });
        setShowRename(false);
        showToast("success", "Đã cập nhật tên hiển thị.");
    };

    const handleMobileTabChange = (tab: MobileGameTab) => {
        mobileTabRef.current = tab;
        setMobileTab(tab);
        if (tab === "chat") {
            setUnreadChat(0);
        }
    };

    const sortedPlayers = [...playerList].sort((a, b) => b.score - a.score);
    let currentRank = 1;
    const rankedPlayers: RankedUser[] = sortedPlayers.map((user, index) => {
        if (index > 0 && user.score < sortedPlayers[index - 1].score) {
            currentRank = index + 1;
        }
        return { ...user, rank: currentRank };
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
                    mutedAll={mutedAll}
                    onToggleMute={() => setMutedAll(prev => !prev)}
                    remoteVolume={remoteVolume}
                    onRemoteVolumeChange={setRemoteVolume}
                    onLeaveRoom={handleLeaveRoom}
                    onRename={() => {
                        setRenameValue(userName);
                        setShowRename(true);
                    }}
                />
            }
            main={
                <GameMain
                    left={
                        <Leaderboard
                            rankedPlayers={rankedPlayers}
                            userId={userId}
                            masterVolume={remoteVolume}
                            playerVolumes={playerVolumes}
                            onPlayerVolumeChange={handlePlayerVolumeChange}
                        />
                    }
                    mobileTab={mobileTab}
                    onMobileTabChange={handleMobileTabChange}
                    unreadChat={unreadChat}
                    strip={<MobilePlayerStrip rankedPlayers={rankedPlayers} userId={userId} />}
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
                            muted={mutedAll}
                            clickCount={clickCount}
                            onBuzzer={handleBuzzerClick}
                            winnerUser={winnerUser}
                            userId={userId}
                            countdownNum={countdownNum}
                            notification={notification}
                            noWinnerMessage={noWinnerMessage}
                            rankedPlayers={rankedPlayers}
                            lyricsStatus={lyricsStatus}
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
                            userId={userId}
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
                        <Modal
                            title="Đổi tên hiển thị"
                            icon="edit"
                            onClose={() => setShowRename(false)}
                            actions={(
                                <>
                                    <button type="button" className="pbtn" onClick={() => setShowRename(false)}>
                                        Hủy
                                    </button>
                                    <button type="button" className="pbtn pbtn--primary" onClick={handleRename}>
                                        <PixelIcon name="check" size={16} />
                                        Lưu
                                    </button>
                                </>
                            )}
                        >
                            <div className="p-field">
                                <label className="p-label" htmlFor="game-rename-input">
                                    <PixelIcon name="heart" size={15} />
                                    Tên hiển thị
                                </label>
                                <input
                                    id="game-rename-input"
                                    className="p-input"
                                    value={renameValue}
                                    maxLength={24}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    placeholder="Nhập tên mới"
                                    autoFocus
                                />
                            </div>
                            <p className="p-muted p-tiny">Tên mới sẽ hiện với mọi người trong phòng.</p>
                        </Modal>
                    )}
                    {kickTarget && (
                        <Modal
                            title="Mời người chơi rời phòng?"
                            icon="warning"
                            onClose={() => setKickTarget(null)}
                            actions={(
                                <>
                                    <button type="button" className="pbtn" onClick={() => setKickTarget(null)}>
                                        Hủy
                                    </button>
                                    <button type="button" className="pbtn pbtn--danger" onClick={confirmKick}>
                                        <PixelIcon name="door" size={16} />
                                        Đồng ý
                                    </button>
                                </>
                            )}
                        >
                            <p className="p-muted">
                                Bạn có chắc chắn muốn mời <strong>{kickTarget.userName}</strong> ra khỏi phòng không?
                            </p>
                        </Modal>
                    )}
                    {removalNotice && (
                        <Modal
                            title="Bạn đã rời khỏi phòng"
                            icon="warning"
                            actions={(
                                <button
                                    type="button"
                                    className="pbtn pbtn--primary"
                                    onClick={() => { window.location.href = "/"; }}
                                >
                                    <PixelIcon name="home" size={16} />
                                    Về trang chủ
                                </button>
                            )}
                        >
                            <p className="p-muted">{removalNotice}</p>
                        </Modal>
                    )}
                </>
            }
        />
    );
}
function medianOf(values: number[]) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}
function autoCorrelate(buf: Float32Array, sampleRate: number) {
    const SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
        rms += buf[i] * buf[i];
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    // Normalized square difference function (NSDF). Picking the strongest peak of a
    // plain autocorrelation locks onto sub-harmonics above ~700 Hz (784 -> 196 Hz,
    // which is an octave error and destroys the tone score); the first strong peak is
    // always the fundamental.
    const minLag = Math.max(2, Math.floor(sampleRate / 1100));
    const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(SIZE / 2));
    const lagCount = maxLag - minLag + 1;
    if (lagCount < 3) return -1;

    const nsdf = new Float32Array(lagCount);
    let maxValue = 0;
    for (let idx = 0; idx < lagCount; idx++) {
        const lag = minLag + idx;
        const limit = SIZE - lag;
        let corr = 0;
        let energy = 0;
        for (let i = 0; i < limit; i++) {
            const a = buf[i];
            const b = buf[i + lag];
            corr += a * b;
            energy += a * a + b * b;
        }
        const value = energy > 1e-9 ? (2 * corr) / energy : 0;
        nsdf[idx] = value;
        if (value > maxValue) maxValue = value;
    }
    if (maxValue <= 0.3) return -1;

    const peaks: { index: number; value: number }[] = [];
    for (let idx = 0; idx < lagCount; idx++) {
        const prev = idx > 0 ? nsdf[idx - 1] : -1;
        const next = idx < lagCount - 1 ? nsdf[idx + 1] : -1;
        if (nsdf[idx] > prev && nsdf[idx] >= next && nsdf[idx] > 0) {
            peaks.push({ index: idx, value: nsdf[idx] });
        }
    }
    if (peaks.length === 0) return -1;

    const threshold = maxValue * 0.9;
    let chosen = peaks[0];
    for (const peak of peaks) {
        if (peak.value >= threshold) {
            chosen = peak;
            break;
        }
    }
    // A weak peak is noise rather than a sung note. Reporting it would feed random
    // semitones into the score, which is what noisy phone mics used to do.
    if (chosen.value < 0.6) return -1;

    const i = chosen.index;
    const x1 = nsdf[Math.max(0, i - 1)];
    const x2 = nsdf[i];
    const x3 = nsdf[Math.min(lagCount - 1, i + 1)];
    const denom = x1 + x3 - 2 * x2;
    let offset = 0;
    if (Math.abs(denom) > 1e-9) {
        offset = Math.max(-0.5, Math.min(0.5, (x3 - x1) / (2 * denom)));
    }

    const period = minLag + i + offset;
    if (!Number.isFinite(period) || period <= 0) return -1;
    const hz = sampleRate / period;
    return hz >= 70 && hz <= 1200 ? hz : -1;
}
