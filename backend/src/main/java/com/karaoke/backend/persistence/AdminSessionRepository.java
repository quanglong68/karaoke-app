package com.karaoke.backend.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;

public interface AdminSessionRepository extends JpaRepository<AdminSessionEntity, String> {

    long deleteByExpiresAtBefore(OffsetDateTime cutoff);

    @Modifying
    @Query("delete from AdminSessionEntity s where s.admin.id = :adminId and s.tokenHash <> :keepTokenHash")
    int deleteByAdminIdAndTokenHashNot(@Param("adminId") Long adminId, @Param("keepTokenHash") String keepTokenHash);

    long deleteByAdmin_Id(Long adminId);
}
