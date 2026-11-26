package com.karaoke.backend.service;

import com.karaoke.backend.model.MessageType;
import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.SocketMessage;
import com.karaoke.backend.model.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RtcSignalRouterTest {

    private static final String ROOM_ID = "R1";
    private static final String SENDER_ID = "u1";
    private static final String TARGET_ID = "u2";

    private RoomService roomService;
    private SimpMessagingTemplate messagingTemplate;
    private RtcSignalRouter router;

    @BeforeEach
    void setUp() {
        roomService = mock(RoomService.class);
        messagingTemplate = mock(SimpMessagingTemplate.class);
        router = new RtcSignalRouter(roomService, messagingTemplate);

        Room room = new Room();
        room.setRoomId(ROOM_ID);
        room.addUser(new User(SENDER_ID, "Host", 0, true, true));
        room.addUser(new User(TARGET_ID, "Guest", 0, false, true));
        when(roomService.getRoom(ROOM_ID)).thenReturn(room);
    }

    @Test
    void routesValidOfferWithOnlyAllowlistedSdpFields() {
        Map<String, Object> payload = Map.of(
                "action", "offer",
                "to", TARGET_ID,
                "from", "spoofed-user",
                "sdp", Map.of("type", "offer", "sdp", "v=0...", "extra", "drop-me"));

        router.route(ROOM_ID, SENDER_ID, payload);

        ArgumentCaptor<SocketMessage> captor = ArgumentCaptor.forClass(SocketMessage.class);
        verify(messagingTemplate).convertAndSendToUser(eq(TARGET_ID), eq("/queue/rtc"), captor.capture());
        SocketMessage sent = captor.getValue();
        assertEquals(MessageType.RTC_SIGNAL, sent.getType());
        assertEquals(SENDER_ID, sent.getSender());

        @SuppressWarnings("unchecked")
        Map<String, Object> forwarded = (Map<String, Object>) sent.getContent();
        assertEquals(SENDER_ID, forwarded.get("from"));
        @SuppressWarnings("unchecked")
        Map<String, Object> sdp = (Map<String, Object>) forwarded.get("sdp");
        assertEquals("offer", sdp.get("type"));
        assertEquals("v=0...", sdp.get("sdp"));
        assertFalse(sdp.containsKey("extra"));
    }

    @Test
    void routesValidIceCandidateWithAllowlistedFields() {
        Map<String, Object> payload = Map.of(
                "action", "candidate",
                "to", TARGET_ID,
                "candidate", Map.of(
                        "candidate", "candidate:1 1 UDP 2122252543 192.0.2.1 54400 typ host",
                        "sdpMid", "0",
                        "sdpMLineIndex", 0,
                        "injected", "ignored"));

        router.route(ROOM_ID, SENDER_ID, payload);

        ArgumentCaptor<SocketMessage> captor = ArgumentCaptor.forClass(SocketMessage.class);
        verify(messagingTemplate).convertAndSendToUser(eq(TARGET_ID), eq("/queue/rtc"), captor.capture());
        @SuppressWarnings("unchecked")
        Map<String, Object> forwarded = (Map<String, Object>) captor.getValue().getContent();
        @SuppressWarnings("unchecked")
        Map<String, Object> candidate = (Map<String, Object>) forwarded.get("candidate");
        assertEquals("0", candidate.get("sdpMid"));
        assertEquals(0, candidate.get("sdpMLineIndex"));
        assertFalse(candidate.containsKey("injected"));
    }

    @Test
    void dropsMismatchedSdpTypeSelfTargetAndOutsiderTarget() {
        router.route(ROOM_ID, SENDER_ID, Map.of(
                "action", "offer",
                "to", TARGET_ID,
                "sdp", Map.of("type", "answer", "sdp", "v=0...")));

        router.route(ROOM_ID, SENDER_ID, Map.of(
                "action", "offer",
                "to", SENDER_ID,
                "sdp", Map.of("type", "offer", "sdp", "v=0...")));

        router.route(ROOM_ID, SENDER_ID, Map.of(
                "action", "offer",
                "to", "outsider",
                "sdp", Map.of("type", "offer", "sdp", "v=0...")));

        verifyNoInteractions(messagingTemplate);
    }
}
