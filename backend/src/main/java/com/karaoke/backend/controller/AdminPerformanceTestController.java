package com.karaoke.backend.controller;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.service.AdminPerformanceTestService;
import com.karaoke.backend.service.AdminPerformanceTestService.PerformanceTestRequest;
import com.karaoke.backend.service.AdminPerformanceTestService.PerformanceTestResponse;
import com.karaoke.backend.service.AuditLogger;
import com.karaoke.backend.service.ClientIpResolver;
import com.karaoke.backend.service.RateLimitService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminPerformanceTestController {

    private static final int TEST_SCORE_LIMIT = 60;
    private static final long WINDOW_MILLIS = 10 * 60 * 1000L;

    private final AdminPerformanceTestService testService;
    private final RateLimitService rateLimitService;
    private final AuditLogger auditLogger;
    private final ClientIpResolver clientIpResolver;

    public AdminPerformanceTestController(
            AdminPerformanceTestService testService,
            RateLimitService rateLimitService,
            AuditLogger auditLogger,
            ClientIpResolver clientIpResolver) {
        this.testService = testService;
        this.rateLimitService = rateLimitService;
        this.auditLogger = auditLogger;
        this.clientIpResolver = clientIpResolver;
    }

    @PostMapping("/songs/{id}/test-score")
    public PerformanceTestResponse testSavedSong(
            @PathVariable String id,
            @RequestBody(required = false) PerformanceTestRequest req,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        String actor = AdminControllerSupport.actorName(authentication);
        enforceRateLimit(actor);
        PerformanceTestResponse res = testService.evaluateSong(id, req);
        auditLogger.event("song.test_score", actor, clientIpResolver.resolve(httpRequest),
                "songId=" + id + " final=" + res.finalScore() + " passed=" + res.passed());
        return res;
    }

    @PostMapping("/song-drafts/{draftId}/test-score")
    public PerformanceTestResponse testDraftSong(
            @PathVariable String draftId,
            @RequestBody(required = false) PerformanceTestRequest req,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        String actor = AdminControllerSupport.actorName(authentication);
        enforceRateLimit(actor);
        PerformanceTestResponse res = testService.evaluateDraft(draftId, req);
        auditLogger.event("song_draft.test_score", actor, clientIpResolver.resolve(httpRequest),
                "draftId=" + draftId + " final=" + res.finalScore() + " passed=" + res.passed());
        return res;
    }

    private void enforceRateLimit(String actor) {
        RateLimitService.Decision decision = rateLimitService.check(
                "perf-test:" + actor, TEST_SCORE_LIMIT, WINDOW_MILLIS);
        if (!decision.allowed()) {
            throw AppException.tooManyRequests("RATE_LIMITED", decision.retryAfterSeconds());
        }
    }
}
