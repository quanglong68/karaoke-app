package com.karaoke.backend.controller;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.Song;
import com.karaoke.backend.service.AuditLogger;
import com.karaoke.backend.service.ClientIpResolver;
import com.karaoke.backend.service.RateLimitService;
import com.karaoke.backend.service.SmartSongDraftService;
import com.karaoke.backend.service.SmartSongDraftService.DraftAnalyzeResponse;
import com.karaoke.backend.service.SmartSongDraftService.DraftMedia;
import com.karaoke.backend.service.SmartSongDraftService.DraftSourceResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/song-drafts")
public class AdminSongDraftController {

    private static final int DRAFT_SOURCE_LIMIT = 12;
    private static final int DRAFT_ANALYZE_LIMIT = 24;
    private static final int DRAFT_COMMIT_LIMIT = 12;
    private static final int DRAFT_CANCEL_LIMIT = 30;
    private static final long WINDOW_MILLIS = 10 * 60 * 1000L;

    public record YoutubeDraftRequest(String url, String requestId) {
    }

    public record CommitDraftRequest(String title, String lyrics, String requestId) {
    }

    private final SmartSongDraftService draftService;
    private final RateLimitService rateLimitService;
    private final AuditLogger auditLogger;
    private final ClientIpResolver clientIpResolver;

    public AdminSongDraftController(
            SmartSongDraftService draftService,
            RateLimitService rateLimitService,
            AuditLogger auditLogger,
            ClientIpResolver clientIpResolver) {
        this.draftService = draftService;
        this.rateLimitService = rateLimitService;
        this.auditLogger = auditLogger;
        this.clientIpResolver = clientIpResolver;
    }

    @PostMapping("/youtube")
    public DraftSourceResponse createFromYoutube(
            @RequestBody(required = false) YoutubeDraftRequest req,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        if (req == null) {
            throw AppException.badRequest("INVALID_YOUTUBE_URL");
        }
        String actor = AdminControllerSupport.actorName(authentication);
        enforceRateLimit("draft-source:" + actor, DRAFT_SOURCE_LIMIT);
        DraftSourceResponse response = draftService.createYoutubeDraft(req.url(), req.requestId());
        auditLogger.event("song_draft.youtube", actor, clientIpResolver.resolve(httpRequest),
                "draftId=" + response.draftId());
        return response;
    }

    @PostMapping("/upload-source")
    public DraftSourceResponse createFromUpload(
            @RequestParam("sourceVideo") MultipartFile sourceVideo,
            @RequestParam(value = "requestId", required = false) String requestId,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        String actor = AdminControllerSupport.actorName(authentication);
        enforceRateLimit("draft-source:" + actor, DRAFT_SOURCE_LIMIT);
        DraftSourceResponse response = draftService.createUploadDraft(sourceVideo, requestId);
        auditLogger.event("song_draft.upload", actor, clientIpResolver.resolve(httpRequest),
                "draftId=" + response.draftId());
        return response;
    }

    @PostMapping("/{draftId}/analyze")
    public DraftAnalyzeResponse analyze(
            @PathVariable String draftId,
            @RequestParam("listenStart") double listenStart,
            @RequestParam("listenEnd") double listenEnd,
            @RequestParam("singStart") double singStart,
            @RequestParam("singEnd") double singEnd,
            @RequestParam(value = "titleHint", required = false) String titleHint,
            @RequestParam(value = "vocalOverrideFile", required = false) MultipartFile vocalOverrideFile,
            @RequestParam(value = "requestId", required = false) String requestId,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        String actor = AdminControllerSupport.actorName(authentication);
        enforceRateLimit("draft-analyze:" + actor, DRAFT_ANALYZE_LIMIT);
        DraftAnalyzeResponse response = draftService.analyzeDraft(
                draftId, listenStart, listenEnd, singStart, singEnd, titleHint, vocalOverrideFile, requestId);
        auditLogger.event("song_draft.analyze", actor, clientIpResolver.resolve(httpRequest),
                "draftId=" + draftId + " samples=" + response.pitchSampleCount() + " source=" + response.lyricsSource());
        return response;
    }

    @GetMapping("/{draftId}/media/{kind}")
    public ResponseEntity<Resource> streamDraftMedia(
            @PathVariable String draftId,
            @PathVariable String kind) {
        DraftMedia media = draftService.getDraftMedia(draftId, kind);
        FileSystemResource resource = new FileSystemResource(media.path());
        return ResponseEntity.ok()
                .contentType(media.mediaType())
                .cacheControl(CacheControl.noStore())
                .body(resource);
    }

    @PostMapping("/{draftId}/commit")
    public Map<String, Object> commit(
            @PathVariable String draftId,
            @RequestBody(required = false) CommitDraftRequest req,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        if (req == null) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        String actor = AdminControllerSupport.actorName(authentication);
        enforceRateLimit("draft-commit:" + actor, DRAFT_COMMIT_LIMIT);
        Song saved = draftService.commitDraft(draftId, req.title(), req.lyrics(), req.requestId(), actor);
        auditLogger.event("song.upload.success", actor, clientIpResolver.resolve(httpRequest),
                "songId=" + saved.getId() + " mode=smart_draft");
        return Map.of("id", saved.getId(), "title", saved.getSongName());
    }

    @PostMapping("/cancel")
    public ResponseEntity<Void> cancel(
            @RequestParam(value = "requestId", required = false) String requestId,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        String actor = AdminControllerSupport.actorName(authentication);
        enforceRateLimit("draft-cancel:" + actor, DRAFT_CANCEL_LIMIT);
        draftService.cancelOperation(requestId);
        auditLogger.event("song_draft.cancel", actor, clientIpResolver.resolve(httpRequest),
                "requestId=" + requestId);
        return ResponseEntity.accepted().build();
    }

    @DeleteMapping("/{draftId}")
    public ResponseEntity<Void> discard(
            @PathVariable String draftId,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        draftService.deleteDraft(draftId);
        auditLogger.event("song_draft.delete", AdminControllerSupport.actorName(authentication),
                clientIpResolver.resolve(httpRequest), "draftId=" + draftId);
        return ResponseEntity.noContent().build();
    }

    private void enforceRateLimit(String key, int limit) {
        RateLimitService.Decision decision = rateLimitService.check(key, limit, WINDOW_MILLIS);
        if (!decision.allowed()) {
            throw AppException.tooManyRequests("RATE_LIMITED", decision.retryAfterSeconds());
        }
    }
}
