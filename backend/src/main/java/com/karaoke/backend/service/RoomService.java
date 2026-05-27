package com.karaoke.backend.service;

import com.karaoke.backend.model.GameState;
import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.RoomJoinResponse;
import com.karaoke.backend.model.User;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Collection;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomService {
    private static final int MAX_PLAYERS = 5;
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    public RoomJoinResponse createRoom(String roomName, String userName) {
        String roomId = UUID.randomUUID().toString().substring(0, 8);
        Room room = new Room();
        room.setRoomId(roomId);
        room.setRoomName(roomName);
        room.setGameState(GameState.LOBBY);

        rooms.put(roomId, room);

        User user = new User(UUID.randomUUID().toString().substring(0, 8), userName, 0, true, true);
        room.addUser(user);
        System.out.println("Đã tạo phòng: " + roomId);
        return new RoomJoinResponse(room, user);
    }

    public User joinRoom(String roomId, String userName) {
        Room room = rooms.get(roomId);
        if (room == null) {
            throw new IllegalArgumentException("ROOM_NOT_FOUND");
        }
        if (room.getGameState() != GameState.LOBBY) {
            throw new IllegalStateException("ROOM_PLAYING");
        }
        if (room.getUsers().size() >= MAX_PLAYERS) {
            throw new IllegalStateException("ROOM_FULL");
        }
        User user = new User(UUID.randomUUID().toString().substring(0, 8), userName, 0, false, false);
        room.addUser(user);
        return user;
    }

    public Room getRoom(String roomId) {
        return rooms.get(roomId);
    }

    public Collection<Room> listRooms() {
        return rooms.values();
    }

    public void leaveRoom(String roomId, String userId) {
        Room room = rooms.get(roomId);
        if (room == null) {
            return;
        }
        User leavingUser = room.getUserById(userId);
        room.getUsers().removeIf(user -> user.getUserId().equals(userId));

        if (room.getUsers().isEmpty()) {
            rooms.remove(roomId);
            return;
        }

        if (leavingUser != null && leavingUser.isHost()) {
            User newHost = room.getUsers().get(0);
            newHost.setHost(true);
            newHost.setReady(true);
        }
    }

    public Room renameUser(String roomId, String userId, String newName) {
        Room room = rooms.get(roomId);
        if (room == null) {
            return null;
        }
        User user = room.getUserById(userId);
        if (user != null) {
            user.setUserName(newName);
        }
        return room;
    }

}