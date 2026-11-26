package com.karaoke.backend.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;

@Entity
@Table(name = "songs")
@Getter
@Setter
@NoArgsConstructor
public class SongEntity {

    @Id
    @Column(length = 16)
    private String id;

    @Column(name = "song_name", nullable = false, length = 120)
    private String songName;

    @Column(name = "video_url", nullable = false, length = 512)
    private String videoUrl;

    @Column(name = "vocal_url", length = 512)
    private String vocalUrl;

    @Column(name = "listen_duration", nullable = false)
    private double listenDuration;

    @Column(name = "total_duration", nullable = false)
    private double totalDuration;

    @Column(nullable = false, columnDefinition = "text")
    private String lyrics;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private SongStatus status;

    @Column(name = "created_by", length = 64)
    private String createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
