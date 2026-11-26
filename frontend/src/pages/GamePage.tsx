import { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { RtcSignalPayload, SocketMessage } from "../types/socket";
import type { GameState, MusicInfo } from "../types/game";
import type { MessageType } from "../types/message";
import { websocketService } from "../services/websocketService";
import type { User } from "../types/user";
import type { JoinRoomResponse, PerformanceResultPayload, GameSettings } from "../types/room";
import { storage } from "../utils/storage";
import { pausePreloadVideo, preloadVideo, waitForPreloadReady } from "../utils/videoPreload";
import { roomService } from "../services/roomService";
import { DEFAULT_GAME_SETTINGS, MAX_CHAT_LENGTH, MAX_MESSAGES, MAX_USER_NAME_LENGTH } from "../constants/game";
import { usePitchCapture } from "../hooks/usePitchCapture";
import { useRoomEntry } from "../hooks/useRoomEntry";
import { useRoomVoice } from "../hooks/useRoomVoice";
import { useToast } from "../hooks/useToast";
import GameHeader from "../components/game/GameHeader";
import GameRoot from "../components/game/GameRoot";
import GameMain from "../components/game/GameMain";
import type { MobileGameTab } from "../components/game/GameMain";
import MobilePlayerStrip from "../components/game/MobilePlayerStrip";
import Leaderboard from "../components/game/Leaderboard";
import type { RankedUser } from "../components/game/Leaderboard";
import GameStage from "../components/game/GameStage";
import ChatPanel, { type ChatEntry } from "../components/game/ChatPanel";
import GameControls from "../components/game/GameControls";
import GameModals from "../components/game/GameModals";
import Toast from "../components/ui/Toast";

function rankPlayers(players: User[]): RankedUser[] {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    let currentRank = 1;
    return sorted.map((user, index) => {
        if (index > 0 && user.score < sorted[index - 1].score) {
            currentRank = index + 1;
        }
        return { ...user, rank: currentRank };
    });
}

export default function GamePage() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const [messages, setMessages] = useState<ChatEntry[]>([]);
    const nextChatIdRef = useRef(1);
    const [userName, setUserName] = useState(() => storage.getUserName() || "Người chơi ẩn danh");
    const [userId, setUserId] = useState(() => storage.getUserId());
    const [sessionToken, setSessionToken] = useState(() => storage.getSessionToken());
    const [roomName, setRoomName] = useState(() => storage.getRoomName());
    const [gameSettings, setGameSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
    const [perfCountdown, setPerfCountdown] = useState(DEFAULT_GAME_SETTINGS.performanceSeconds);

    const [gameState, setGameState] = useState<GameState>("LOBBY");
    const [clickCount, setClickCount] = useState(0);
    const [winnerUser, setWinnerUser] = useState<User | null>(null);
    const [notification, setNotification] = useState<string | null>(null);
    const [noWinnerMessage, setNoWinnerMessage] = useState<string | null>(null);
    const [countdownNum, setCountdownNum] = useState(3);
    const { toast, showToast, clearToast } = useToast();
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

    const currentSongLyricsRef = useRef("");
    const removedRef = useRef(false);

    const sendRoomMessage = useCallback((type: MessageType, content: SocketMessage["content"]) => {
        if (!roomId) return;
        websocketService.sendMessage(roomId, {
            type,
            content,
            sender: userId,
            roomId: roomId,
        });
    }, [roomId, userId]);

    const sendRtcSignal = useCallback((payload: RtcSignalPayload) => {
        sendRoomMessage("RTC_SIGNAL", payload);
    }, [sendRoomMessage]);

    useEffect(() => {
        if (gameState === "PERFORMANCE") {
            setPerfCountdown(gameSettings.performanceSeconds);
            const timer = setInterval(() => {
                setPerfCountdown((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState, gameSettings.performanceSeconds]);

    const [musicInfo, setMusicInfo] = useState<MusicInfo>({
        videoUrl: "",
        startSeconds: 0,
        isPlaying: false,
        serverStartTime: 0,
    });

    const {
        mutedAll,
        remoteVolume,
        playerVolumes,
        hasMicPermission,
        micPermissionAsked,
        isForcedVoice,
        isMusicPlaying,
        isOtherPerformance,
        shouldStreamVoice,
        isMutedAll,
        getLocalStream,
        ensureLocalStream,
        requestMicPermission,
        handleToggleVoice,
        handleToggleMute,
        setRemoteVolume,
        handlePlayerVolumeChange,
        handleRtcSignal,
        cleanupVoice,
    } = useRoomVoice({
        userId,
        playerList,
        gameState,
        winnerUser,
        sendRtcSignal,
        showToast,
    });

    const playSound = useCallback((fileName: string) => {
        const audio = new Audio(`/sounds/${fileName}`);
        audio.muted = isMutedAll();
        audio.play().catch(() => undefined);
    }, [isMutedAll]);

    useEffect(() => {
        if (gameState === "COUNTDOWN") {
            setCountdownNum(gameSettings.countdownSeconds);
            const timer = setInterval(() => {
                setCountdownNum((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState, gameSettings.countdownSeconds]);

    const isSinger = winnerUser?.userId === userId;
    const { lyricsStatus, stopCapture } = usePitchCapture({
        enabled: gameState === "PERFORMANCE" && isSinger,
        sendLyricsOnFinish: gameState === "PERFORMANCE_EVALUATION" && isSinger,
        getStream: getLocalStream,
        ensureStream: ensureLocalStream,
        onSubmit: (lyrics, pitchContour) => {
            sendRoomMessage("USER_LYRICS", {
                lyrics,
                pitchContour,
                songId: musicInfo.songId || null,
            });
        },
    });

    const clearStoredSession = useCallback(() => {
        storage.clearSessionToken();
        setSessionToken("");
    }, []);

    const navigateHome = useCallback(() => {
        navigate("/", { replace: true });
    }, [navigate]);

    const applySession = useCallback((data: JoinRoomResponse) => {
        if (removedRef.current) return;
        setGameSettings(data.settings ?? DEFAULT_GAME_SETTINGS);
        storage.setUserId(data.user.userId);
        storage.setRoomName(data.room.roomName);
        storage.setRoomId(data.room.roomId);
        storage.setSessionToken(data.sessionToken);
        setRoomName(data.room.roomName);
        setGameState(data.room.gameState);
        setMyScore(data.user.score);
        setUserId(data.user.userId);
        setSessionToken(data.sessionToken);
        setUserName(data.user.userName);
        if (data.room.upcomingVideoUrl) {
            preloadVideo(data.room.upcomingVideoUrl);
        }
        setCanConnect(true);
    }, []);

    useRoomEntry({
        roomId,
        onSessionReady: applySession,
        onSessionCleared: clearStoredSession,
        onCanConnectChange: setCanConnect,
        showToast,
        onRedirectHome: navigateHome,
    });

    // Kicked or invalid session: stop every media path immediately and keep a
    // blocking notice on screen. There is deliberately no auto-redirect, so a
    // backgrounded tab still shows the reason when the player comes back.
    const handleRemovedFromRoom = useCallback((reason: string) => {
        if (removedRef.current) return;
        removedRef.current = true;
        websocketService.disconnect();
        setRemovalNotice(reason);
        setKickTarget(null);
        cleanupVoice();
        stopCapture();
        pausePreloadVideo();
        setMusicInfo(prev => (prev.isPlaying ? { ...prev, isPlaying: false } : prev));
        storage.setRoomId("");
        clearStoredSession();
    }, [cleanupVoice, clearStoredSession, stopCapture]);

    const handleScoreShowMessage = useCallback((content: SocketMessage["content"]) => {
        if (!content || typeof content !== "object") return;
        const payload = content as PerformanceResultPayload;
        if (!payload.user) return;

        setGameState("SCORE_SHOW");
        const { user: performanceUser, isSuccess } = payload;
        if (performanceUser.userId === userId) {
            setMyScore(performanceUser.score);
        }
        setPlayerList(prevList =>
            prevList.map(user =>
                user.userId === performanceUser.userId ? { ...user, score: performanceUser.score } : user,
            ),
        );
        if (isSuccess) {
            playSound("success.mp3");
            setNotification(`Chúc mừng ${performanceUser.userName} đã được cộng 1 điểm!`);
        } else {
            playSound("failure.mp3");
            setNotification(`Rất tiếc ${performanceUser.userName} chưa được cộng điểm.`);
        }
    }, [playSound, userId]);

    const handleLobbyMessage = useCallback((content: SocketMessage["content"]) => {
        if (Array.isArray(content)) {
            setPlayerList(content as User[]);
        } else if (typeof content === "string") {
            setNotification(content);
            showToast("error", content);
        }
        setMyScore(0);
        setWinnerUser(null);
        setNoWinnerMessage(null);
        setClickCount(0);
        setGameState("LOBBY");
    }, [showToast]);

    const handleSocketMessage = useCallback((message: SocketMessage) => {
        switch (message.type) {
            case "JOIN":
                if (Array.isArray(message.content)) {
                    const users = message.content as User[];
                    setPlayerList(users);
                    const self = users.find(u => u.userId === userId);
                    if (self) {
                        setMyScore(self.score);
                    }
                }
                break;
            case "CHAT": {
                const chatId = nextChatIdRef.current++;
                setMessages(prev => [...prev, { id: chatId, message }].slice(-MAX_MESSAGES));
                if (message.sender !== userId) {
                    playSound("ting.mp3");
                    if (mobileTabRef.current !== "chat") {
                        setUnreadChat(count => count + 1);
                    }
                }
                break;
            }
            case "PLAY_SEGMENT":
                if (typeof message.content === "string") return;
                setMusicInfo(message.content as MusicInfo);
                setGameState("PLAY_SEGMENT");
                setClickCount(0);
                setNoWinnerMessage(null);
                break;
            case "PRELOAD": {
                if (typeof message.content === "string") return;
                const state = message.content as MusicInfo;
                if (state?.videoUrl) {
                    setMusicInfo(state);
                    preloadVideo(state.videoUrl);
                }
                break;
            }
            case "BATTLE":
                setGameState("BATTLE");
                setClickCount(0);
                setMusicInfo(prev => ({ ...prev, isPlaying: false }));
                break;
            case "WINNER_SHOW":
                setGameState("WINNER_SHOW");
                if (message.content && typeof message.content === "object" && "userName" in message.content) {
                    setWinnerUser(message.content as User);
                }
                break;
            case "COUNTDOWN":
                setNoWinnerMessage(null);
                setGameState("COUNTDOWN");
                break;
            case "PERFORMANCE":
                currentSongLyricsRef.current = message.content as string;
                setGameState("PERFORMANCE");
                break;
            case "PERFORMANCE_EVALUATION":
                setGameState("PERFORMANCE_EVALUATION");
                break;
            case "SCORE_SHOW":
                handleScoreShowMessage(message.content);
                break;
            case "NO_WINNER":
                if (typeof message.content === "string") {
                    setNoWinnerMessage(message.content);
                }
                break;
            case "END_GAME":
                setGameState("END_GAME");
                playSound("applause.mp3");
                break;
            case "LOBBY":
                handleLobbyMessage(message.content);
                break;
            case "KICK_PLAYER":
                if (typeof message.content === "string" && message.content === userId) {
                    handleRemovedFromRoom("Bạn đã bị chủ phòng mời ra khỏi phòng.");
                }
                break;
            case "RTC_SIGNAL":
                if (message.content && typeof message.content === "object") {
                    handleRtcSignal(message.content as RtcSignalPayload);
                }
                break;
        }
    }, [handleLobbyMessage, handleRemovedFromRoom, handleRtcSignal, handleScoreShowMessage, playSound, userId]);

    const socketHandlersRef = useRef({
        handleSocketMessage,
        handleRemovedFromRoom,
        sendRoomMessage,
        showToast,
    });

    useEffect(() => {
        socketHandlersRef.current = {
            handleSocketMessage,
            handleRemovedFromRoom,
            sendRoomMessage,
            showToast,
        };
    });

    useEffect(() => {
        if (!roomId || !userId || !sessionToken || !canConnect) return;

        websocketService.connect(roomId, sessionToken, {
            onMessage: (message) => socketHandlersRef.current.handleSocketMessage(message),
            onConnected: () => {
                socketHandlersRef.current.sendRoomMessage("JOIN", "");
            },
            onError: (text) => {
                socketHandlersRef.current.showToast("error", text);
            },
            onSessionInvalid: () => {
                socketHandlersRef.current.handleRemovedFromRoom(
                    "Phiên của bạn đã hết hiệu lực hoặc bạn đã được mời ra khỏi phòng.",
                );
            },
        });

        return () => {
            websocketService.disconnect();
        };
    }, [roomId, userId, sessionToken, canConnect]);

    const handleLeaveRoom = useCallback(async () => {
        try {
            if (sessionToken) {
                await roomService.leaveRoom(sessionToken);
            }
        } catch (error) {
            console.error("Failed to leave room", error);
        } finally {
            storage.setRoomId("");
            clearStoredSession();
            navigateHome();
        }
    }, [clearStoredSession, navigateHome, sessionToken]);

    const handleOpenRename = useCallback(() => {
        setRenameValue(userName);
        setShowRename(true);
    }, [userName]);

    const handleStartGame = () => {
        if (!isHost || gameState !== "LOBBY") return;
        waitForPreloadReady(() => {
            if (!removedRef.current) {
                sendRoomMessage("PLAY_SEGMENT", "");
            }
        });
    };

    const handleBuzzerClick = () => {
        playSound("buzzer.mp3");
        setClickCount(prev => prev + 1);
        sendRoomMessage("BATTLE", "");
    };

    const handleFinishPerformance = () => {
        // The server drops an early PERFORMANCE_EVALUATION, so do not send one.
        if (perfCountdown > gameSettings.performanceSeconds - gameSettings.minPerformanceSeconds) return;
        sendRoomMessage("PERFORMANCE_EVALUATION", "");
    };

    const handleSendMessage = useCallback((rawContent: string) => {
        const content = rawContent.trim().slice(0, MAX_CHAT_LENGTH);
        if (!roomId || !content) return;
        sendRoomMessage("CHAT", content);
    }, [roomId, sendRoomMessage]);

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
        if (trimmed.length > MAX_USER_NAME_LENGTH) {
            showToast("error", `Tên tối đa ${MAX_USER_NAME_LENGTH} ký tự.`);
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

    const rankedPlayers = rankPlayers(playerList);

    return (
        <GameRoot
            header={
                <GameHeader
                    myScore={myScore}
                    roomId={roomId}
                    userName={userName}
                    playerCount={playerList.length}
                    maxPlayers={gameSettings.maxPlayers}
                    roomName={roomName}
                    isForcedVoice={isForcedVoice}
                    isMusicPlaying={isMusicPlaying}
                    isOtherPerformance={isOtherPerformance}
                    hasMicPermission={hasMicPermission}
                    micPermissionAsked={micPermissionAsked}
                    shouldStreamVoice={shouldStreamVoice}
                    onToggleVoice={handleToggleVoice}
                    mutedAll={mutedAll}
                    onToggleMute={handleToggleMute}
                    remoteVolume={remoteVolume}
                    onRemoteVolumeChange={setRemoteVolume}
                    onLeaveRoom={handleLeaveRoom}
                    onRename={handleOpenRename}
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
                            performanceSeconds={gameSettings.performanceSeconds}
                            minPerformanceSeconds={gameSettings.minPerformanceSeconds}
                            maxPlayers={gameSettings.maxPlayers}
                            lyrics={currentSongLyricsRef.current}
                            isSinger={winnerUser?.userId === userId}
                            onFinishPerformance={handleFinishPerformance}
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
                            onClose={clearToast}
                        />
                    )}
                    <GameModals
                        showRename={showRename}
                        renameValue={renameValue}
                        onRenameValueChange={setRenameValue}
                        onCloseRename={() => setShowRename(false)}
                        onSaveRename={handleRename}
                        kickTarget={kickTarget}
                        onCancelKick={() => setKickTarget(null)}
                        onConfirmKick={confirmKick}
                        removalNotice={removalNotice}
                        onReturnHome={navigateHome}
                    />
                </>
            }
        />
    );
}
