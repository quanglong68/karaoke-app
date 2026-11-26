package com.karaoke.backend.service;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ClientIpResolverTest {

    @Test
    void ignoresForwardedHeaderWhenProxyIsNotTrusted() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.5");
        request.addHeader("X-Forwarded-For", "203.0.113.9");

        assertEquals("10.0.0.5", new ClientIpResolver(false).resolve(request));
    }

    @Test
    void usesFirstForwardedHopWhenProxyIsTrusted() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("172.18.0.1");
        request.addHeader("X-Forwarded-For", "203.0.113.9, 172.18.0.1");

        assertEquals("203.0.113.9", new ClientIpResolver(true).resolve(request));
    }

    @Test
    void fallsBackToRemoteAddressForMalformedForwardedHeader() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("172.18.0.1");
        request.addHeader("X-Forwarded-For", "not-an-ip<script>");

        assertEquals("172.18.0.1", new ClientIpResolver(true).resolve(request));
    }
}
