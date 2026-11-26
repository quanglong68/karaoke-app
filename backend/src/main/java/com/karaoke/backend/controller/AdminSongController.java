package com.karaoke.backend.controller;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.persistence.PitchContourRepository;
import com.karaoke.backend.persistence.SongEntity;
import com.karaoke.backend.persistence.SongRepository;
import com.karaoke.backend.persistence.SongStatus;
import com.karaoke.backend.service.AuditLogger;
import com.karaoke.backend.service.ClientIpResolver;
import com.karaoke.backend.service.CloudinaryMediaService;
import com.karaoke.backend.service.SongCatalog;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/songs")
public class AdminSongController {

    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_PAGE_INDEX = 1_000;
    private static final int MAX_QUERY_LENGTH = 100;

    public record SongSummary(String id, String songName, double listenDuration, double totalDuration,
            String status, Integer sampleCount, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
    }

    public record SongDetail(String id, String songName, String videoUrl, String vocalUrl, double listenDuration,
            double totalDuration, String lyrics, String status, Integer sampleCount, String createdBy,
            OffsetDateTime createdAt, OffsetDateTime updatedAt) {
    }

    public record PageResponse<T>(List<T> items, int page, int size, long total, int totalPages) {
    }

    public record SongUpdateRequest(String songName, String lyrics, String status) {
    }

    private final SongRepository songRepository;
    private final PitchContourRepository pitchContourRepository;
    private final SongCatalog songCatalog;
    private final CloudinaryMediaService cloudinaryMediaService;
    private final AuditLogger auditLogger;
    private final ClientIpResolver clientIpResolver;

    public AdminSongController(SongRepository songRepository, PitchContourRepository pitchContourRepository,
            SongCatalog songCatalog, CloudinaryMediaService cloudinaryMediaService, AuditLogger auditLogger,
            ClientIpResolver clientIpResolver) {
        this.songRepository = songRepository;
        this.pitchContourRepository = pitchContourRepository;
        this.songCatalog = songCatalog;
        this.cloudinaryMediaService = cloudinaryMediaService;
        this.auditLogger = auditLogger;
        this.clientIpResolver = clientIpResolver;
    }

    @GetMapping
    public PageResponse<SongSummary> list(@RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        SongStatus statusFilter = parseOptionalStatus(status);
        String query = q == null ? "" : q.trim();
        if (query.length() > MAX_QUERY_LENGTH) {
            throw AppException.badRequest("BAD_REQUEST");
        }
        int safePage = Math.min(Math.max(0, page), MAX_PAGE_INDEX);
        Pageable pageable = PageRequest.of(safePage, Math.min(Math.max(1, size), MAX_PAGE_SIZE),
                Sort.by(Sort.Direction.DESC, "createdAt"));

        Page<SongEntity> result;
        if (statusFilter != null && !query.isEmpty()) {
            result = songRepository.findByStatusAndSongNameContainingIgnoreCase(statusFilter, query, pageable);
        } else if (statusFilter != null) {
            result = songRepository.findByStatus(statusFilter, pageable);
        } else if (!query.isEmpty()) {
            result = songRepository.findBySongNameContainingIgnoreCase(query, pageable);
        } else {
            result = songRepository.findAll(pageable);
        }

        Map<String, Integer> sampleCounts = sampleCounts(result.getContent());
        List<SongSummary> items = result.getContent().stream()
                .map(song -> toSummary(song, sampleCounts.get(song.getId())))
                .toList();
        return new PageResponse<>(items, result.getNumber(), result.getSize(), result.getTotalElements(),
                result.getTotalPages());
    }

    @GetMapping("/{id}")
    public SongDetail detail(@PathVariable String id) {
        SongEntity song = findSong(id);
        return toDetail(song, pitchContourRepository.findSampleCountBySongId(id));
    }

