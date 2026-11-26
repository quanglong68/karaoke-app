package com.karaoke.backend.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts clean lyric lines overlapping [startSec, endSec] from WebVTT (.vtt) or SubRip (.srt) files.
 */
public final class SubtitleSegmentExtractor {

    private static final Pattern TIMECODE_LINE = Pattern.compile(
            "((?:\\d{1,2}:)?\\d{2}:\\d{2}[.,]\\d{3})\\s*-->\\s*((?:\\d{1,2}:)?\\d{2}:\\d{2}[.,]\\d{3})");
    private static final Pattern TAG_PATTERN = Pattern.compile("<[^>]+>");
    private static final Pattern NOISE_LINE_PATTERN = Pattern.compile(
            "(?i)^\\s*[\\[\\(♪♫]*(nhạc|music|intro|outro|instrumental|applause|vỗ tay)[\\]\\)♪♫\\s]*$");
    private static final double MIN_OVERLAP_SEC = 0.25;

    private SubtitleSegmentExtractor() {
    }

    public static String extractSegment(Path subtitleFile, double startSec, double endSec) {
        if (subtitleFile == null || !Files.isRegularFile(subtitleFile) || endSec <= startSec) {
            return "";
        }
        String content;
        try {
            content = Files.readString(subtitleFile, StandardCharsets.UTF_8);
        } catch (IOException exception) {
            return "";
        }
        return extractFromText(content, startSec, endSec);
    }

    public static String extractFromText(String rawContent, double startSec, double endSec) {
        if (rawContent == null || rawContent.isBlank() || endSec <= startSec) {
            return "";
        }
        String normalized = rawContent.replace("\uFEFF", "").replace("\r\n", "\n").replace('\r', '\n');
        String[] blocks = normalized.split("\n\n+");
        List<String> collected = new ArrayList<>();

        for (String block : blocks) {
            String[] lines = block.split("\n");
            int timeLineIdx = -1;
            Matcher timeMatcher = null;
            for (int i = 0; i < lines.length; i++) {
                Matcher m = TIMECODE_LINE.matcher(lines[i].trim());
                if (m.find()) {
                    timeLineIdx = i;
                    timeMatcher = m;
                    break;
                }
            }
            if (timeLineIdx < 0 || timeMatcher == null) {
                continue;
            }
            double cueStart = parseTimestamp(timeMatcher.group(1));
            double cueEnd = parseTimestamp(timeMatcher.group(2));
            double overlap = Math.min(cueEnd, endSec) - Math.max(cueStart, startSec);
            double cueDuration = Math.max(0.01, cueEnd - cueStart);
            if (overlap < Math.min(MIN_OVERLAP_SEC, cueDuration * 0.5)) {
                continue;
            }

            for (int j = timeLineIdx + 1; j < lines.length; j++) {
                String clean = cleanCueLine(lines[j]);
                if (clean.isEmpty()) {
                    continue;
                }
                if (collected.isEmpty() || !collected.getLast().equalsIgnoreCase(clean)) {
                    collected.add(clean);
                }
            }
        }
        return String.join("\n", collected).trim();
    }

    private static String cleanCueLine(String raw) {
        if (raw == null) {
            return "";
        }
        String s = TAG_PATTERN.matcher(raw).replaceAll("");
        s = s.replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("♪", "")
                .replace("♫", "")
                .replaceAll("\\s+", " ")
                .trim();
        if (s.isEmpty() || NOISE_LINE_PATTERN.matcher(s).matches()) {
            return "";
        }
        return s;
    }

    private static double parseTimestamp(String raw) {
        String normalized = raw.trim().replace(',', '.');
        String[] parts = normalized.split(":");
        if (parts.length == 3) {
            return Integer.parseInt(parts[0]) * 3600.0
                    + Integer.parseInt(parts[1]) * 60.0
                    + Double.parseDouble(parts[2]);
        }
        if (parts.length == 2) {
            return Integer.parseInt(parts[0]) * 60.0
                    + Double.parseDouble(parts[1]);
        }
        return 0.0;
    }
}
