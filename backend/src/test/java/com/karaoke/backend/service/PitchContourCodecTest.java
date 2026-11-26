package com.karaoke.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.model.Song;
import com.karaoke.backend.persistence.PitchContourCodec;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PitchContourCodecTest {

    private final PitchContourCodec codec = new PitchContourCodec();

    @Test
    void encodedContourDecodesExactlyAndScoresIdentically() throws Exception {
        List<Song> songs = new ObjectMapper().readValue(
                new File("data/songs.json"), new TypeReference<List<Song>>() {
                });
        List<Double> original = songs.get(0).getOriginalPitchContour();

        List<Double> decoded = codec.decode(codec.encode(songs.get(0).getId(), original));

        assertEquals(original, decoded);
        GameService gameService = new GameService(null, null, null);
        assertEquals(
                gameService.calculateToneScore(original, original),
                gameService.calculateToneScore(decoded, decoded),
                1e-12);
    }
}
