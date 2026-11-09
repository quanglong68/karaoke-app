package com.karaoke.backend.service;

import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.GameState;
import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.RoomJoinResponse;
import com.karaoke.backend.model.RoomView;
import com.karaoke.backend.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomService {
    private static final Logger log = LoggerFactory.getLogger(RoomService.class);

    private static final int MAX_NAME_LENGTH = 24;
    private static final int MAX_ROOM_NAME_LENGTH = 32;
    private static final long ROOM_TTL_MILLIS = 6 * 60 * 60 * 1000L;
    private static final long ORPHAN_ROOM_MILLIS = 90_000L;

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final SessionService sessionService;
    private final PresenceRegistry presenceRegistry;

    public RoomService(SessionService sessionService, PresenceRegistry presenceRegistry) {
        this.sessionService = sessionService;
        this.presenceRegistry = presenceRegistry;
    }

    public RoomJoinResponse createRoom(String roomName, String userName) {
        String safeRoomName = sanitizeName(roomName, "ROOM_NAME_INVALID", MAX_ROOM_NAME_LENGTH);
        String safeUserName = sanitizeName(userName, "USER_NAME_INVALID", MAX_NAME_LENGTH);

        Room room = new Room();
        room.setRoomId(generateRoomId());
        room.setRoomName(safeRoomName);
        room.setGameState(GameState.LOBBY);

        User user = new User(generateUserId(room), safeUserName, 0, true, true);
        room.addUser(user);
        rooms.put(room.getRoomId(), room);

        String token = sessionService.issue(room.getRoomId(), user.getUserId());
        log.info("Room created: {}", room.getRoomId());
        return new RoomJoinResponse(RoomView.from(room), user, token);
    }

    public RoomJoinResponse joinRoom(String roomId, String userName) {
        String safeUserName = sanitizeName(userName, "USER_NAME_INVALID", MAX_NAME_LENGTH);
        Room room = requireRoom(roomId);

        User user;
        synchronized (room) {
            if (room.getGameState() != GameState.LOBBY) {
                throw AppException.conflict("ROOM_PLAYING");
            }
            if (room.getUsers().size() >= Room.MAX_PLAYERS) {
                throw AppException.conflict("ROOM_FULL");
            }
            user = new User(generateUserId(room), safeUserName, 0, false, false);
            room.addUser(user);
        }

        String token = sessionService.issue(room.getRoomId(), user.getUserId());
        return new RoomJoinResponse(RoomView.from(room), user, token);
    }

    public RoomJoinResponse rejoin(String sessionToken) {
        SessionService.SessionInfo info = requireSession(sessionToken);
        Room room = rooms.get(info.roomId());
        if (room == null) {
            sessionService.revoke(sessionToken);
            throw AppException.notFound("ROOM_NOT_FOUND");
        }
        User user = room.getUserById(info.userId());
        if (user == null) {
            sessionService.revoke(sessionToken);
            throw AppException.unauthorized("SESSION_INVALID");
        }
        room.touch();
        return new RoomJoinResponse(RoomView.from(room), user, sessionToken);
    }

    public SessionService.SessionInfo leaveByToken(String sessionToken) {
        SessionService.SessionInfo info = requireSession(sessionToken);
        leaveRoom(info.roomId(), info.userId());
        sessionService.revoke(sessionToken);
        return info;
    }

    public SessionService.SessionInfo requireSession(String sessionToken) {
        SessionService.SessionInfo info = sessionService.validate(sessionToken);
        if (info == null) {
            throw AppException.unauthorized("SESSION_INVALID");
        }
        return info;
    }

    public Room getRoom(String roomId) {
        return roomId == null ? null : rooms.get(roomId);
    }

    public Room requireRoom(String roomId) {
        Room room = getRoom(roomId);
        if (room == null) {
            throw AppException.notFound("ROOM_NOT_FOUND");
        }
        return room;
    }

    public List<RoomView> listRooms() {
        return rooms.values().stream()
                .map(RoomView::from)
                .toList();
    }

    public void touch(String roomId) {
        Room room = getRoom(roomId);
        if (room != null) {
            room.touch();
        }
    }

    public void leaveRoom(String roomId, String userId) {
        Room room = getRoom(roomId);
        if (room == null) {
            return;
        }
        User leavingUser = room.getUserById(userId);
        if (leavingUser == null) {
            return;
        }
        synchronized (room) {
            room.getUsers().removeIf(user -> user.getUserId().equals(userId));
            room.getBuzzerCount().remove(userId);
            room.getVotes().remove(userId);
            room.getUserNamesMap().remove(userId);
            if (room.getCurrentPerformanceUser() != null
                    && room.getCurrentPerformanceUser().getUserId().equals(userId)) {
                room.setCurrentPerformanceUser(null);
            }
            if (room.getUsers().isEmpty()) {
                rooms.remove(roomId);
                return;
            }
            if (leavingUser.isHost()) {
                User newHost = room.getUsers().get(0);
                newHost.setHost(true);
                newHost.setReady(true);
            }
            room.touch();
        }
    }

    public Room renameUser(String roomId, String userId, String newName) {
        String safeName = sanitizeName(newName, "USER_NAME_INVALID", MAX_NAME_LENGTH);
        Room room = getRoom(roomId);
        if (room == null) {
            return null;
        }
        User user = room.getUserById(userId);
        if (user != null) {
            user.setUserName(safeName);
            room.touch();
        }
        return room;
    }

    public void revokeUserSessions(String roomId, String userId) {
        sessionService.revokeUser(roomId, userId);
        // A revoked member must not keep sending on its still-open socket.
        presenceRegistry.removeUser(roomId, userId);
    }

    @Scheduled(fixedDelay = 60_000)
    public void cleanupStaleRooms() {
        long now = System.currentTimeMillis();
        rooms.entrySet().removeIf(entry -> {
            Room room = entry.getValue();
            boolean empty = room.getUsers().isEmpty();
            boolean stale = now - room.getLastActivityEpoch() > ROOM_TTL_MILLIS;
            boolean orphan = now - room.getLastActivityEpoch() > ORPHAN_ROOM_MILLIS
                    && !presenceRegistry.hasRoomPresence(entry.getKey());
            if (!empty && !stale && !orphan) {
                return false;
            }
            room.getUsers().forEach(user -> sessionService.revokeUser(entry.getKey(), user.getUserId()));
            log.info("Room evicted: {}", entry.getKey());
            return true;
        });
    }

    private String generateRoomId() {
        String roomId;
        do {
            roomId = UUID.randomUUID().toString().substring(0, 8);
        } while (rooms.containsKey(roomId));
        return roomId;
    }

    private String generateUserId(Room room) {
        String userId;
        do {
            userId = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        } while (room.getUserById(userId) != null);
        return userId;
    }

    private String sanitizeName(String value, String errorCode, int maxLength) {
        if (value == null) {
            throw AppException.badRequest(errorCode);
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty() || trimmed.length() > maxLength) {
            throw AppException.badRequest(errorCode);
        }
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if (Character.isISOControl(c)) {
                throw AppException.badRequest(errorCode);
            }
        }
        return trimmed;
    }
}
