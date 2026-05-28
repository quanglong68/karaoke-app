package com.karaoke.backend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@AllArgsConstructor
@NoArgsConstructor
@Data
public class Room {
    private String roomId;
    private String roomName;
    private GameState gameState;

    private String currentVideoId;
    private User currentPerformanceUser;
    private Song upcomingSong;

    private int currentRound = 0;

    private List<User> users = new CopyOnWriteArrayList<>();

    private Song currentSong;

    private Set<String> playedSongIds = ConcurrentHashMap.newKeySet();
    private Map<String, Integer> buzzerCount = new ConcurrentHashMap<>();
    private Map<String, Boolean> votes = new ConcurrentHashMap<>();
    private Map<String, String> userNamesMap = new ConcurrentHashMap<>();

    public void addUser(User user) {
        users.add(user);
    }

    public User getUserById(String userId) {
        return users.stream()
                .filter(u -> u.getUserId().equals(userId))
                .findFirst()
                .orElse(null);
    }
}
