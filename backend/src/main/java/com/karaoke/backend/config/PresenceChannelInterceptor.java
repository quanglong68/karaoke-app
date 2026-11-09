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
        } else if (StompCommand.SEND.equals(command) || StompCommand.SUBSCRIBE.equals(command)) {
            handleRoomBoundCommand(accessor);
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
        presenceRegistry.register(sessionId, info.roomId(), info.userId());
        accessor.setUser(new SessionPrincipal(info.userId()));
    }

    private void handleRoomBoundCommand(StompHeaderAccessor accessor) {
        String sessionId = accessor.getSessionId();
        PresenceRegistry.PresenceInfo presence = sessionId == null ? null : presenceRegistry.get(sessionId);
        if (presence == null) {
            throw new MessagingException("SESSION_INVALID");
        }
        String destination = accessor.getDestination();
        String destinationRoomId = extractRoomId(destination);
        if (destinationRoomId == null || !destinationRoomId.equals(presence.getRoomId())) {
            throw new MessagingException("FORBIDDEN_DESTINATION");
        }
    }

    private String extractRoomId(String destination) {
        String prefix;
        if (destination == null) {
            return null;
        }
        if (destination.startsWith(APP_ROOM_PREFIX)) {
            prefix = APP_ROOM_PREFIX;
        } else if (destination.startsWith(TOPIC_ROOM_PREFIX)) {
            prefix = TOPIC_ROOM_PREFIX;
        } else {
            return null;
        }
        String remainder = destination.substring(prefix.length());
        int slash = remainder.indexOf('/');
        String roomId = slash >= 0 ? remainder.substring(0, slash) : remainder;
        return roomId.isEmpty() ? null : roomId;
    }

    private record SessionPrincipal(String name) implements Principal {
        @Override
        public String getName() {
            return name;
        }
    }
}
