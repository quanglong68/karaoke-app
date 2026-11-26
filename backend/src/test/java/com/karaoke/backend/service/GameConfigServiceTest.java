package com.karaoke.backend.service;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.GameSettings;
import com.karaoke.backend.persistence.GameConfigEntity;
import com.karaoke.backend.persistence.GameConfigRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GameConfigServiceTest {

    private GameConfigRepository repository;
    private GameConfigService service;

    @BeforeEach
    void setUp() {
        repository = mock(GameConfigRepository.class);
        service = new GameConfigService(repository);
    }

    @Test
    void currentWithoutRowReturnsDefaults() {
        when(repository.findById(1)).thenReturn(Optional.empty());

        assertEquals(GameSettings.defaults(), service.current());
    }

    @Test
    void currentFallsBackWhenStoredRowIsOutOfRange() {
        GameConfigEntity stored = entity();
        stored.setMaxRounds(99);
        when(repository.findById(1)).thenReturn(Optional.of(stored));

        assertEquals(GameSettings.defaults(), service.current());
    }

    @Test
    void currentReturnsStoredRowWhenValid() {
        GameConfigEntity stored = entity();
        stored.setMaxRounds(5);
        stored.setPerformanceSeconds(90);
        when(repository.findById(1)).thenReturn(Optional.of(stored));

        GameSettings settings = service.current();

        assertEquals(5, settings.maxRounds());
        assertEquals(90, settings.performanceSeconds());
    }

    @Test
    void updateRejectsValuesOutsideTheLimits() {
        GameSettings invalid = withPerformance(20);

        AppException error = assertThrows(AppException.class, () -> service.update(invalid, "boss"));

        assertEquals("INVALID_GAME_CONFIG", error.getCode());
    }

    @Test
    void updateRejectsMinPerformanceTooCloseToTheMaximum() {
        GameSettings invalid = new GameSettings(3, 5, 5, 3, 60, 58, 15, 3, 5, 70, 0.4);

        AppException error = assertThrows(AppException.class, () -> service.update(invalid, "boss"));

        assertEquals("INVALID_GAME_CONFIG", error.getCode());
    }

    @Test
    void updateRejectsNonFiniteLyricsWeight() {
        GameSettings nanWeight = new GameSettings(3, 5, 5, 3, 60, 15, 15, 3, 5, 70, Double.NaN);
        GameSettings infWeight = new GameSettings(3, 5, 5, 3, 60, 15, 15, 3, 5, 70, Double.POSITIVE_INFINITY);

        assertEquals("INVALID_GAME_CONFIG",
                assertThrows(AppException.class, () -> service.update(nanWeight, "boss")).getCode());
        assertEquals("INVALID_GAME_CONFIG",
                assertThrows(AppException.class, () -> service.update(infWeight, "boss")).getCode());
    }

    @Test
    void updateSavesEveryField() {
        when(repository.findById(1)).thenReturn(Optional.empty());
        GameSettings updated = new GameSettings(4, 6, 7, 4, 90, 20, 20, 4, 8, 75, 0.6);

        service.update(updated, "boss");

        ArgumentCaptor<GameConfigEntity> captor = ArgumentCaptor.forClass(GameConfigEntity.class);
        verify(repository).save(captor.capture());
        GameConfigEntity saved = captor.getValue();
        assertEquals(1, saved.getId());
        assertEquals(4, saved.getMaxRounds());
        assertEquals(6, saved.getMaxPlayers());
        assertEquals(7, saved.getBuzzerSeconds());
        assertEquals(90, saved.getPerformanceSeconds());
        assertEquals(20, saved.getMinPerformanceSeconds());
        assertEquals(75, saved.getSuccessScore());
        assertEquals(0.6, saved.getLyricsWeight());
        assertEquals("boss", saved.getUpdatedBy());
    }

    @Test
    void resetWritesTheDefaults() {
        when(repository.findById(1)).thenReturn(Optional.of(entity()));

        GameSettings reset = service.reset("boss");

        assertEquals(GameSettings.defaults(), reset);
        verify(repository).save(any(GameConfigEntity.class));
    }

    @Test
    void limitsDescribeEveryEditableField() {
        assertTrue(service.limits().keySet().containsAll(java.util.List.of(
                "maxRounds", "maxPlayers", "buzzerSeconds", "countdownSeconds", "performanceSeconds",
                "minPerformanceSeconds", "evaluationSeconds", "nextPhaseDelaySeconds", "endGameDelaySeconds",
                "successScore", "lyricsWeight")));
    }

    private GameSettings withPerformance(int performanceSeconds) {
        return new GameSettings(3, 5, 5, 3, performanceSeconds, 10, 15, 3, 5, 70, 0.4);
    }

    private GameConfigEntity entity() {
        GameConfigEntity entity = new GameConfigEntity();
        entity.setId(1);
        entity.setMaxRounds(3);
        entity.setMaxPlayers(5);
        entity.setBuzzerSeconds(5);
        entity.setCountdownSeconds(3);
        entity.setPerformanceSeconds(60);
        entity.setMinPerformanceSeconds(15);
        entity.setEvaluationSeconds(15);
        entity.setNextPhaseDelaySeconds(3);
        entity.setEndGameDelaySeconds(5);
        entity.setSuccessScore(70);
        entity.setLyricsWeight(0.4);
        return entity;
    }
}
