package com.karaoke.backend.service;

import com.karaoke.backend.persistence.PitchContourRepository;
import com.karaoke.backend.persistence.SongRepository;
import com.karaoke.backend.persistence.SongStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
class LegacySongImportServiceTest {

    @Autowired
    private LegacySongImportService importService;

    @Autowired
    private SongRepository songRepository;

    @Autowired
    private PitchContourRepository pitchContourRepository;

    @Autowired
    private SongCatalog songCatalog;

    @Test
    void importIsIdempotentAndContoursAreReadable() throws Exception {
        Path source = Files.createTempFile("legacy-songs", ".json");
        try {
            Files.writeString(source, """
                    [
                      {"id":"S900","songName":"Legacy One","videoUrl":"https://example.test/1.mp4",
                       "listenDuration":10.0,"totalDuration":10.0,"originalLyrics":"la la",
                       "originalPitchContour":[220.0,330.0,0.0]},
                      {"id":"S901","songName":"Legacy Two","videoUrl":"https://example.test/2.mp4",
                       "listenDuration":20.0,"totalDuration":20.0,"originalLyrics":"na na",
                       "originalPitchContour":[440.0,550.0]}
                    ]
                    """);

            assertEquals(2, importService.importFrom(source));
            assertEquals(0, importService.importFrom(source));

            assertEquals(2, songRepository.countByStatus(SongStatus.ACTIVE));
            assertEquals(2, pitchContourRepository.count());

            songCatalog.refresh();
            assertEquals(2, songCatalog.songCount());
            assertEquals(List.of(220.0, 330.0, 0.0), songCatalog.pitchContour("S900"));
        } finally {
            Files.deleteIfExists(source);
        }
    }
}
