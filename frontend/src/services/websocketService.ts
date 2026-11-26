import SockJS from "sockjs-client";
import Stomp from "stompjs";
import type { SocketMessage } from "../types/socket";
import { WS_ENDPOINT } from "../constants/api";

interface StompFrame {
    body: string;
    headers?: Record<string, string>;
}

export interface WebsocketCallbacks {
    onMessage: (message: SocketMessage) => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
    onError?: (message: string) => void;
    onSessionInvalid?: () => void;
}

interface QueuedMessage {
    roomId: string;
    message: SocketMessage;
}

const MAX_QUEUE_SIZE = 50;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

let stompClient: Stomp.Client | null = null;
let subscription: Stomp.Subscription | null = null;
let rtcSubscription: Stomp.Subscription | null = null;
let reconnectTimer: number | null = null;
let reconnectDelay = INITIAL_RECONNECT_DELAY;
let manualClose = false;
let currentRoomId = "";
let currentToken = "";
let callbacks: WebsocketCallbacks | null = null;
const queue: QueuedMessage[] = [];

const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
};

const scheduleReconnect = () => {
    if (manualClose || reconnectTimer !== null) {
        return;
    }
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        openConnection();
    }, delay);
};

const flushQueue = () => {
    if (!stompClient || !stompClient.connected) {
        return;
    }
    while (queue.length > 0) {
        const queued = queue.shift();
        if (queued) {
            sendNow(queued.roomId, queued.message);
        }
    }
};

const sendNow = (roomId: string, message: SocketMessage) => {
    if (!stompClient || !stompClient.connected) {
        return false;
    }
    const destination = message.type === "CHAT"
        ? `/app/room/${roomId}/chat`
        : `/app/room/${roomId}`;
    stompClient.send(destination, {}, JSON.stringify(message));
    return true;
};

const handleFrame = (payload: StompFrame) => {
    try {
        const parsed = JSON.parse(payload.body) as SocketMessage;
        if (parsed && typeof parsed.type === "string") {
            callbacks?.onMessage(parsed);
        }
    } catch (error) {
        console.error("Invalid WebSocket payload", error);
    }
};

const handleConnectionLost = (reason: string) => {
    subscription = null;
    rtcSubscription = null;
    callbacks?.onDisconnected?.();
    if (manualClose) {
        return;
    }
    // Only auth rejections are terminal. FORBIDDEN_DESTINATION (a protocol
    // violation) must not tear the socket down for the rest of the session.
    if (reason.includes("SESSION_INVALID")) {
        // Auth rejections are terminal: reconnecting with the same revoked token
        // loops forever. Tear everything down and let the screen explain why.
        const handlers = callbacks;
        websocketService.disconnect();
        if (handlers?.onSessionInvalid) {
            handlers.onSessionInvalid();
        } else {
            handlers?.onError?.("Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
        }
        return;
    }
    if (reason.includes("TOO_MANY_CONNECTIONS")) {
        const handlers = callbacks;
        websocketService.disconnect();
        handlers?.onError?.("Bạn đang mở quá nhiều tab trong cùng phòng. Vui lòng đóng bớt tab khác.");
        return;
    }
    scheduleReconnect();
};

const openConnection = () => {
    if (!currentRoomId || !currentToken) {
        return;
    }
    const socket = new SockJS(WS_ENDPOINT);
    const client = Stomp.over(socket);
    client.debug = () => { };
    stompClient = client;

    client.connect(
        { roomId: currentRoomId, sessionToken: currentToken },
        () => {
            if (stompClient !== client) {
                return;
            }
            reconnectDelay = INITIAL_RECONNECT_DELAY;
            subscription = client.subscribe(`/topic/room/${currentRoomId}`, handleFrame);
            // WebRTC signalling is addressed to one member, so it arrives on a
            // per-user queue instead of the room-wide topic.
            rtcSubscription = client.subscribe("/user/queue/rtc", handleFrame);
            callbacks?.onConnected?.();
            flushQueue();
        },
        (error: string | StompFrame) => {
            if (stompClient !== client) {
                return;
            }
            // Spring puts the STOMP ERROR reason in the "message" header; the body
            // is usually empty, so reading body alone never detected SESSION_INVALID.
            const reason = typeof error === "string"
                ? error
                : error?.headers?.message || error?.body || "WebSocket error";
            console.error("WebSocket error:", reason);
            handleConnectionLost(reason);
        },
    );
};

export const websocketService = {
    connect: (roomId: string, sessionToken: string, handlers: WebsocketCallbacks) => {
        websocketService.disconnect();
        manualClose = false;
        reconnectDelay = INITIAL_RECONNECT_DELAY;
        currentRoomId = roomId;
        currentToken = sessionToken;
        callbacks = handlers;
        openConnection();
    },

    sendMessage: (roomId: string, message: SocketMessage) => {
        if (sendNow(roomId, message)) {
            return;
        }
        if (queue.length >= MAX_QUEUE_SIZE) {
            queue.shift();
        }
        queue.push({ roomId, message });
    },

    isConnected: () => Boolean(stompClient?.connected),

    disconnect: () => {
        manualClose = true;
        clearReconnectTimer();
        queue.length = 0;
        callbacks = null;
        currentRoomId = "";
        currentToken = "";
        const sub = subscription;
        const rtcSub = rtcSubscription;
        const client = stompClient;
        subscription = null;
        rtcSubscription = null;
        stompClient = null;
        if (sub) {
            try {
                sub.unsubscribe();
            } catch (error) {
                console.debug("WebSocket unsubscribe error", error);
            }
        }
        if (rtcSub) {
            try {
                rtcSub.unsubscribe();
            } catch (error) {
                console.debug("WebSocket RTC unsubscribe error", error);
            }
        }
        if (client) {
            try {
                client.disconnect(() => { });
            } catch (error) {
                console.debug("WebSocket disconnect error", error);
            }
        }
    },
};
