package com.karaoke.backend.service;

import com.karaoke.backend.exception.AppException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class YoutubeAndSubtitleTest {

    @Test
    void extractsAndNormalizesValidYoutubeUrls() {
        assertEquals(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                YoutubeUrlValidator.normalizeYoutubeUrl("https://youtu.be/dQw4w9WgXcQ?si=abc123"));
        assertEquals(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                YoutubeUrlValidator.normalizeYoutubeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123"));
        assertEquals(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                YoutubeUrlValidator.normalizeYoutubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"));
    }

    @Test
    void rejectsNonYoutubeOrInjectionUrls() {
        assertThrows(AppException.class, () -> YoutubeUrlValidator.normalizeYoutubeUrl("https://evil.com/watch?v=dQw4w9WgXcQ"));
        assertThrows(AppException.class, () -> YoutubeUrlValidator.normalizeYoutubeUrl("file:///etc/passwd"));
        assertThrows(AppException.class, () -> YoutubeUrlValidator.normalizeYoutubeUrl("--exec=calc"));
        assertThrows(AppException.class, () -> YoutubeUrlValidator.normalizeYoutubeUrl("https://www.youtube.com/watch?v=short"));
    }

    @Test
    void cleansYoutubeAndFilenameNoise() {
        assertEquals(
                "Không Buông - Hngle",
                YoutubeUrlValidator.cleanSongTitle("Không Buông - Hngle [Official Music Video] (4K)"));
        assertEquals(
                "Trước Khi Em Tồn Tại",
                YoutubeUrlValidator.cleanSongTitle("01. Trước Khi Em Tồn Tại | Official Lyrics Video.mp4"));
        assertEquals(
                "song1",
                YoutubeUrlValidator.cleanSongTitle("1779787768116_main_song1.mp4"));
    }

    @Test
    void extractsOverlappingSubtitleLinesFromVttAndSrt() {
        String vtt = """
                WEBVTT

                00:00:05.000 --> 00:00:09.500
                [Nhạc]

                00:00:10.000 --> 00:00:14.000
                ♪ <c>Cám ơn anh</c> vì ngày tháng qua ♪

                00:00:14.100 --> 00:00:18.200
                Cám ơn anh vì ngày tháng qua

                00:00:18.300 --> 00:00:22.500
                Và cám ơn anh vì đã để chúng mình xa

                00:00:30.000 --> 00:00:35.000
                Câu này nằm ngoài khung hát
                """;

        String extracted = SubtitleSegmentExtractor.extractFromText(vtt, 10.0, 23.0);
        assertEquals(
                "Cám ơn anh vì ngày tháng qua\nVà cám ơn anh vì đã để chúng mình xa",
                extracted);
    }
}
