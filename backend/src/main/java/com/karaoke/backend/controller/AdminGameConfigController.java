package com.karaoke.backend.controller;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.GameSettings;
import com.karaoke.backend.service.AuditLogger;
import com.karaoke.backend.service.ClientIpResolver;
import com.karaoke.backend.service.GameConfigService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/game-config")
public class AdminGameConfigController {

    public record GameConfigResponse(GameSettings settings, GameSettings defaults,
            Map<String, GameConfigService.Limit> limits) {
    }

    public record GameConfigRequest(Integer maxRounds, Integer maxPlayers, Integer buzzerSeconds,
            Integer countdownSeconds, Integer performanceSeconds, Integer minPerformanceSeconds,
            Integer evaluationSeconds, Integer nextPhaseDelaySeconds, Integer endGameDelaySeconds,
            Integer successScore, Double lyricsWeight) {
    }

    private final GameConfigService gameConfigService;
    private final AuditLogger auditLogger;
    private final ClientIpResolver clientIpResolver;

    public AdminGameConfigController(GameConfigService gameConfigService, AuditLogger auditLogger,
            ClientIpResolver clientIpResolver) {
        this.gameConfigService = gameConfigService;
        this.auditLogger = auditLogger;
        this.clientIpResolver = clientIpResolver;
    }

    @GetMapping
    public GameConfigResponse get() {
        return new GameConfigResponse(gameConfigService.current(), gameConfigService.defaults(),
                gameConfigService.limits());
    }

    @PutMapping
    public GameSettings update(@RequestBody(required = false) GameConfigRequest request,
            Authentication authentication, HttpServletRequest httpRequest) {
        GameSettings before = gameConfigService.current();
        String actor = AdminControllerSupport.actorName(authentication);
        GameSettings saved = gameConfigService.update(toSettings(request), actor);
        auditLogger.event("game_config.update", actor, clientIpResolver.resolve(httpRequest),
                gameConfigService.describeChanges(before, saved));
        return saved;
    }

    @PostMapping("/reset")
    public GameSettings reset(Authentication authentication, HttpServletRequest httpRequest) {
        GameSettings before = gameConfigService.current();
        String actor = AdminControllerSupport.actorName(authentication);
        GameSettings saved = gameConfigService.reset(actor);
        auditLogger.event("game_config.reset", actor, clientIpResolver.resolve(httpRequest),
                gameConfigService.describeChanges(before, saved));
        return saved;
    }

    private GameSettings toSettings(GameConfigRequest request) {
        if (request == null) {
            throw AppException.badRequest("INVALID_GAME_CONFIG");
        }
        return new GameSettings(
                require(request.maxRounds()),
                require(request.maxPlayers()),
                require(request.buzzerSeconds()),
                require(request.countdownSeconds()),
                require(request.performanceSeconds()),
                require(request.minPerformanceSeconds()),
                require(request.evaluationSeconds()),
                require(request.nextPhaseDelaySeconds()),
                require(request.endGameDelaySeconds()),
                require(request.successScore()),
                require(request.lyricsWeight()));
    }

    private int require(Integer value) {
        if (value == null) {
            throw AppException.badRequest("INVALID_GAME_CONFIG");
        }
        return value;
    }

    private double require(Double value) {
        if (value == null) {
            throw AppException.badRequest("INVALID_GAME_CONFIG");
        }
        return value;
    }
}
