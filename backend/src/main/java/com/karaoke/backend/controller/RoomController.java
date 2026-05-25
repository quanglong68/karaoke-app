package com.karaoke.backend.controller;

import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.RoomJoinResponse;
import com.karaoke.backend.model.User;
import com.karaoke.backend.service.RoomService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rooms")
@CrossOrigin(origins = "*")
public class RoomController {
    @Autowired
    private RoomService roomService;

    @PostMapping("/create")
    public RoomJoinResponse createRoom(@RequestParam String roomName, @RequestParam String userName) {
        return roomService.createRoom(roomName, userName);
    }

    @PostMapping("/join")
    public RoomJoinResponse joinRoom(@RequestParam String roomId, @RequestParam String userName) {
        User user = roomService.joinRoom(roomId, userName);
        Room room = roomService.getRoom(roomId);
        return new RoomJoinResponse(room, user);
    }
}
