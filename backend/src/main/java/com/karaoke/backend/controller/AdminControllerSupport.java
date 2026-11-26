package com.karaoke.backend.controller;

import org.springframework.security.core.Authentication;

final class AdminControllerSupport {
    static final int MAX_SONG_TITLE_LENGTH = 120;
    static final int MAX_SONG_LYRICS_LENGTH = 10_000;

    private AdminControllerSupport() {
    }

    static String actorName(Authentication authentication) {
        return authentication == null ? "anonymous" : authentication.getName();
    }
}
