package com.karaoke.backend.service;

import org.apache.commons.text.similarity.LevenshteinDistance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Pure scoring engine for pitch (DTW on semitone contours) and lyrics (normalized Levenshtein).
 */
@Component
public class PerformanceScorer {
    private static final Logger log = LoggerFactory.getLogger(PerformanceScorer.class);

    // DTW backtracks through an (n+1)x(m+1) direction table using two rolling 1D
    // cost rows. 800 samples covers a 60s performance comfortably while keeping peak
    // allocation near ~640 KB (byte[][]) instead of ~5.1 MB (double[][]).
    private static final int MAX_SCORING_SAMPLES = 800;
    private static final byte STEP_MATCH = 0;
    private static final byte STEP_INSERT = 1;
    private static final byte STEP_DELETE = 2;
    private static final int MAX_TEXT_LENGTH = 3_000;
    private static final double MIN_VOICED_HZ = 50.0;
    private static final double MAX_VOICED_HZ = 2_000.0;
    private static final double TRIM_RATIO = 0.05;
    private static final double DTW_STRETCH_PENALTY = 2.0;
    private static final double ALIGNMENT_PERCENTILE = 0.7;
    private static final double SEMITONE_PENALTY_FACTOR = 14.0;
    private static final double MIN_ORIG_PITCH_VARIANCE = 1.2;
    private static final double MIN_USER_PITCH_VARIANCE = 0.6;
    private static final double MIN_COVERAGE_RATIO = 0.6;
    private static final double MIN_LYRICS_COVERAGE_RATIO = 0.2;
    private static final int MIN_LYRICS_CHARS = 3;

    public double calculateToneScore(List<Double> userPitch, List<Double> originalPitch) {
        if (userPitch == null || userPitch.isEmpty() || originalPitch == null || originalPitch.isEmpty()) {
            log.info("Tone skipped: empty contour (user={} original={})",
                    userPitch == null ? 0 : userPitch.size(),
                    originalPitch == null ? 0 : originalPitch.size());
            return 0.0;
        }

        // Silences between phrases arrive as 0 Hz. Keeping them in the DTW alignment
        // masquerades as a 5-semitone error and drags every real attempt to 0 points.
        List<Double> userSamples = voicedSamples(limitSamples(userPitch));
        List<Double> originalSamples = voicedSamples(limitSamples(originalPitch));
        if (userSamples.size() < 2 || originalSamples.size() < 2) {
            log.info("Tone skipped: not enough voiced samples (user={} original={})",
                    userSamples.size(), originalSamples.size());
            return 0.0;
        }

        double[] userStats = analyzePitch(userSamples);
        double[] origStats = analyzePitch(originalSamples);

        double userMean = userStats[0];
        double origMean = origStats[0];
        double userVar = userStats[1];
        double origVar = origStats[1];

        double keyShift = origMean - userMean;
        int n = userSamples.size();
        int m = originalSamples.size();
        double[] prev = new double[m + 1];
        double[] curr = new double[m + 1];
        byte[][] step = new byte[n + 1][m + 1];
        Arrays.fill(prev, Double.MAX_VALUE);
        prev[0] = 0.0;

        for (int i = 1; i <= n; i++) {
            curr[0] = Double.MAX_VALUE;
            double userHz = userSamples.get(i - 1);
            for (int j = 1; j <= m; j++) {
                double cost = noteCost(userHz, originalSamples.get(j - 1), keyShift);
                double match = prev[j - 1];
                double insert = prev[j] + DTW_STRETCH_PENALTY;
                double delete = curr[j - 1] + DTW_STRETCH_PENALTY;

                if (match <= insert && match <= delete) {
                    curr[j] = cost + match;
                    step[i][j] = STEP_MATCH;
                } else if (insert <= delete) {
                    curr[j] = cost + insert;
                    step[i][j] = STEP_INSERT;
                } else {
                    curr[j] = cost + delete;
                    step[i][j] = STEP_DELETE;
                }
            }
            double[] swap = prev;
            prev = curr;
            curr = swap;
        }

        // Score a high-percentile alignment cost rather than the mean: a few detections
        // during note transitions are garbage and would otherwise dominate the average,
        // while the upper part of the distribution still punishes a wandering melody.
        double averageDeviation = alignmentDeviation(step, userSamples, originalSamples, keyShift);

        double score = Math.max(0, 100 - (averageDeviation * SEMITONE_PENALTY_FACTOR));
        if (origVar > MIN_ORIG_PITCH_VARIANCE && userVar < MIN_USER_PITCH_VARIANCE) {
            score = 0.0;
        }
        // Singing only a short fragment used to score highly because DTW can stretch
        // those few notes over the whole song; scale it down until most of it is sung.
        double coverage = Math.min(1.0, (double) n / m);
        score *= Math.min(1.0, coverage / MIN_COVERAGE_RATIO);

        log.info("Tone detail: userSamples={} originalSamples={} userVar={} origVar={} keyShift={} avgDeviation={} score={}",
                n, m, round2(userVar), round2(origVar), round2(keyShift), round2(averageDeviation),
                Math.round(score));
        return score;
    }

