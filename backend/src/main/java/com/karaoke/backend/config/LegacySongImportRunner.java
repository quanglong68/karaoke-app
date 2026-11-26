package com.karaoke.backend.config;

import com.karaoke.backend.service.LegacySongImportService;
import com.karaoke.backend.service.SongCatalog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Path;

@Component
@ConditionalOnProperty(name = "app.legacy-import.enabled", havingValue = "true")
public class LegacySongImportRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(LegacySongImportRunner.class);

    private final LegacySongImportService importService;
    private final SongCatalog songCatalog;
    private final Path source;

    public LegacySongImportRunner(LegacySongImportService importService, SongCatalog songCatalog,
            @Value("${app.legacy-import.path:data/songs.json}") String source) {
        this.importService = importService;
        this.songCatalog = songCatalog;
        this.source = Path.of(source);
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            int imported = importService.importFrom(source);
            songCatalog.refresh();
            log.info("Legacy song import finished: {} new songs", imported);
        } catch (IOException exception) {
            throw new IllegalStateException("Legacy song import failed for " + source, exception);
        }
    }
}
