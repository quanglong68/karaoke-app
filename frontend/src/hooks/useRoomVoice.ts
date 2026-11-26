import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "../types/game";
import type { RtcSignalPayload } from "../types/socket";
import type { User } from "../types/user";
import { applyRemoteDescription, clearPendingIceCandidates, queueIceCandidate } from "../services/iceCandidates";
import { storage } from "../utils/storage";
import {
    applyRemoteGain,
    createAudioContext,
    createPeerAudioGraph,
    disconnectPeerAudioGraph,
    syncAudioElementPlayback,
    type PeerAudioGraph,
} from "../utils/remoteAudioGraph";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function parseIceServers(raw: string | undefined): RTCIceServer[] {
    const trimmed = raw?.trim();
    if (!trimmed) {
        return DEFAULT_ICE_SERVERS;
    }
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            return DEFAULT_ICE_SERVERS;
        }
        const valid = parsed.filter((entry): entry is RTCIceServer => {
            if (!entry || typeof entry !== "object") return false;
            const urls = (entry as { urls?: unknown }).urls;
            return typeof urls === "string"
                || (Array.isArray(urls) && urls.length > 0 && urls.every(u => typeof u === "string"));
        });
        return valid.length > 0 ? valid : DEFAULT_ICE_SERVERS;
    } catch {
        console.warn("Invalid VITE_ICE_SERVERS_JSON, falling back to default STUN server.");
        return DEFAULT_ICE_SERVERS;
    }
}

const RTC_CONFIG: RTCConfiguration = {
    iceServers: parseIceServers(import.meta.env.VITE_ICE_SERVERS_JSON as string | undefined),
};
const MAX_VOLUME_PERCENT = 300;
const ICE_RESTART_DELAY_MS = 3000;
const MAX_PEER_RECOVERY_ATTEMPTS = 2;

interface UseRoomVoiceOptions {
    userId: string;
    playerList: User[];
    gameState: GameState;
    winnerUser: User | null;
    sendRtcSignal: (payload: RtcSignalPayload) => void;
    showToast: (type: "success" | "error" | "info", text: string) => void;
}

/**
 * Manages microphone acquisition, WebRTC peer mesh signalling and per-peer WebAudio playback.
 */
