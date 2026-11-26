package com.karaoke.backend.service;

import com.karaoke.backend.model.Song;
import com.karaoke.backend.persistence.PitchContourCodec;
import com.karaoke.backend.persistence.PitchContourRepository;
import com.karaoke.backend.persistence.SongEntity;
import com.karaoke.backend.persistence.SongMapper;
import com.karaoke.backend.persistence.SongRepository;
import com.karaoke.backend.persistence.SongStatus;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class SongCatalog {
    private static final Logger log = LoggerFactory.getLogger(SongCatalog.class);

    private static final int CONTOUR_CACHE_LIMIT = 64;
    private static final Pattern SONG_ID_PATTERN = Pattern.compile("^S(\\d+)$");

    private final SongRepository songRepository;
    private final PitchContourRepository pitchContourRepository;
    private final PitchContourCodec pitchContourCodec;
    private final TransactionTemplate transactionTemplate;

    private volatile List<SongEntity> activeSongs = List.of();
    private final AtomicLong cacheEpoch = new AtomicLong();
    private final Map<String, List<Double>> contourCache = Collections.synchronizedMap(
            new LinkedHashMap<>(16, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, List<Double>> eldest) {
                    return size() > CONTOUR_CACHE_LIMIT;
                }
            });

    public SongCatalog(SongRepository songRepository, PitchContourRepository pitchContourRepository,
            PitchContourCodec pitchContourCodec, PlatformTransactionManager transactionManager) {
        this.songRepository = songRepository;
        this.pitchContourRepository = pitchContourRepository;
        this.pitchContourCodec = pitchContourCodec;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    @PostConstruct
    void loadFromDatabase() {
        refresh();
    }

    public synchronized void refresh() {
        activeSongs = List.copyOf(songRepository.findByStatusOrderByCreatedAtAsc(SongStatus.ACTIVE));
        synchronized (contourCache) {
            cacheEpoch.incrementAndGet();
            contourCache.clear();
        }
        log.info("Loaded {} active songs from database", activeSongs.size());
    }

    public boolean hasSongs() {
        return !activeSongs.isEmpty();
    }

    public int songCount() {
        return activeSongs.size();
    }

    public synchronized Song addSong(String title, String videoUrl, String vocalUrl, double duration, String lyrics,
            List<Double> pitch) {
        return addSong(title, videoUrl, vocalUrl, duration, lyrics, pitch, null);
    }

    public synchronized Song addSong(String title, String videoUrl, String vocalUrl, double duration, String lyrics,
            List<Double> pitch, String createdBy) {
        String creator = (createdBy == null || createdBy.isBlank()) ? null : createdBy.trim();
        // Run the inserts inside an explicit transaction while still holding the lock:
        // the song row and its pitch contour are committed together, and the next ID is
        // computed only after the previous row is visible to other threads.
        SongEntity entity = transactionTemplate.execute(status -> {
            SongEntity created = new SongEntity();
            created.setId(nextSongId());
            created.setSongName(title);
            created.setVideoUrl(videoUrl);
            created.setVocalUrl(vocalUrl);
            created.setListenDuration(duration);
            created.setTotalDuration(duration);
            created.setLyrics(lyrics);
            created.setStatus(SongStatus.ACTIVE);
            created.setCreatedBy(creator);
            songRepository.save(created);
            pitchContourRepository.save(pitchContourCodec.encode(created.getId(), pitch));
            return created;
        });
        refresh();
        List<Double> contour = pitch == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(pitch));
        return SongMapper.toDomain(entity, contour);
    }

    public Song pickRandom(Set<String> playedSongIds) {
        List<SongEntity> available = activeSongs.stream()
                .filter(Objects::nonNull)
                .filter(song -> song.getId() != null && !playedSongIds.contains(song.getId()))
                .toList();
        if (available.isEmpty()) {
            playedSongIds.clear();
            available = activeSongs.stream().filter(Objects::nonNull).toList();
        }
        if (available.isEmpty()) {
            return null;
        }
        SongEntity picked = available.get(ThreadLocalRandom.current().nextInt(available.size()));
        playedSongIds.add(picked.getId());
        return toSong(picked);
    }

    public List<Double> pitchContour(String songId) {
        if (songId == null) {
            return List.of();
        }
        List<Double> cached = contourCache.get(songId);
        if (cached != null) {
            return cached;
        }
        long epoch = cacheEpoch.get();
        List<Double> loaded = pitchContourRepository.findById(songId)
                .map(pitchContourCodec::decode)
                .orElseGet(() -> {
                    log.warn("Missing pitch contour for song {}", songId);
                    return List.of();
                });
        synchronized (contourCache) {
            if (cacheEpoch.get() == epoch) {
                contourCache.put(songId, loaded);
            }
        }
        return loaded;
    }

    private Song toSong(SongEntity entity) {
        return SongMapper.toDomain(entity, pitchContour(entity.getId()));
    }

    private String nextSongId() {
        // String ordering breaks once the numeric suffix reaches four digits
        // ("S999" > "S1000"), so compute the maximum numerically instead.
        int next = songRepository.findAllIds().stream()
                .mapToInt(this::parseSongNumber)
                .max()
                .orElse(0) + 1;
        return "S" + String.format("%03d", next);
    }

    private int parseSongNumber(String id) {
        Matcher matcher = SONG_ID_PATTERN.matcher(id);
        if (!matcher.matches()) {
            return 0;
        }
        try {
            return Integer.parseInt(matcher.group(1));
        } catch (NumberFormatException exception) {
            return 0;
        }
    }
}
