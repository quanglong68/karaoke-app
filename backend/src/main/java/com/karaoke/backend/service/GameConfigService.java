package com.karaoke.backend.service;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.GameSettings;
import com.karaoke.backend.persistence.GameConfigEntity;
import com.karaoke.backend.persistence.GameConfigRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Single source of truth for the editable game rules. Rooms take a snapshot of
 * {@link #current()} when they are created, so a save here only affects new rooms.
 */
@Service
public class GameConfigService {
    private static final Logger log = LoggerFactory.getLogger(GameConfigService.class);
    private static final int CONFIG_ID = 1;
    private static final GameSettings DEFAULTS = GameSettings.defaults();
    private static final String INVALID = "INVALID_GAME_CONFIG";

    public record Limit(double min, double max, double step) {
    }

    private static final Map<String, Limit> LIMITS = buildLimits();

    private final GameConfigRepository repository;

    public GameConfigService(GameConfigRepository repository) {
        this.repository = repository;
    }

    public GameSettings defaults() {
        return DEFAULTS;
    }

    public Map<String, Limit> limits() {
        return LIMITS;
    }

    public GameSettings current() {
        return repository.findById(CONFIG_ID)
                .map(entity -> {
                    GameSettings settings = toSettings(entity);
                    if (!isValid(settings)) {
                        // A hand-edited or partially migrated row must not break new rooms.
                        log.warn("Stored game config is out of range, using defaults instead");
                        return DEFAULTS;
                    }
                    return settings;
                })
                .orElse(DEFAULTS);
    }

    @Transactional
    public GameSettings update(GameSettings candidate, String actor) {
        validate(candidate);
        GameConfigEntity entity = repository.findById(CONFIG_ID).orElseGet(() -> {
            GameConfigEntity created = new GameConfigEntity();
            created.setId(CONFIG_ID);
            return created;
        });
        apply(entity, candidate, actor);
        repository.save(entity);
        return candidate;
    }

    @Transactional
    public GameSettings reset(String actor) {
        return update(DEFAULTS, actor);
    }

    private static final int MIN_PERFORMANCE_BUFFER_SECONDS = 5;

    public void validate(GameSettings settings) {
        if (settings == null) {
            throw AppException.badRequest(INVALID);
        }
        checkRange(settings.maxRounds(), "maxRounds");
        checkRange(settings.maxPlayers(), "maxPlayers");
        checkRange(settings.buzzerSeconds(), "buzzerSeconds");
        checkRange(settings.countdownSeconds(), "countdownSeconds");
        checkRange(settings.performanceSeconds(), "performanceSeconds");
        checkInt(settings.minPerformanceSeconds(), (int) LIMITS.get("minPerformanceSeconds").min(),
                settings.performanceSeconds() - MIN_PERFORMANCE_BUFFER_SECONDS);
        checkRange(settings.evaluationSeconds(), "evaluationSeconds");
        checkRange(settings.nextPhaseDelaySeconds(), "nextPhaseDelaySeconds");
        checkRange(settings.endGameDelaySeconds(), "endGameDelaySeconds");
        checkRange(settings.successScore(), "successScore");
        checkDoubleRange(settings.lyricsWeight(), "lyricsWeight");
    }

    /** Human readable diff for the audit log; never contains secrets. */
    public String describeChanges(GameSettings before, GameSettings after) {
        StringBuilder changes = new StringBuilder();
        appendChange(changes, "maxRounds", before.maxRounds(), after.maxRounds());
        appendChange(changes, "maxPlayers", before.maxPlayers(), after.maxPlayers());
        appendChange(changes, "buzzerSeconds", before.buzzerSeconds(), after.buzzerSeconds());
        appendChange(changes, "countdownSeconds", before.countdownSeconds(), after.countdownSeconds());
        appendChange(changes, "performanceSeconds", before.performanceSeconds(), after.performanceSeconds());
        appendChange(changes, "minPerformanceSeconds", before.minPerformanceSeconds(), after.minPerformanceSeconds());
        appendChange(changes, "evaluationSeconds", before.evaluationSeconds(), after.evaluationSeconds());
        appendChange(changes, "nextPhaseDelaySeconds", before.nextPhaseDelaySeconds(), after.nextPhaseDelaySeconds());
        appendChange(changes, "endGameDelaySeconds", before.endGameDelaySeconds(), after.endGameDelaySeconds());
        appendChange(changes, "successScore", before.successScore(), after.successScore());
        if (Double.compare(before.lyricsWeight(), after.lyricsWeight()) != 0) {
            appendChange(changes, "lyricsWeight", before.lyricsWeight(), after.lyricsWeight());
        }
        return changes.length() == 0 ? "no changes" : changes.toString();
    }

    private void checkRange(int value, String key) {
        Limit limit = LIMITS.get(key);
        checkInt(value, (int) limit.min(), (int) limit.max());
    }

    private void checkDoubleRange(double value, String key) {
        Limit limit = LIMITS.get(key);
        if (!Double.isFinite(value) || value < limit.min() || value > limit.max()) {
            throw AppException.badRequest(INVALID);
        }
    }

    private void checkInt(int value, int min, int max) {
        if (value < min || value > max) {
            throw AppException.badRequest(INVALID);
        }
    }

    private boolean isValid(GameSettings settings) {
        try {
            validate(settings);
            return true;
        } catch (AppException exception) {
            return false;
        }
    }

    private GameSettings toSettings(GameConfigEntity entity) {
        return new GameSettings(entity.getMaxRounds(), entity.getMaxPlayers(), entity.getBuzzerSeconds(),
                entity.getCountdownSeconds(), entity.getPerformanceSeconds(), entity.getMinPerformanceSeconds(),
                entity.getEvaluationSeconds(), entity.getNextPhaseDelaySeconds(), entity.getEndGameDelaySeconds(),
                entity.getSuccessScore(), entity.getLyricsWeight());
    }

    private void apply(GameConfigEntity entity, GameSettings settings, String actor) {
        entity.setMaxRounds(settings.maxRounds());
        entity.setMaxPlayers(settings.maxPlayers());
        entity.setBuzzerSeconds(settings.buzzerSeconds());
        entity.setCountdownSeconds(settings.countdownSeconds());
        entity.setPerformanceSeconds(settings.performanceSeconds());
        entity.setMinPerformanceSeconds(settings.minPerformanceSeconds());
        entity.setEvaluationSeconds(settings.evaluationSeconds());
        entity.setNextPhaseDelaySeconds(settings.nextPhaseDelaySeconds());
        entity.setEndGameDelaySeconds(settings.endGameDelaySeconds());
        entity.setSuccessScore(settings.successScore());
        entity.setLyricsWeight(settings.lyricsWeight());
        entity.setUpdatedAt(OffsetDateTime.now());
        entity.setUpdatedBy(actor == null ? "system" : actor);
    }

    private void appendChange(StringBuilder target, String field, Object before, Object after) {
        if (before.equals(after)) {
            return;
        }
        if (target.length() > 0) {
            target.append(", ");
        }
        target.append(field).append(' ').append(before).append("->").append(after);
    }

    private static Map<String, Limit> buildLimits() {
        Map<String, Limit> limits = new LinkedHashMap<>();
        limits.put("maxRounds", new Limit(1, 10, 1));
        limits.put("maxPlayers", new Limit(2, 8, 1));
        limits.put("buzzerSeconds", new Limit(3, 10, 1));
        limits.put("countdownSeconds", new Limit(2, 5, 1));
        limits.put("performanceSeconds", new Limit(30, 180, 5));
        limits.put("minPerformanceSeconds", new Limit(5, 175, 1));
        limits.put("evaluationSeconds", new Limit(10, 30, 1));
        limits.put("nextPhaseDelaySeconds", new Limit(1, 10, 1));
        limits.put("endGameDelaySeconds", new Limit(3, 15, 1));
        limits.put("successScore", new Limit(50, 100, 1));
        limits.put("lyricsWeight", new Limit(0.1, 0.9, 0.05));
        return limits;
    }
}
