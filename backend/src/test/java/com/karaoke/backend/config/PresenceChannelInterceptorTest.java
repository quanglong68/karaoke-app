package com.karaoke.backend.config;

import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.User;
import com.karaoke.backend.service.PresenceRegistry;
import com.karaoke.backend.service.RoomService;
import com.karaoke.backend.service.SessionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;

import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PresenceChannelInterceptorTest {

    private static final String ROOM_ID = "R1";
    private static final String USER_ID = "u1";

    private final PresenceRegistry presenceRegistry = new PresenceRegistry();
    private final SessionService sessionService = mock(SessionService.class);
    private final RoomService roomService = mock(RoomService.class);
    private final MessageChannel channel = mock(MessageChannel.class);
    private final PresenceChannelInterceptor interceptor =
            new PresenceChannelInterceptor(presenceRegistry, sessionService, roomService);

    @BeforeEach
    void setUp() {
        Room room = new Room();
        room.setRoomId(ROOM_ID);
        room.addUser(new User(USER_ID, "Host", 0, true, true));
        when(roomService.getRoom(ROOM_ID)).thenReturn(room);
        when(sessionService.validate("good"))
                .thenReturn(new SessionService.SessionInfo("good", ROOM_ID, USER_ID, 0));
        when(sessionService.validate("bad")).thenReturn(null);
    }

    private Message<byte[]> stomp(StompCommand command, Consumer<StompHeaderAccessor> customize) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        accessor.setLeaveMutable(true);
        customize.accept(accessor);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private Message<byte[]> connect(String roomId, String token) {
        return stomp(StompCommand.CONNECT, accessor -> {
            accessor.setSessionId("S1");
            accessor.setNativeHeader("roomId", roomId);
            accessor.setNativeHeader("sessionToken", token);
        });
    }

    @Test
    void connectWithValidSessionRegistersPresence() {
        interceptor.preSend(connect(ROOM_ID, "good"), channel);

        assertNotNull(presenceRegistry.get("S1"));
        assertEquals(USER_ID, presenceRegistry.get("S1").getUserId());
    }

    @Test
    void connectWithInvalidSessionIsRejected() {
        MessagingException invalidToken = assertThrows(MessagingException.class,
                () -> interceptor.preSend(connect(ROOM_ID, "bad"), channel));
        assertEquals("SESSION_INVALID", invalidToken.getMessage());
        MessagingException wrongRoom = assertThrows(MessagingException.class,
                () -> interceptor.preSend(connect("R2", "good"), channel));
        assertEquals("SESSION_INVALID", wrongRoom.getMessage());
    }

    @Test
    void sendIsLimitedToThePresenceRoom() {
        presenceRegistry.register("S1", ROOM_ID, USER_ID);

        interceptor.preSend(send("/app/room/" + ROOM_ID), channel);
        interceptor.preSend(send("/app/room/" + ROOM_ID + "/chat"), channel);

        assertThrows(MessagingException.class,
                () -> interceptor.preSend(send("/app/room/OTHER"), channel));
        assertThrows(MessagingException.class,
                () -> interceptor.preSend(send("/topic/room/" + ROOM_ID), channel));
    }

    @Test
    void subscribeIsLimitedToTheRoomTopicAndRtcQueue() {
        presenceRegistry.register("S1", ROOM_ID, USER_ID);

        interceptor.preSend(subscribe("/topic/room/" + ROOM_ID), channel);
        interceptor.preSend(subscribe("/user/queue/rtc"), channel);

        MessagingException otherRoom = assertThrows(MessagingException.class,
                () -> interceptor.preSend(subscribe("/topic/room/OTHER"), channel));
        assertEquals("FORBIDDEN_DESTINATION", otherRoom.getMessage());
        assertThrows(MessagingException.class,
                () -> interceptor.preSend(subscribe("/user/queue/other"), channel));
    }

    @Test
    void sendWithoutPresenceIsRejected() {
        MessagingException exception = assertThrows(MessagingException.class,
                () -> interceptor.preSend(send("/app/room/" + ROOM_ID), channel));
        assertEquals("SESSION_INVALID", exception.getMessage());
    }

    @Test
    void fourthConcurrentConnectionForSameUserIsRejected() {
        for (int i = 1; i <= 3; i++) {
            String sessionId = "S" + i;
            interceptor.preSend(stomp(StompCommand.CONNECT, accessor -> {
                accessor.setSessionId(sessionId);
                accessor.setNativeHeader("roomId", ROOM_ID);
                accessor.setNativeHeader("sessionToken", "good");
            }), channel);
        }

        MessagingException exception = assertThrows(MessagingException.class,
                () -> interceptor.preSend(stomp(StompCommand.CONNECT, accessor -> {
                    accessor.setSessionId("S4");
                    accessor.setNativeHeader("roomId", ROOM_ID);
                    accessor.setNativeHeader("sessionToken", "good");
                }), channel));
        assertEquals("TOO_MANY_CONNECTIONS", exception.getMessage());
    }

    private Message<byte[]> send(String destination) {
        return stomp(StompCommand.SEND, accessor -> {
            accessor.setSessionId("S1");
            accessor.setDestination(destination);
        });
    }

    private Message<byte[]> subscribe(String destination) {
        return stomp(StompCommand.SUBSCRIBE, accessor -> {
            accessor.setSessionId("S1");
            accessor.setDestination(destination);
        });
    }
}
