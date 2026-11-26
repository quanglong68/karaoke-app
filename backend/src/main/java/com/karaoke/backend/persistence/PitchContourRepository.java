package com.karaoke.backend.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface PitchContourRepository extends JpaRepository<PitchContourEntity, String> {

    interface SampleCountView {
        String getSongId();

        Integer getSampleCount();
    }

    @Query("select p.songId as songId, p.sampleCount as sampleCount from PitchContourEntity p where p.songId in :songIds")
    List<SampleCountView> findSampleCountsBySongIdIn(@Param("songIds") Collection<String> songIds);

    @Query("select p.sampleCount from PitchContourEntity p where p.songId = :songId")
    Integer findSampleCountBySongId(@Param("songId") String songId);
}
