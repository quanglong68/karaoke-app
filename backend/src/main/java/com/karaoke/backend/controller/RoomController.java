package com.karaoke.backend.controller;

import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.RoomJoinResponse;
import com.karaoke.backend.model.User;
import com.karaoke.backend.service.RoomService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;

import java.util.Collection;

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

    @GetMapping("/list")
    public Collection<Room> listRooms() {
        return roomService.listRooms();
    }

    @PostMapping("/join")
    public RoomJoinResponse joinRoom(@RequestParam String roomId, @RequestParam String userName) {
        try {
            User user = roomService.joinRoom(roomId, userName);
            Room room = roomService.getRoom(roomId);
            return new RoomJoinResponse(room, user);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND");
        } catch (IllegalStateException ex) {
            String reason = ex.getMessage();
            if ("ROOM_PLAYING".equals(reason)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "ROOM_PLAYING");
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT, "ROOM_FULL");
        }
    }

    @PostMapping("/leave")
    public void leaveRoom(@RequestParam String roomId, @RequestParam String userId) {
        roomService.leaveRoom(roomId, userId);
    }
}
