package com.karaoke.backend.service;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.GameSettings;
import com.karaoke.backend.persistence.SongEntity;
import com.karaoke.backend.persistence.SongRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Evaluates an admin sing-test attempt using the exact same DTW + Levenshtein
 * scoring pipeline and live GameSettings thresholds as a real multiplayer room.
 */
@Service
public class AdminPerformanceTestService {

    private static final int MAX_LYRICS_LENGTH = 2_000;
    private static final int MAX_PITCH_SAMPLES = 2_000;
    private static final double MIN_VOICED_HZ = 50.0;
    private static final double MAX_INPUT_PITCH_HZ = 2_000.0;

    public record PerformanceTestRequest(
            String userLyrics,
            List<Double> pitchContour,
            String lyricsOverride) {
    }

    public record PerformanceTestResponse(
            double toneScore,
            double lyricsScore,
            double finalScore,
            int successThreshold,
            double lyricsWeight,
            boolean lyricsUnavailable,
            boolean passed,
            int capturedSampleCount,
            int capturedVoicedCount,
            int referenceVoicedCount,
            String capturedLyrics) {
    }

    private final PerformanceScorer performanceScorer;
    private final GameConfigService gameConfigService;
    private final SongRepository songRepository;
    private final SongCatalog songCatalog;
    private final SmartSongDraftService draftService;

    public AdminPerformanceTestService(
            PerformanceScorer performanceScorer,
            GameConfigService gameConfigService,
            SongRepository songRepository,
            SongCatalog songCatalog,
            SmartSongDraftService draftService) {
        this.performanceScorer = performanceScorer;
        this.gameConfigService = gameConfigService;
        this.songRepository = songRepository;
        this.songCatalog = songCatalog;
        this.draftService = draftService;
    }

    public PerformanceTestResponse evaluateSong(String songId, PerformanceTestRequest request) {
        SongEntity song = songRepository.findById(songId)
                .orElseThrow(() -> AppException.notFound("SONG_NOT_FOUND"));
        List<Double> referencePitch = songCatalog.pitchContour(song.getId());
        return evaluateInternal(song.getLyrics(), referencePitch, request);
    }

    public PerformanceTestResponse evaluateDraft(String draftId, PerformanceTestRequest request) {
        List<Double> referencePitch = draftService.getAnalyzedPitchContour(draftId);
        String referenceLyrics = (request != null && request.lyricsOverride() != null)
                ? request.lyricsOverride().trim()
                : "";
        return evaluateInternal(referenceLyrics, referencePitch, request);
    }

    private PerformanceTestResponse evaluateInternal(
            String referenceLyrics,
            List<Double> referencePitch,
            PerformanceTestRequest request) {
        String rawUserLyrics = (request != null && request.userLyrics() != null) ? request.userLyrics() : "";
        String cleanUserLyrics = rawUserLyrics.length() > MAX_LYRICS_LENGTH
                ? rawUserLyrics.substring(0, MAX_LYRICS_LENGTH)
                : rawUserLyrics;

        List<Double> cleanUserPitch = sanitizePitchContour(request == null ? null : request.pitchContour());
        String safeRefLyrics = referenceLyrics == null ? "" : referenceLyrics;
        List<Double> safeRefPitch = referencePitch == null ? List.of() : referencePitch;

        double lyricsScore = performanceScorer.calculateLyricsScore(cleanUserLyrics, safeRefLyrics);
        double toneScore = performanceScorer.calculateToneScore(cleanUserPitch, safeRefPitch);
        boolean lyricsUnavailable = performanceScorer.lyricsUnavailable(cleanUserLyrics, safeRefLyrics);

        GameSettings settings = gameConfigService.current();
        double lyricsWeight = settings.lyricsWeight();
        double finalScore = lyricsUnavailable
                ? toneScore
                : (lyricsScore * lyricsWeight) + (toneScore * (1.0 - lyricsWeight));
        boolean passed = finalScore >= settings.successScore();

        return new PerformanceTestResponse(
                round1(toneScore),
                round1(lyricsScore),
                round1(finalScore),
                settings.successScore(),
                lyricsWeight,
                lyricsUnavailable,
                passed,
                cleanUserPitch.size(),
                countVoiced(cleanUserPitch),
                countVoiced(safeRefPitch),
                cleanUserLyrics.trim());
    }

    private static List<Double> sanitizePitchContour(List<Double> rawPitch) {
        if (rawPitch == null || rawPitch.isEmpty()) {
            return List.of();
        }
        List<Double> sanitized = new ArrayList<>(Math.min(rawPitch.size(), MAX_PITCH_SAMPLES));
        for (Double sample : rawPitch) {
            if (sanitized.size() >= MAX_PITCH_SAMPLES) {
                break;
            }
            if (sample != null && Double.isFinite(sample) && sample >= 0.0 && sample <= MAX_INPUT_PITCH_HZ) {
                sanitized.add(sample);
            }
        }
        return sanitized;
    }

    private static int countVoiced(List<Double> contour) {
        int count = 0;
        for (Double hz : contour) {
            if (hz != null && hz > MIN_VOICED_HZ && hz < MAX_INPUT_PITCH_HZ) {
                count++;
            }
        }
        return count;
    }

    private static double round1(double val) {
        return Math.round(val * 10.0) / 10.0;
    }
}
