package com.karaoke.backend.controller;

import com.karaoke.backend.model.Room;
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
    public Room createRoom(@RequestParam String roomName){
        return roomService.createRoom(roomName);
    }

    @PostMapping("/join")
    public Room joinRoom(@RequestParam String roomId, @RequestParam String userName){
        return roomService.joinRoom(roomId, userName);
    }
}
