package com.karaoke.backend.controller;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.RoomJoinResponse;
import com.karaoke.backend.model.RoomView;
import com.karaoke.backend.service.ClientIpResolver;
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
    private static final int REJOIN_LIMIT = 30;
    private static final int LEAVE_LIMIT = 30;
    private static final int LIST_LIMIT = 120;
    private static final long WINDOW_MILLIS = 60_000L;

    public record CreateRoomRequest(String roomName, String userName) {
    }

    public record JoinRoomRequest(String roomId, String userName) {
    }

    private final RoomService roomService;
    private final GameService gameService;
    private final RateLimitService rateLimitService;
    private final ClientIpResolver clientIpResolver;

    public RoomController(RoomService roomService, GameService gameService, RateLimitService rateLimitService,
            ClientIpResolver clientIpResolver) {
        this.roomService = roomService;
        this.gameService = gameService;
        this.rateLimitService = rateLimitService;
        this.clientIpResolver = clientIpResolver;
    }

    @PostMapping("/create")
    public RoomJoinResponse createRoom(@RequestBody(required = false) CreateRoomRequest body,
            HttpServletRequest request) {
        enforceRateLimit(request, "create", CREATE_LIMIT);
        if (body == null) {
            throw AppException.badRequest("INVALID_ROOM_REQUEST");
        }
        RoomJoinResponse response = roomService.createRoom(body.roomName(), body.userName());
        gameService.lobbyPhase(response.getRoom().roomId());
        return response;
    }

    @GetMapping("/list")
    public List<RoomView> listRooms(HttpServletRequest request) {
        enforceRateLimit(request, "list", LIST_LIMIT);
        return roomService.listRooms();
    }

    @PostMapping("/join")
    public RoomJoinResponse joinRoom(@RequestBody(required = false) JoinRoomRequest body,
            HttpServletRequest request) {
        enforceRateLimit(request, "join", JOIN_LIMIT);
        if (body == null) {
            throw AppException.badRequest("INVALID_ROOM_REQUEST");
        }
        RoomJoinResponse response = roomService.joinRoom(body.roomId(), body.userName());
        gameService.lobbyPhase(body.roomId());
        return response;
    }

    @PostMapping("/rejoin")
    public RoomJoinResponse rejoin(
            @RequestHeader(value = "X-Session-Token", required = false) String sessionToken,
            HttpServletRequest request) {
        enforceRateLimit(request, "rejoin", REJOIN_LIMIT);
        return roomService.rejoin(sessionToken);
    }

    @PostMapping("/leave")
    public void leaveRoom(
            @RequestHeader(value = "X-Session-Token", required = false) String sessionToken,
            HttpServletRequest request) {
        enforceRateLimit(request, "leave", LEAVE_LIMIT);
        SessionService.SessionInfo info = roomService.requireSession(sessionToken);
        gameService.handleUserLeave(info.roomId(), info.userId());
    }

    private void enforceRateLimit(HttpServletRequest request, String action, int limit) {
        String key = action + ":" + clientIpResolver.resolve(request);
        RateLimitService.Decision decision = rateLimitService.check(key, limit, WINDOW_MILLIS);
        if (!decision.allowed()) {
            throw AppException.tooManyRequests("RATE_LIMITED", decision.retryAfterSeconds());
        }
    }
}
