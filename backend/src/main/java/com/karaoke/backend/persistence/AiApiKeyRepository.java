package com.karaoke.backend.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiApiKeyRepository extends JpaRepository<AiApiKeyEntity, Long> {

    List<AiApiKeyEntity> findAllByOrderByPriorityAscIdAsc();

    List<AiApiKeyEntity> findByActiveTrueOrderByPriorityAscIdAsc();

    boolean existsByKeyFingerprint(String keyFingerprint);
}