    public boolean lyricsUnavailable(String userLyrics, String originalLyrics) {
        String cleanOriginal = normalizeText(originalLyrics);
        if (cleanOriginal.isEmpty()) {
            return true;
        }
        String cleanUser = normalizeText(userLyrics);
        return cleanUser.length() < Math.max(MIN_LYRICS_CHARS, Math.round(cleanOriginal.length() * MIN_LYRICS_COVERAGE_RATIO));
    }

    public double calculateLyricsScore(String userLyrics, String originalLyrics) {
        String cleanUserLyrics = truncate(normalizeText(userLyrics), MAX_TEXT_LENGTH);
        String cleanOriginalLyrics = truncate(normalizeText(originalLyrics), MAX_TEXT_LENGTH);

        int maxLength = Math.max(cleanUserLyrics.length(), cleanOriginalLyrics.length());
        if (maxLength == 0) {
            return 0;
        }
        int distance = LevenshteinDistance.getDefaultInstance().apply(cleanUserLyrics, cleanOriginalLyrics);
        return (1.0 - ((double) distance / maxLength)) * 100;
    }

    private double[] analyzePitch(List<Double> pitches) {
        List<Double> notes = new ArrayList<>();
        for (Double hz : pitches) {
            if (hz != null && hz > MIN_VOICED_HZ && hz < MAX_VOICED_HZ) {
                notes.add(12 * (Math.log(hz / 440.0) / Math.log(2)));
            }
        }
        if (notes.size() < 2) {
            return new double[] { 0.0, 0.0 };
        }

        Collections.sort(notes);
        int trim = (int) (notes.size() * TRIM_RATIO);
        List<Double> cleanNotes = notes.subList(trim, notes.size() - trim);
        if (cleanNotes.isEmpty()) {
            cleanNotes = notes;
        }
        double sum = 0;
        for (double note : cleanNotes) {
            sum += note;
        }
        double mean = sum / cleanNotes.size();
        double varianceSum = 0;
        for (double note : cleanNotes) {
            varianceSum += Math.pow(note - mean, 2);
        }
        double variance = Math.sqrt(varianceSum / cleanNotes.size());
        return new double[] { mean, variance };
    }

    private double noteCost(double userHz, double originalHz, double keyShift) {
        double userNote = 12 * (Math.log(userHz / 440.0) / Math.log(2)) + keyShift;
        double originalNote = 12 * (Math.log(originalHz / 440.0) / Math.log(2));
        return Math.abs(userNote - originalNote);
    }

    private double alignmentDeviation(byte[][] step, List<Double> userSamples, List<Double> originalSamples,
            double keyShift) {
        List<Double> costs = new ArrayList<>();
        int i = userSamples.size();
        int j = originalSamples.size();
        while (i > 0 && j > 0) {
            byte direction = step[i][j];
            if (direction == STEP_MATCH) {
                costs.add(noteCost(userSamples.get(i - 1), originalSamples.get(j - 1), keyShift));
                i--;
                j--;
            } else if (direction == STEP_INSERT) {
                i--;
            } else {
                j--;
            }
        }
        if (costs.isEmpty()) {
            return 0.0;
        }
        costs.sort(Double::compareTo);
        int index = (int) Math.round(costs.size() * ALIGNMENT_PERCENTILE);
        return costs.get(Math.min(costs.size() - 1, index));
    }

    private List<Double> voicedSamples(List<Double> samples) {
        List<Double> voiced = new ArrayList<>(samples.size());
        for (Double hz : samples) {
            if (hz != null && hz > MIN_VOICED_HZ && hz < MAX_VOICED_HZ) {
                voiced.add(hz);
            }
        }
        return voiced;
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private List<Double> limitSamples(List<Double> samples) {
        if (samples.size() <= MAX_SCORING_SAMPLES) {
            return samples;
        }
        List<Double> limited = new ArrayList<>(MAX_SCORING_SAMPLES);
        double step = (double) samples.size() / MAX_SCORING_SAMPLES;
        for (int i = 0; i < MAX_SCORING_SAMPLES; i++) {
            limited.add(samples.get(Math.min(samples.size() - 1, (int) (i * step))));
        }
        return limited;
    }

    private String normalizeText(String text) {
        if (text == null) {
            return "";
        }
        // Vietnamese 'đ' (U+0111) does not decompose in NFD; map it before stripping
        // non-ASCII characters so distinct words like "đêm" and "em" do not collapse.
        String lowered = text.toLowerCase(Locale.ROOT).replace('đ', 'd');
        String normalized = Normalizer.normalize(lowered, Normalizer.Form.NFD);
        normalized = normalized.replaceAll("\\p{M}", "");
        normalized = normalized.replaceAll("\\s+", " ");
        normalized = normalized.replaceAll("[^a-z0-9 ]", "");
        return normalized.trim();
    }

    private String truncate(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }
}
