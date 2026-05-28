package com.karaoke.backend.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class MusicInfo {
    private String videoUrl;
    private double startSeconds;
    private long serverStartTime;
    @JsonProperty("isPlaying")
    private boolean isPlaying;
    private String nextVideoUrl;
    private String songId;
    private String nextSongId;
}
