package com.karaoke.backend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@AllArgsConstructor
@NoArgsConstructor
@Data
public class Song {
    private String id;
    private String songName;
    private String videoUrl;
    private double listenDuration;
    private double totalDuration;
    private String originalLyrics;
    private List<Double> originalPitchContour;
}
