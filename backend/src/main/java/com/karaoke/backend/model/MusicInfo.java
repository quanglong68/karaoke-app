package com.karaoke.backend.model;


import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class MusicInfo {
    private String videoId;
    private int startSeconds ;
    private int endSeconds;

    @JsonProperty("isPlaying")
    private boolean isPlaying;

}