export function useRoomVoice({
    userId,
    playerList,
    gameState,
    winnerUser,
    sendRtcSignal,
    showToast,
}: UseRoomVoiceOptions) {
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [mutedAll, setMutedAll] = useState(false);
    const [remoteVolume, setRemoteVolume] = useState(() => storage.getRemoteVolume());
    const [playerVolumes, setPlayerVolumes] = useState<Record<string, number>>(() => storage.getPlayerVolumes());
    const [hasMicPermission, setHasMicPermission] = useState(false);
    const [micPermissionAsked, setMicPermissionAsked] = useState(false);

    const mutedAllRef = useRef(mutedAll);
    const removedRef = useRef(false);
    const disposedRef = useRef(false);
    const shouldStreamVoiceRef = useRef(false);
    const localStreamRef = useRef<MediaStream | null>(null);
    const localStreamPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
    const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
    const activePeerIdsRef = useRef<Set<string>>(new Set());
    const peerRetryCountRef = useRef<Record<string, number>>({});
    const peerRetryTimersRef = useRef<Record<string, number>>({});
    const createPeerConnectionRef = useRef<(peerId: string) => RTCPeerConnection | null>(() => null);
    const remoteAudioRef = useRef<Record<string, HTMLAudioElement>>({});
    const remoteStreamRef = useRef<Record<string, MediaStream>>({});
    const remoteAudioContextRef = useRef<AudioContext | null>(null);
    const remoteVolumeRef = useRef(remoteVolume);
    const playerVolumesRef = useRef(playerVolumes);
    const remoteAudioGraphRef = useRef<Record<string, PeerAudioGraph>>({});

    const setLocalTrackEnabled = useCallback((enabled: boolean) => {
        if (!localStreamRef.current) return;
        localStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = enabled;
        });
    }, []);

    const attachLocalTracks = useCallback(() => {
        const stream = localStreamRef.current;
        if (!stream) return;
        const tracks = stream.getTracks();
        Object.values(peerConnectionsRef.current).forEach(pc => {
            tracks.forEach(track => {
                const existingTransceiver = pc.getTransceivers?.().find(
                    transceiver => transceiver.sender.track?.kind === track.kind
                        || (!transceiver.sender.track && transceiver.receiver.track?.kind === track.kind),
                );
                const existingSender = existingTransceiver?.sender
                    ?? pc.getSenders().find(sender => sender.track?.kind === track.kind);
                if (existingSender) {
                    if (existingTransceiver && existingTransceiver.direction === "recvonly") {
                        existingTransceiver.direction = "sendrecv";
                    }
                    void existingSender.replaceTrack(track);
                } else {
                    pc.addTrack(track, stream);
                }
            });
        });
    }, []);

    const ensureLocalStream = useCallback(async () => {
        if (localStreamRef.current) return localStreamRef.current;
        if (localStreamPromiseRef.current) return localStreamPromiseRef.current;
        if (!navigator.mediaDevices?.getUserMedia) {
            showToast("error", "Trình duyệt không hỗ trợ Micro.");
            return null;
        }
        const promise = navigator.mediaDevices.getUserMedia({
            audio: {
                // During a performance the backing track is paused, so echo cancellation
                // thins out the voice and breaks pitch detection. Keep AGC for quiet singers.
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: true,
                channelCount: 1,
            },
        }).catch(() => navigator.mediaDevices.getUserMedia({ audio: true })).then(stream => {
            if (disposedRef.current || removedRef.current) {
                stream.getTracks().forEach(track => track.stop());
                return null;
            }
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
    }, [attachLocalTracks, showToast]);

    const requestMicPermission = useCallback(async (showAlert: boolean) => {
        setMicPermissionAsked(true);
        if (!navigator.mediaDevices?.getUserMedia) {
            if (showAlert) showToast("error", "Trình duyệt không hỗ trợ Micro.");
            return false;
        }
        try {
            await ensureLocalStream();
            return true;
        } catch (err) {
            console.error("Lỗi Mic:", err);
            if (showAlert) showToast("error", "Vui lòng cấp quyền Micro để dùng voice.");
            return false;
        }
    }, [ensureLocalStream, showToast]);

    const detachRemoteAudioGraph = useCallback((peerId: string) => {
        disconnectPeerAudioGraph(remoteAudioGraphRef.current[peerId]);
        delete remoteAudioGraphRef.current[peerId];
    }, []);

    const remoteGainValue = useCallback((peerId: string) => {
        if (mutedAllRef.current) return 0;
        const percent = playerVolumesRef.current[peerId] ?? remoteVolumeRef.current;
        return percent / 100;
    }, []);

    const syncRemotePlayback = useCallback((peerId: string) => {
        const audio = remoteAudioRef.current[peerId];
        if (!audio) return;
        const ctx = remoteAudioContextRef.current;
        const graphRunning = !!remoteAudioGraphRef.current[peerId] && !!ctx && ctx.state === "running";
        syncAudioElementPlayback(audio, graphRunning, mutedAllRef.current, remoteGainValue(peerId));
    }, [remoteGainValue]);

    const syncAllRemoteAudio = useCallback(() => {
        Object.entries(remoteAudioGraphRef.current).forEach(([peerId, { gain }]) => {
            applyRemoteGain(gain, remoteGainValue(peerId));
        });
        Object.keys(remoteAudioRef.current).forEach(syncRemotePlayback);
    }, [remoteGainValue, syncRemotePlayback]);

    const ensureRemoteAudioContext = useCallback(() => {
        if (!remoteAudioContextRef.current) {
            const ctx = createAudioContext();
            if (!ctx) return null;
            ctx.onstatechange = () => {
                Object.keys(remoteStreamRef.current).forEach(syncRemotePlayback);
            };
            remoteAudioContextRef.current = ctx;
        }
        const ctx = remoteAudioContextRef.current;
        if (ctx.state === "suspended") {
            ctx.resume().catch(() => undefined);
        }
        return ctx;
    }, [syncRemotePlayback]);

    const attachRemoteAudioGraph = useCallback((peerId: string, stream: MediaStream) => {
        const ctx = ensureRemoteAudioContext();
        if (!ctx) return false;
        detachRemoteAudioGraph(peerId);
        const graph = createPeerAudioGraph(ctx, stream, remoteGainValue(peerId));
        if (!graph) return false;
        remoteAudioGraphRef.current[peerId] = graph;
        return true;
    }, [detachRemoteAudioGraph, ensureRemoteAudioContext, remoteGainValue]);

    const teardownPeer = useCallback((peerId: string) => {
        if (peerRetryTimersRef.current[peerId] !== undefined) {
            window.clearTimeout(peerRetryTimersRef.current[peerId]);
            delete peerRetryTimersRef.current[peerId];
        }
        clearPendingIceCandidates(peerId);
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
    }, [detachRemoteAudioGraph]);

    const releaseAllMedia = useCallback(() => {
        Object.values(peerRetryTimersRef.current).forEach(timerId => window.clearTimeout(timerId));
        peerRetryTimersRef.current = {};
        peerRetryCountRef.current = {};
        Object.keys(peerConnectionsRef.current).forEach(teardownPeer);
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        if (remoteAudioContextRef.current) {
            remoteAudioContextRef.current.close().catch(() => undefined);
            remoteAudioContextRef.current = null;
        }
    }, [teardownPeer]);

    const createPeerConnection = useCallback((peerId: string) => {
        const existing = peerConnectionsRef.current[peerId];
        if (existing) return existing;
        const pc = new RTCPeerConnection(RTC_CONFIG);
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
            if (!remoteAudioGraphRef.current[peerId]) {
                attachRemoteAudioGraph(peerId, stream);
            }
            syncRemotePlayback(peerId);

            audio.play().catch(() => {
                const retryPlayback = () => {
                    syncRemotePlayback(peerId);
                    audio.play().catch(() => undefined);
                    document.removeEventListener("click", retryPlayback);
                    document.removeEventListener("keydown", retryPlayback);
                };
                document.addEventListener("click", retryPlayback, { once: true });
                document.addEventListener("keydown", retryPlayback, { once: true });
            });
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") {
                peerRetryCountRef.current[peerId] = 0;
            } else if (pc.connectionState === "failed") {
                teardownPeer(peerId);
                const attempts = peerRetryCountRef.current[peerId] ?? 0;
                if (!disposedRef.current && !removedRef.current
                    && activePeerIdsRef.current.has(peerId)
                    && attempts < MAX_PEER_RECOVERY_ATTEMPTS) {
                    peerRetryCountRef.current[peerId] = attempts + 1;
                    peerRetryTimersRef.current[peerId] = window.setTimeout(() => {
                        delete peerRetryTimersRef.current[peerId];
                        if (!disposedRef.current && !removedRef.current && activePeerIdsRef.current.has(peerId)) {
                            createPeerConnectionRef.current(peerId);
                        }
                    }, ICE_RESTART_DELAY_MS);
                }
            } else if (pc.connectionState === "disconnected") {
                window.setTimeout(() => {
                    if (peerConnectionsRef.current[peerId] === pc && pc.connectionState === "disconnected") {
                        pc.restartIce();
                    }
                }, ICE_RESTART_DELAY_MS);
            }
        };

        peerConnectionsRef.current[peerId] = pc;
        if (localStreamRef.current) {
            attachLocalTracks();
        }
        return pc;
    }, [attachLocalTracks, attachRemoteAudioGraph, sendRtcSignal, syncRemotePlayback, teardownPeer, userId]);

    const handleRtcSignal = useCallback((payload: RtcSignalPayload) => {
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
            void (async () => {
                try {
                    if (collision) {
                        await pc.setLocalDescription({ type: "rollback" });
                    }
                    await applyRemoteDescription(peerId, pc, remoteSdp);
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
            applyRemoteDescription(peerId, pc, remoteSdp)
                .catch(err => console.error("Lỗi nhận answer:", err));
        } else if (payload.action === "candidate" && payload.candidate) {
            queueIceCandidate(peerId, pc, payload.candidate);
        }
    }, [createPeerConnection, sendRtcSignal, userId]);

    const cleanupVoice = useCallback(() => {
        removedRef.current = true;
        setVoiceEnabled(false);
        shouldStreamVoiceRef.current = false;
        setLocalTrackEnabled(false);
        releaseAllMedia();
    }, [releaseAllMedia, setLocalTrackEnabled]);

    useEffect(() => {
        remoteVolumeRef.current = remoteVolume;
        storage.setRemoteVolume(remoteVolume);
        syncAllRemoteAudio();
    }, [remoteVolume, syncAllRemoteAudio]);

    useEffect(() => {
        playerVolumesRef.current = playerVolumes;
        storage.setPlayerVolumes(playerVolumes);
        syncAllRemoteAudio();
    }, [playerVolumes, syncAllRemoteAudio]);

    useEffect(() => {
        mutedAllRef.current = mutedAll;
        syncAllRemoteAudio();
    }, [mutedAll, syncAllRemoteAudio]);

    useEffect(() => {
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
    }, [syncRemotePlayback]);

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
    }, [ensureLocalStream, setLocalTrackEnabled, shouldStreamVoice]);

    useEffect(() => {
        if ((isMusicPlaying || isOtherPerformance) && voiceEnabled) {
            setVoiceEnabled(false);
        }
    }, [isMusicPlaying, isOtherPerformance, voiceEnabled]);

    useEffect(() => {
        createPeerConnectionRef.current = createPeerConnection;
    }, [createPeerConnection]);

    useEffect(() => {
        if (!userId) return;
        const activeIds = new Set(playerList.map(player => player.userId));
        activePeerIdsRef.current = activeIds;
        playerList
            .map(player => player.userId)
            .filter(id => id && id !== userId)
            .forEach(createPeerConnection);

        // The roster broadcast is authoritative: drop departing peers right away.
        Object.keys(peerConnectionsRef.current).forEach(peerId => {
            if (peerId !== userId && !activeIds.has(peerId)) {
                delete peerRetryCountRef.current[peerId];
                teardownPeer(peerId);
            }
        });
    }, [createPeerConnection, playerList, teardownPeer, userId]);

    useEffect(() => {
        disposedRef.current = false;
        return () => {
            disposedRef.current = true;
            releaseAllMedia();
        };
    }, [releaseAllMedia]);

    const handleToggleVoice = useCallback(async () => {
        if (isForcedVoice || isMusicPlaying || isOtherPerformance) return;
        if (!voiceEnabled && !hasMicPermission) {
            const ok = await requestMicPermission(true);
            if (!ok) return;
        }
        if (!voiceEnabled && !localStreamRef.current) {
            try {
                const stream = await ensureLocalStream();
                if (!stream) return;
            } catch (err) {
                console.error("Lỗi Mic:", err);
                showToast("error", "Không thể truy cập Micro. Vui lòng kiểm tra thiết bị.");
                return;
            }
        }
        setVoiceEnabled(prev => !prev);
    }, [ensureLocalStream, hasMicPermission, isForcedVoice, isMusicPlaying, isOtherPerformance, requestMicPermission, showToast, voiceEnabled]);

    const handlePlayerVolumeChange = useCallback((peerId: string, value: number) => {
        const clamped = Math.min(MAX_VOLUME_PERCENT, Math.max(0, Math.round(value)));
        setPlayerVolumes(prev => ({ ...prev, [peerId]: clamped }));
    }, []);

    return {
        mutedAll,
        remoteVolume,
        playerVolumes,
        hasMicPermission,
        micPermissionAsked,
        isForcedVoice,
        isMusicPlaying,
        isOtherPerformance,
        shouldStreamVoice,
        isMutedAll: useCallback(() => mutedAllRef.current, []),
        getLocalStream: useCallback(() => localStreamRef.current, []),
        ensureLocalStream,
        requestMicPermission,
        handleToggleVoice,
        handleToggleMute: useCallback(() => setMutedAll(prev => !prev), []),
        setRemoteVolume,
        handlePlayerVolumeChange,
        handleRtcSignal,
        cleanupVoice,
    };
}
