package com.karaoke.backend.service;

import com.karaoke.backend.model.GameState;
import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.User;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomService {
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    public Room createRoom(String roomName) {
        String roomId = UUID.randomUUID().toString().substring(0, 8);

        Room room = new Room();
        room.setRoomId(roomId);
        room.setRoomName(roomName);
        room.setGameState(GameState.LOBBY);

        rooms.put(roomId, room);

        System.out.println("Đã tạo phòng: " + roomId);
        return room;
    }

    public Room joinRoom(String roomId, String userName) {
        Room room = rooms.get(roomId);
        if(room == null){
            System.out.println("Sai id phòng hoặc phòng không tồn tại ! ");
            return null;
        }
        User user = new User(UUID.randomUUID().toString().substring(0, 8), userName, 0);
        room.addUser(user);
        return room;
    }

    public Room getRoom(String roomId) {
        return rooms.get(roomId);
    }

}