    @PutMapping("/{id}")
    public SongDetail update(@PathVariable String id, @RequestBody(required = false) SongUpdateRequest request,
            Authentication authentication, HttpServletRequest httpRequest) {
        if (request == null) {
            throw AppException.badRequest("INVALID_SONG_UPDATE");
        }
        SongEntity song = findSong(id);
        List<String> changedFields = new ArrayList<>();

        if (request.songName() != null) {
            String songName = request.songName().trim();
            if (songName.isEmpty() || songName.length() > AdminControllerSupport.MAX_SONG_TITLE_LENGTH) {
                throw AppException.badRequest("INVALID_SONG_UPDATE");
            }
            song.setSongName(songName);
            changedFields.add("songName");
        }
        if (request.lyrics() != null) {
            String lyrics = request.lyrics().trim();
            if (lyrics.isEmpty() || lyrics.length() > AdminControllerSupport.MAX_SONG_LYRICS_LENGTH) {
                throw AppException.badRequest("INVALID_SONG_UPDATE");
            }
            song.setLyrics(lyrics);
            changedFields.add("lyrics");
        }
        if (request.status() != null) {
            song.setStatus(parseRequiredStatus(request.status()));
            changedFields.add("status");
        }
        if (changedFields.isEmpty()) {
            throw AppException.badRequest("INVALID_SONG_UPDATE");
        }

        // Persist first: the Cloudinary destroy is irreversible, so the database must
        // never be left pointing at an asset that was already deleted for a failed
        // update.
        SongEntity saved = songRepository.save(song);
        songCatalog.refresh();
        boolean vocalDeleted = false;
        if (saved.getStatus() == SongStatus.ARCHIVED && saved.getVocalUrl() != null) {
            vocalDeleted = deleteVocalAsset(saved);
            if (vocalDeleted) {
                saved = songRepository.save(saved);
            }
        }
        auditLogger.event("song.update", AdminControllerSupport.actorName(authentication),
                clientIpResolver.resolve(httpRequest),
                "songId=" + id + " fields=" + String.join(",", changedFields) + " vocalDeleted=" + vocalDeleted);
        return toDetail(saved, pitchContourRepository.findSampleCountBySongId(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> archive(@PathVariable String id, Authentication authentication,
            HttpServletRequest httpRequest) {
        SongEntity song = findSong(id);
        boolean statusChanged = false;
        if (song.getStatus() != SongStatus.ARCHIVED) {
            song.setStatus(SongStatus.ARCHIVED);
            song = songRepository.save(song);
            songCatalog.refresh();
            statusChanged = true;
        }
        // Retry the asset cleanup on every call, so a previous Cloudinary failure or
        // crash does not leave an archived song pointing at an orphaned vocal file.
        boolean vocalDeleted = false;
        if (song.getVocalUrl() != null) {
            vocalDeleted = deleteVocalAsset(song);
            if (vocalDeleted) {
                songRepository.save(song);
            }
        }
        if (statusChanged || vocalDeleted) {
            auditLogger.event("song.archive", AdminControllerSupport.actorName(authentication),
                    clientIpResolver.resolve(httpRequest),
                    "songId=" + id + " vocalDeleted=" + vocalDeleted);
        }
        return ResponseEntity.noContent().build();
    }

    private SongEntity findSong(String id) {
        return songRepository.findById(id).orElseThrow(() -> AppException.notFound("SONG_NOT_FOUND"));
    }

    private boolean deleteVocalAsset(SongEntity song) {
        if (song.getVocalUrl() == null) {
            return false;
        }
        boolean deleted = cloudinaryMediaService.deleteByUrl(song.getVocalUrl());
        if (deleted) {
            song.setVocalUrl(null);
        }
        return deleted;
    }

    private Map<String, Integer> sampleCounts(List<SongEntity> songs) {
        if (songs.isEmpty()) {
            return Map.of();
        }
        List<String> songIds = songs.stream().map(SongEntity::getId).toList();
        return pitchContourRepository.findSampleCountsBySongIdIn(songIds).stream()
                .collect(Collectors.toMap(PitchContourRepository.SampleCountView::getSongId,
                        PitchContourRepository.SampleCountView::getSampleCount));
    }

    private SongSummary toSummary(SongEntity song, Integer sampleCount) {
        return new SongSummary(song.getId(), song.getSongName(), song.getListenDuration(),
                song.getTotalDuration(), song.getStatus().name(), sampleCount, song.getCreatedAt(),
                song.getUpdatedAt());
    }

    private SongDetail toDetail(SongEntity song, Integer sampleCount) {
        return new SongDetail(song.getId(), song.getSongName(), song.getVideoUrl(), song.getVocalUrl(),
                song.getListenDuration(), song.getTotalDuration(), song.getLyrics(), song.getStatus().name(),
                sampleCount, song.getCreatedBy(), song.getCreatedAt(), song.getUpdatedAt());
    }

    private SongStatus parseOptionalStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        return parseRequiredStatus(status);
    }

    private SongStatus parseRequiredStatus(String status) {
        try {
            return SongStatus.valueOf(status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw AppException.badRequest("INVALID_STATUS");
        }
    }
}
