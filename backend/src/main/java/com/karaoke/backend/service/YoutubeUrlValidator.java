package com.karaoke.backend.service;

import com.karaoke.backend.exception.AppException;

import java.net.URI;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Strict YouTube URL validator (prevents SSRF / CLI option injection) and song title cleaner.
 */
public final class YoutubeUrlValidator {

    private static final Set<String> ALLOWED_HOSTS = Set.of(
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "music.youtube.com",
            "youtu.be");

    private static final Pattern VIDEO_ID_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{11}$");
    private static final Pattern NOISE_BRACKETS = Pattern.compile(
            "(?i)\\s*[\\[\\(][^\\]\\)]*(official|music\\s*video|m/v|\\bmv\\b|lyric|lyrics|audio|visualizer|hd|4k|karaoke|vietsub|ost|prod\\.|remaster)[^\\]\\)]*[\\]\\)]");
    private static final Pattern TRAILING_PIPE_NOISE = Pattern.compile(
            "(?i)\\s*[|｜]\\s*(official|mv|m/v|music\\s*video|lyrics?|audio|4k).*$");
    private static final Pattern LEADING_TRACK_NUM = Pattern.compile("^\\s*\\d{1,3}[._\\-\\s]+");
    private static final Pattern TIMESTAMP_PREFIX = Pattern.compile("^\\d{10,}_(?:main_|vocal_)?");

    private YoutubeUrlValidator() {
    }

    public static String extractVideoId(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank() || rawUrl.length() > 500) {
            throw AppException.badRequest("INVALID_YOUTUBE_URL");
        }
        URI uri;
        try {
            uri = URI.create(rawUrl.trim());
        } catch (IllegalArgumentException exception) {
            throw AppException.badRequest("INVALID_YOUTUBE_URL");
        }

        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"https".equals(scheme) && !"http".equals(scheme)) {
            throw AppException.badRequest("INVALID_YOUTUBE_URL");
        }

        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (!ALLOWED_HOSTS.contains(host)) {
            throw AppException.badRequest("INVALID_YOUTUBE_URL");
        }

        String candidate = null;
        String path = uri.getPath() == null ? "" : uri.getPath();
        if ("youtu.be".equals(host)) {
            String trimmed = path.startsWith("/") ? path.substring(1) : path;
            int slash = trimmed.indexOf('/');
            candidate = slash >= 0 ? trimmed.substring(0, slash) : trimmed;
        } else if (path.equals("/watch")) {
            candidate = extractQueryParam(uri.getRawQuery(), "v");
        } else if (path.startsWith("/shorts/") || path.startsWith("/embed/") || path.startsWith("/live/")) {
            String[] segments = path.split("/");
            if (segments.length >= 3) {
                candidate = segments[2];
            }
        }

        if (candidate == null || !VIDEO_ID_PATTERN.matcher(candidate).matches()) {
            throw AppException.badRequest("INVALID_YOUTUBE_URL");
        }
        return candidate;
    }

    public static String normalizeYoutubeUrl(String rawUrl) {
        return "https://www.youtube.com/watch?v=" + extractVideoId(rawUrl);
    }

    public static String cleanSongTitle(String rawTitleOrFilename) {
        if (rawTitleOrFilename == null || rawTitleOrFilename.isBlank()) {
            return "";
        }
        String cleaned = rawTitleOrFilename.trim();
        // Strip file extension if filename
        int lastSlash = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
        if (lastSlash >= 0 && lastSlash < cleaned.length() - 1) {
            cleaned = cleaned.substring(lastSlash + 1);
        }
        int dot = cleaned.lastIndexOf('.');
        if (dot > 0 && cleaned.length() - dot <= 6) {
            String ext = cleaned.substring(dot).toLowerCase(Locale.ROOT);
            if (Set.of(".mp4", ".webm", ".mov", ".m4v", ".mkv", ".mp3", ".wav").contains(ext)) {
                cleaned = cleaned.substring(0, dot);
            }
        }
        cleaned = TIMESTAMP_PREFIX.matcher(cleaned).replaceFirst("");
        cleaned = NOISE_BRACKETS.matcher(cleaned).replaceAll("");
        cleaned = TRAILING_PIPE_NOISE.matcher(cleaned).replaceAll("");
        if (!cleaned.contains(" ") && (cleaned.contains("_") || cleaned.contains("-"))) {
            cleaned = cleaned.replace('_', ' ').replace('-', ' ');
        }
        cleaned = LEADING_TRACK_NUM.matcher(cleaned).replaceFirst("");
        cleaned = cleaned.replaceAll("\\s{2,}", " ").trim();
        if (cleaned.length() > 120) {
            cleaned = cleaned.substring(0, 120).trim();
        }
        return cleaned;
    }

    private static String extractQueryParam(String rawQuery, String key) {
        if (rawQuery == null || rawQuery.isBlank()) {
            return null;
        }
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0 && key.equals(pair.substring(0, eq))) {
                return pair.substring(eq + 1);
            }
        }
        return null;
    }
}
