package com.karaoke.backend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.HashMap;
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
    private User currentPerformanceUser;

    private List<User> users = new CopyOnWriteArrayList<>();

    // Thùng phiếu (Lưu ID -> Số lần bấm)
    private Map<String, Integer> buzzerCount = new ConcurrentHashMap<>();

    //thùng phiếu cho giai đoạn vote, true là thích, false là không thích(hát dở)
    private Map<String, Boolean> votes = new ConcurrentHashMap<>();

    // THÊM DÒNG NÀY: Cuốn sổ bạ (Lưu ID -> Tên người dùng)
    private Map<String, String> userNamesMap = new ConcurrentHashMap<>();

    public void addUser(User user){
        users.add(user);
    }

    public User getUserById(String userId) {
        return users.stream()
                .filter(u -> u.getUserId().equals(userId))
                .findFirst()
                .orElse(null);
    }
}
