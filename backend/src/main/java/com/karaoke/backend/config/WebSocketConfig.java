package com.karaoke.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.StompWebSocketEndpointRegistration;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.Arrays;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    private final PresenceChannelInterceptor presenceChannelInterceptor;
    private final OriginHandshakeInterceptor originHandshakeInterceptor;
    private final String[] allowedOriginPatterns;

    public WebSocketConfig(PresenceChannelInterceptor presenceChannelInterceptor,
            OriginHandshakeInterceptor originHandshakeInterceptor,
            @Value("${app.allowed-origins:}") String origins) {
        this.presenceChannelInterceptor = presenceChannelInterceptor;
        this.originHandshakeInterceptor = originHandshakeInterceptor;
        this.allowedOriginPatterns = Arrays.stream(origins.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .toArray(String[]::new);
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        StompWebSocketEndpointRegistration registration = registry.addEndpoint("/ws-karaoke")
                .addInterceptors(originHandshakeInterceptor);
        if (allowedOriginPatterns.length > 0) {
            registration.setAllowedOriginPatterns(allowedOriginPatterns);
        }
        registration.withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(presenceChannelInterceptor);
    }
}
