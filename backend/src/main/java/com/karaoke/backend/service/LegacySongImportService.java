package com.karaoke.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.model.Song;
import com.karaoke.backend.persistence.PitchContourCodec;
import com.karaoke.backend.persistence.PitchContourRepository;
import com.karaoke.backend.persistence.SongEntity;
import com.karaoke.backend.persistence.SongMapper;
import com.karaoke.backend.persistence.SongRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

@Service
public class LegacySongImportService {
    private static final Logger log = LoggerFactory.getLogger(LegacySongImportService.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SongRepository songRepository;
    private final PitchContourRepository pitchContourRepository;
    private final PitchContourCodec pitchContourCodec;

    public LegacySongImportService(SongRepository songRepository,
            PitchContourRepository pitchContourRepository, PitchContourCodec pitchContourCodec) {
        this.songRepository = songRepository;
        this.pitchContourRepository = pitchContourRepository;
        this.pitchContourCodec = pitchContourCodec;
    }

    @Transactional
    public int importFrom(Path path) throws IOException {
        List<Song> songs = objectMapper.readValue(path.toFile(), new TypeReference<>() {
        });
        if (songs == null) {
            return 0;
        }
        int imported = 0;
        for (Song song : songs) {
            if (song == null || song.getId() == null || song.getId().isBlank()) {
                continue;
            }
            if (songRepository.existsById(song.getId())) {
                continue;
            }
            SongEntity entity = SongMapper.toEntity(song);
            songRepository.save(entity);
            pitchContourRepository.save(pitchContourCodec.encode(song.getId(), song.getOriginalPitchContour()));
            imported++;
        }
        log.info("Imported {} legacy songs from {}", imported, path);
        return imported;
    }
}
