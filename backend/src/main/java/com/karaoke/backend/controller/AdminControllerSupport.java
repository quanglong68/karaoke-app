package com.karaoke.backend.controller;

import org.springframework.security.core.Authentication;

public final class AdminControllerSupport {
    public static final int MAX_SONG_TITLE_LENGTH = 120;
    public static final int MAX_SONG_LYRICS_LENGTH = 10_000;

    private AdminControllerSupport() {
    }

    public static String actorName(Authentication authentication) {
        return authentication == null ? "anonymous" : authentication.getName();
    }
}
