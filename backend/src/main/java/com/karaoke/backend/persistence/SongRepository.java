package com.karaoke.backend.persistence;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface SongRepository extends JpaRepository<SongEntity, String> {

    List<SongEntity> findByStatusOrderByCreatedAtAsc(SongStatus status);

    long countByStatus(SongStatus status);

    @Query("select s.id from SongEntity s")
    List<String> findAllIds();

    Page<SongEntity> findByStatus(SongStatus status, Pageable pageable);

    Page<SongEntity> findBySongNameContainingIgnoreCase(String songName, Pageable pageable);

    Page<SongEntity> findByStatusAndSongNameContainingIgnoreCase(SongStatus status, String songName, Pageable pageable);
}
