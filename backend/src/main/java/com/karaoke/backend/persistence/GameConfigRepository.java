package com.karaoke.backend.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

public interface GameConfigRepository extends JpaRepository<GameConfigEntity, Integer> {
}
