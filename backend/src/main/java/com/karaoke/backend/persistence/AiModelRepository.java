package com.karaoke.backend.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiModelRepository extends JpaRepository<AiModelEntity, Long> {

    List<AiModelEntity> findAllByOrderByPriorityAscIdAsc();

    List<AiModelEntity> findByActiveTrueOrderByPriorityAscIdAsc();

    boolean existsByModelNameIgnoreCase(String modelName);
}
