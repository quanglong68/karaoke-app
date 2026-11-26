package com.karaoke.backend.config;

import com.karaoke.backend.model.Room;
import com.karaoke.backend.service.PresenceRegistry;
import com.karaoke.backend.service.RoomService;
import com.karaoke.backend.service.SessionService;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.security.Principal;

@Component
public class PresenceChannelInterceptor implements ChannelInterceptor {
    private static final String APP_ROOM_PREFIX = "/app/room/";
    private static final String TOPIC_ROOM_PREFIX = "/topic/room/";
    private static final String USER_RTC_QUEUE = "/user/queue/rtc";
    private static final int MAX_SESSIONS_PER_USER = 3;

    private final PresenceRegistry presenceRegistry;
    private final SessionService sessionService;
    private final RoomService roomService;

    public PresenceChannelInterceptor(PresenceRegistry presenceRegistry, SessionService sessionService,
            RoomService roomService) {
        this.presenceRegistry = presenceRegistry;
        this.sessionService = sessionService;
        this.roomService = roomService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            accessor = StompHeaderAccessor.wrap(message);
        }
        StompCommand command = accessor.getCommand();
        if (command == null) {
            return message;
        }
        if (StompCommand.CONNECT.equals(command)) {
            handleConnect(accessor);
        } else if (StompCommand.SEND.equals(command)) {
            handleSend(accessor);
        } else if (StompCommand.SUBSCRIBE.equals(command)) {
            handleSubscribe(accessor);
        }
        return message;
    }

    private void handleConnect(StompHeaderAccessor accessor) {
        String requestedRoomId = accessor.getFirstNativeHeader("roomId");
        String sessionToken = accessor.getFirstNativeHeader("sessionToken");
        SessionService.SessionInfo info = sessionService.validate(sessionToken);
        if (info == null || requestedRoomId == null || !requestedRoomId.equals(info.roomId())) {
            throw new MessagingException("SESSION_INVALID");
        }
        Room room = roomService.getRoom(info.roomId());
        if (room == null || room.getUserById(info.userId()) == null) {
            throw new MessagingException("SESSION_INVALID");
        }
        String sessionId = accessor.getSessionId();
        if (sessionId == null) {
            throw new MessagingException("SESSION_INVALID");
        }
        if (presenceRegistry.countUserSessions(info.roomId(), info.userId(), sessionId) >= MAX_SESSIONS_PER_USER) {
            throw new MessagingException("TOO_MANY_CONNECTIONS");
        }
        presenceRegistry.register(sessionId, info.roomId(), info.userId());
        accessor.setUser(new SessionPrincipal(info.userId()));
    }

    /**
     * Only application destinations are accepted from clients. The previous version
     * also accepted SEND directly to /topic/room/{roomId}, which let any room member
     * publish arbitrary broadcasts (fake scores, kicks, chat) that bypassed GameService.
     */
    private void handleSend(StompHeaderAccessor accessor) {
        PresenceRegistry.PresenceInfo presence = requirePresence(accessor);
        String destination = accessor.getDestination();
        String channel = APP_ROOM_PREFIX + presence.getRoomId();
        boolean allowed = destination != null
                && (destination.equals(channel) || destination.equals(channel + "/chat"));
        if (!allowed) {
            throw new MessagingException("FORBIDDEN_DESTINATION");
        }
    }

    private void handleSubscribe(StompHeaderAccessor accessor) {
        PresenceRegistry.PresenceInfo presence = requirePresence(accessor);
        String destination = accessor.getDestination();
        String expected = TOPIC_ROOM_PREFIX + presence.getRoomId();
        boolean allowed = expected.equals(destination) || USER_RTC_QUEUE.equals(destination);
        if (!allowed) {
            throw new MessagingException("FORBIDDEN_DESTINATION");
        }
    }

    private PresenceRegistry.PresenceInfo requirePresence(StompHeaderAccessor accessor) {
        String sessionId = accessor.getSessionId();
        PresenceRegistry.PresenceInfo presence = sessionId == null ? null : presenceRegistry.get(sessionId);
        if (presence == null) {
            throw new MessagingException("SESSION_INVALID");
        }
        return presence;
    }

    private record SessionPrincipal(String name) implements Principal {
        @Override
        public String getName() {
            return name;
        }
    }
}
