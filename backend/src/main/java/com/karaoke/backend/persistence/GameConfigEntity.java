package com.karaoke.backend.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

@Entity
@Table(name = "game_config")
@Getter
@Setter
@NoArgsConstructor
public class GameConfigEntity {

    @Id
    private Integer id;

    @Column(name = "max_rounds", nullable = false)
    private int maxRounds;

    @Column(name = "max_players", nullable = false)
    private int maxPlayers;

    @Column(name = "buzzer_seconds", nullable = false)
    private int buzzerSeconds;

    @Column(name = "countdown_seconds", nullable = false)
    private int countdownSeconds;

    @Column(name = "performance_seconds", nullable = false)
    private int performanceSeconds;

    @Column(name = "min_performance_seconds", nullable = false)
    private int minPerformanceSeconds;

    @Column(name = "evaluation_seconds", nullable = false)
    private int evaluationSeconds;

    @Column(name = "next_phase_delay_seconds", nullable = false)
    private int nextPhaseDelaySeconds;

    @Column(name = "end_game_delay_seconds", nullable = false)
    private int endGameDelaySeconds;

    @Column(name = "success_score", nullable = false)
    private int successScore;

    @Column(name = "lyrics_weight", nullable = false)
    private double lyricsWeight;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "updated_by", length = 64)
    private String updatedBy;
}
