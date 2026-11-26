package com.karaoke.backend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class RoomJoinResponse {
    private RoomView room;
    private User user;
    private String sessionToken;
    /** Rules captured by this room; the client uses them for countdowns and limits. */
    private GameSettings settings;
}
