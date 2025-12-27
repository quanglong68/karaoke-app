package com.karaoke.backend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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

    private List<User> users = new CopyOnWriteArrayList<>();

    private Map<String, Integer> buzzerCount = new ConcurrentHashMap<>();

    public void addUser(User user){
        users.add(user);
    }

}
