package com.karaoke.backend.controller;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.RoomJoinResponse;
import com.karaoke.backend.model.RoomView;
import com.karaoke.backend.service.GameService;
import com.karaoke.backend.service.RateLimitService;
import com.karaoke.backend.service.RoomService;
import com.karaoke.backend.service.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {
    private static final int CREATE_LIMIT = 10;
    private static final int JOIN_LIMIT = 30;
    private static final long WINDOW_MILLIS = 60_000L;

    private final RoomService roomService;
    private final GameService gameService;
    private final RateLimitService rateLimitService;

    public RoomController(RoomService roomService, GameService gameService, RateLimitService rateLimitService) {
        this.roomService = roomService;
        this.gameService = gameService;
        this.rateLimitService = rateLimitService;
    }

    @PostMapping("/create")
    public RoomJoinResponse createRoom(
            @RequestParam String roomName,
            @RequestParam String userName,
            HttpServletRequest request) {
        enforceRateLimit(request, "create", CREATE_LIMIT);
        RoomJoinResponse response = roomService.createRoom(roomName, userName);
        gameService.lobbyPhase(response.getRoom().roomId());
        return response;
    }

    @GetMapping("/list")
    public List<RoomView> listRooms() {
        return roomService.listRooms();
    }

    @PostMapping("/join")
    public RoomJoinResponse joinRoom(
            @RequestParam String roomId,
            @RequestParam String userName,
            HttpServletRequest request) {
        enforceRateLimit(request, "join", JOIN_LIMIT);
        RoomJoinResponse response = roomService.joinRoom(roomId, userName);
        gameService.lobbyPhase(roomId);
        return response;
    }

    @PostMapping("/rejoin")
    public RoomJoinResponse rejoin(
            @RequestHeader(value = "X-Session-Token", required = false) String headerToken,
            @RequestParam(value = "sessionToken", required = false) String paramToken) {
        return roomService.rejoin(firstNonBlank(headerToken, paramToken));
    }

    @PostMapping("/leave")
    public void leaveRoom(
            @RequestHeader(value = "X-Session-Token", required = false) String headerToken,
            @RequestParam(value = "sessionToken", required = false) String paramToken) {
        SessionService.SessionInfo info = roomService.leaveByToken(firstNonBlank(headerToken, paramToken));
        gameService.notifyRoomUpdate(info.roomId());
    }

    private String firstNonBlank(String first, String second) {
        if (first != null && !first.isBlank()) {
            return first;
        }
        return second == null ? null : second.trim();
    }

    private void enforceRateLimit(HttpServletRequest request, String action, int limit) {
        String key = action + ":" + clientIp(request);
        if (!rateLimitService.allow(key, limit, WINDOW_MILLIS)) {
            throw AppException.tooManyRequests("RATE_LIMITED");
        }
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
