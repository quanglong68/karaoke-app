package com.karaoke.backend.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@AllArgsConstructor
@NoArgsConstructor
@Data
public class User {
    private String userId;
    private String userName;
    private int score = 0;
    @JsonProperty("isHost")
    private  boolean isHost;
    @JsonProperty("isReady")
    private  boolean isReady;
}
