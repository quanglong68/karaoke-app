package com.karaoke.backend.service;

import com.karaoke.backend.model.MessageType;
import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.SocketMessage;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * Validates and unicast-routes WebRTC signalling messages between members of the same room.
 */
@Component
public class RtcSignalRouter {

    private static final int MAX_RTC_SDP_CHARS = 64_000;
    private static final int MAX_RTC_CANDIDATE_CHARS = 4_096;
    private static final int MAX_SDP_MID_CHARS = 128;
    private static final int MAX_USERNAME_FRAGMENT_CHARS = 256;
    private static final int MAX_SDP_MLINE_INDEX = 64;
    private static final Set<String> ALLOWED_RTC_ACTIONS = Set.of("offer", "answer", "candidate");

    private final RoomService roomService;
    private final SimpMessagingTemplate messagingTemplate;

    public RtcSignalRouter(RoomService roomService, SimpMessagingTemplate messagingTemplate) {
        this.roomService = roomService;
        this.messagingTemplate = messagingTemplate;
    }

    public void route(String roomId, String senderId, Object content) {
        if (!(content instanceof Map<?, ?> payload)) {
            return;
        }
        if (!(payload.get("to") instanceof String targetId)
                || !(payload.get("action") instanceof String action)
                || !ALLOWED_RTC_ACTIONS.contains(action)) {
            return;
        }
        Room room = roomService.getRoom(roomId);
        if (room == null || room.getUserById(targetId) == null || targetId.equals(senderId)) {
            return;
        }

        Map<String, Object> safePayload = buildSafePayload(action, senderId, targetId, payload);
        if (safePayload == null) {
            return;
        }
        // Send the offer/answer/candidate only to the member it is addressed to.
        // Broadcasting exposed every SDP to the whole room and let anyone inject
        // candidates into another peer connection.
        messagingTemplate.convertAndSendToUser(targetId, "/queue/rtc",
                new SocketMessage(MessageType.RTC_SIGNAL, safePayload, senderId, roomId));
    }

    private Map<String, Object> buildSafePayload(String action, String senderId, String targetId, Map<?, ?> payload) {
        Map<String, Object> safePayload = new HashMap<>();
        safePayload.put("action", action);
        safePayload.put("from", senderId);
        safePayload.put("to", targetId);
        if ("candidate".equals(action)) {
            Map<String, Object> safeCandidate = sanitizeCandidate(payload.get("candidate"));
            if (safeCandidate == null) {
                return null;
            }
            safePayload.put("candidate", safeCandidate);
            return safePayload;
        }
        Map<String, Object> safeSdp = sanitizeSdp(action, payload.get("sdp"));
        if (safeSdp == null) {
            return null;
        }
        safePayload.put("sdp", safeSdp);
        return safePayload;
    }

    private Map<String, Object> sanitizeSdp(String expectedType, Object rawSdp) {
        if (!(rawSdp instanceof Map<?, ?> sdpMap)) {
            return null;
        }
        if (!(sdpMap.get("type") instanceof String type) || !expectedType.equals(type)) {
            return null;
        }
        if (!(sdpMap.get("sdp") instanceof String sdp) || sdp.isEmpty() || sdp.length() > MAX_RTC_SDP_CHARS) {
            return null;
        }
        return Map.of("type", type, "sdp", sdp);
    }

    private Map<String, Object> sanitizeCandidate(Object rawCandidate) {
        if (!(rawCandidate instanceof Map<?, ?> candidateMap)) {
            return null;
        }
        if (!(candidateMap.get("candidate") instanceof String candidate)
                || candidate.length() > MAX_RTC_CANDIDATE_CHARS) {
            return null;
        }
        Map<String, Object> safeCandidate = new HashMap<>();
        safeCandidate.put("candidate", candidate);
        if (candidateMap.get("sdpMid") instanceof String sdpMid && sdpMid.length() <= MAX_SDP_MID_CHARS) {
            safeCandidate.put("sdpMid", sdpMid);
        }
        if (candidateMap.get("sdpMLineIndex") instanceof Number lineIndex) {
            int index = lineIndex.intValue();
            if (index >= 0 && index <= MAX_SDP_MLINE_INDEX) {
                safeCandidate.put("sdpMLineIndex", index);
            }
        }
        if (candidateMap.get("usernameFragment") instanceof String fragment
                && fragment.length() <= MAX_USERNAME_FRAGMENT_CHARS) {
            safeCandidate.put("usernameFragment", fragment);
        }
        return safeCandidate;
    }
}
