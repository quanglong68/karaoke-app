package com.karaoke.backend.service;

import com.karaoke.backend.model.Song;
import com.karaoke.backend.persistence.PitchContourRepository;
import com.karaoke.backend.persistence.SongRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:catalog;DB_CLOSE_DELAY=-1")
class SongCatalogTest {

    @Autowired
    private SongCatalog songCatalog;

    @Autowired
    private SongRepository songRepository;

    @Autowired
    private PitchContourRepository pitchContourRepository;

    @Test
    void addSongPersistsRowAndContourAndRefreshesCatalog() {
        int before = songCatalog.songCount();
        List<Double> contour = List.of(220.0, 330.0, 0.0, 440.0);

        String vocalUrl = "https://res.cloudinary.com/demo/video/upload/v1/karaoke/vocals/v.mp3";
        Song added = songCatalog.addSong("New Song", "https://example.test/v.mp4", vocalUrl, 12.5, "la la", contour);

        assertNotNull(added.getId());
        assertTrue(added.getId().matches("S\\d{3}"), "Unexpected id " + added.getId());
        assertTrue(songRepository.existsById(added.getId()));
        assertTrue(pitchContourRepository.existsById(added.getId()));
        assertEquals(vocalUrl, songRepository.findById(added.getId()).orElseThrow().getVocalUrl());
        assertEquals(before + 1, songCatalog.songCount());
        assertEquals(contour, songCatalog.pitchContour(added.getId()));
    }

    @Test
    void addSongPersistsCreatedByWhenProvided() {
        Song added = songCatalog.addSong("Authored", "https://example.test/a.mp4", null, 15.0, "do re",
                List.of(220.0, 240.0), "boss");

        assertEquals("boss", songRepository.findById(added.getId()).orElseThrow().getCreatedBy());
    }

    @Test
    void pickRandomClearsPlayedIdsWhenAllSongsAreUsed() {
        songCatalog.addSong("Filler", "https://example.test/f.mp4", null, 5.0, "do", List.of(200.0, 300.0));
        songCatalog.refresh();

        Set<String> played = new HashSet<>(songRepository.findAll().stream()
                .map(song -> song.getId())
                .toList());
        assertFalse(played.isEmpty());

        Song picked = songCatalog.pickRandom(played);

        assertNotNull(picked);
        assertEquals(Set.of(picked.getId()), played);
    }
}
