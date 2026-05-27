package com.karaoke.backend.config;

import com.karaoke.backend.service.PresenceRegistry;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

@Component
public class PresenceChannelInterceptor implements ChannelInterceptor {
    private final PresenceRegistry presenceRegistry;

    public PresenceChannelInterceptor(PresenceRegistry presenceRegistry) {
        this.presenceRegistry = presenceRegistry;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            String roomId = accessor.getFirstNativeHeader("roomId");
            String userId = accessor.getFirstNativeHeader("userId");
            String sessionId = accessor.getSessionId();
            if (roomId != null && userId != null && sessionId != null) {
                presenceRegistry.register(sessionId, roomId, userId);
            }
        }
        return message;
    }
}
