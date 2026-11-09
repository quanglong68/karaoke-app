package com.karaoke.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.model.Song;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ToneScoringTest {

    private final GameService gameService = new GameService(null, null, 3);

    private List<Double> originalContour() throws Exception {
        List<Song> songs = new ObjectMapper().readValue(
                new File("data/songs.json"), new TypeReference<List<Song>>() {
                });
        return songs.get(0).getOriginalPitchContour();
    }

    @Test
    void silentContourScoresZero() throws Exception {
        List<Double> zeros = new ArrayList<>();
        for (int i = 0; i < originalContour().size(); i++) {
            zeros.add(0.0);
        }
        assertEquals(0.0, gameService.calculateToneScore(zeros, originalContour()));
    }

    @Test
    void monotoneHumScoresZero() throws Exception {
        List<Double> hum = new ArrayList<>();
        for (int i = 0; i < originalContour().size(); i++) {
            hum.add(220.0);
        }
        assertEquals(0.0, gameService.calculateToneScore(hum, originalContour()));
    }

    @Test
    void sameMelodyInDifferentKeyScoresFull() throws Exception {
        List<Double> shifted = new ArrayList<>();
        for (Double hz : originalContour()) {
            if (hz != null && hz > 0) {
                shifted.add(hz * Math.pow(2, 2.0 / 12.0));
            }
        }
        double score = gameService.calculateToneScore(shifted, originalContour());
        assertTrue(score >= 95, "Expected near-perfect score, got " + score);
    }

    @Test
    void slightlyOffMelodyStillPassesToneGate() throws Exception {
        Random random = new Random(42);
        List<Double> noisy = new ArrayList<>();
        for (Double hz : originalContour()) {
            if (hz != null && hz > 0) {
                double semitones = (random.nextDouble() - 0.5) * 2; // +/- 1 semitone
                noisy.add(hz * Math.pow(2, semitones / 12.0));
            }
        }
        double score = gameService.calculateToneScore(noisy, originalContour());
        assertTrue(score >= 80, "Expected a passable score, got " + score);
    }

    @Test
    void shortFragmentIsPenalised() throws Exception {
        List<Double> full = originalContour();
        List<Double> fragment = new ArrayList<>(full.subList(0, full.size() / 10));
        double fullScore = gameService.calculateToneScore(full, full);
        double fragmentScore = gameService.calculateToneScore(fragment, full);
        assertTrue(fragmentScore < fullScore / 2,
                "Fragment " + fragmentScore + " should be far below full " + fullScore);
    }

    @Test
    void detectorOutliersDoNotWipeTheScore() throws Exception {
        Random random = new Random(7);
        List<Double> sang = new ArrayList<>();
        for (Double hz : originalContour()) {
            if (hz == null || hz <= 0) {
                continue;
            }
            double semitones = (random.nextDouble() - 0.5) * 1.5;
            double value = hz * Math.pow(2, semitones / 12.0);
            if (random.nextDouble() < 0.25) {
                value *= random.nextBoolean() ? 2 : 0.5; // octave glitches during transitions
            }
            sang.add(value);
        }
        double score = gameService.calculateToneScore(sang, originalContour());
        assertTrue(score >= 80, "Outliers should not sink a correct melody, got " + score);
    }

    @Test
    void blankTranscriptFallsBackToToneOnly() {
        String original = "mot hai ba bon nam sau bay tam chin muoi";
        assertTrue(gameService.lyricsUnavailable("", original));
        assertTrue(gameService.lyricsUnavailable(" ", original));
        assertTrue(gameService.lyricsUnavailable("   ", original));
        assertTrue(gameService.lyricsUnavailable(" ", ""));
        assertFalse(gameService.lyricsUnavailable(original, original));
    }

    @Test
    void wrongMelodyScoresLow() throws Exception {
        Random random = new Random(11);
        List<Double> noise = new ArrayList<>();
        for (int i = 0; i < originalContour().size(); i++) {
            noise.add(200.0 + random.nextDouble() * 300.0);
        }
        double score = gameService.calculateToneScore(noise, originalContour());
        assertTrue(score < 55, "A random melody should not pass, got " + score);
    }
}
