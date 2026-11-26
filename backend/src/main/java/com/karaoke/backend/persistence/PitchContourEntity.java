package com.karaoke.backend.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "song_pitch_contours")
@Getter
@Setter
@NoArgsConstructor
public class PitchContourEntity {

    @Id
    @Column(name = "song_id", length = 16)
    private String songId;

    @Column(nullable = false, length = 16)
    private String encoding;

    @Column(name = "sample_count", nullable = false)
    private int sampleCount;

    @Column(name = "contour_data", nullable = false)
    private byte[] data;
}
