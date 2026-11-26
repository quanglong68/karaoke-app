create table game_config (
    id                       int primary key,
    max_rounds               int              not null,
    max_players              int              not null,
    buzzer_seconds           int              not null,
    countdown_seconds        int              not null,
    performance_seconds      int              not null,
    min_performance_seconds  int              not null,
    evaluation_seconds       int              not null,
    next_phase_delay_seconds int              not null,
    end_game_delay_seconds   int              not null,
    success_score            int              not null,
    lyrics_weight            double precision not null,
    updated_at               timestamp with time zone not null default now(),
    updated_by               varchar(64)
);

insert into game_config (id, max_rounds, max_players, buzzer_seconds, countdown_seconds,
    performance_seconds, min_performance_seconds, evaluation_seconds, next_phase_delay_seconds,
    end_game_delay_seconds, success_score, lyrics_weight, updated_by)
values (1, 3, 5, 5, 3, 60, 15, 15, 3, 5, 70, 0.4, 'system');
