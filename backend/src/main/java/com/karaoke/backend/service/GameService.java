package com.karaoke.backend.service;

import com.karaoke.backend.model.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class GameService {
    private final List<Song> songBank = List.of(
            new Song("S01", "Ex Hate Me(Part 2)", "http://localhost:8080/videos/song1.mp4", 11.24, 31.23),
            new Song("S02", "Không buông", "http://localhost:8080/videos/song2.mp4", 11, 39),
            new Song("S03", "Trú mưa nơi cầu vồng", "http://localhost:8080/videos/song3.mp4", 7.21, 25.28),
            new Song("S04", "Trú mưa nơi cầu vồng 2", "http://localhost:8080/videos/song4.mp4", 8.2, 25.24));
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(10);
    private final RoomService roomService;
    private final SimpMessagingTemplate messagingTemplate;

    public void handleGameMessage(String roomId, SocketMessage message) {
        switch (message.getType()) {
            case PLAY_SEGMENT:
                startGame(roomId);
                break;
            case BATTLE:
                handleUserClick(roomId, message.getSender());
                break;
            case VOTE:
                handleUserVote(roomId, message.getSender(), message.getContent().toString());
                break;
            case VOICE:
                broadcast(roomId, message);
                break;
            case RTC_SIGNAL:
                broadcast(roomId, message);
                break;
            case JOIN:
                roomService.getRoom(roomId);
                broadcast(roomId,
                        new SocketMessage(GameState.JOIN, roomService.getRoom(roomId).getUsers(), "server", roomId));
                lobbyPhase(roomId);
                break;
            case KICK_PLAYER:
                handleUserKick(roomId, message.getSender(), message.getContent().toString());
                break;
            case TOGGLE_READY:
                handleToggleReady(roomId, message.getSender());
                break;
        }
    }

    public GameService(RoomService roomService, SimpMessagingTemplate messagingTemplate) {
        this.roomService = roomService;
        this.messagingTemplate = messagingTemplate;
    }

    public void handleToggleReady(String roomId, String userId) {
        Room room = roomService.getRoom(roomId);
        User u = room.getUserById(userId);
        if (u != null) {
            u.setReady(!u.isReady());
            lobbyPhase(roomId);
        }
    }

    public void lobbyPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.LOBBY);
        broadcast(roomId, new SocketMessage(GameState.LOBBY, room.getUsers(), "server", roomId));
    }

    public void handleUserKick(String roomId, String hostId, String kickedPlayer) {
        Room room = roomService.getRoom(roomId);
        if (room.getUserById(hostId).isHost() == false) {
            return;
        }
        room.getUsers().removeIf(user -> user.getUserId().equals(kickedPlayer));
        broadcast(roomId, new SocketMessage(GameState.KICK_PLAYER, kickedPlayer, hostId, roomId));
        lobbyPhase(roomId);
    }

    public void startGame(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setCurrentRound(room.getCurrentRound() + 1);
        Song song = pickRandomSong(room);
        room.setCurrentSong(song);
        room.setGameState(GameState.PLAY_SEGMENT);
        broadcast(roomId, new SocketMessage(GameState.PLAY_SEGMENT,
                new MusicInfo(song.getVideoUrl(), 0, System.currentTimeMillis(), true), "server", roomId));
        long listenDelayMillis = (long) (song.getListenDuration() * 1000);
        scheduler.schedule(() -> startBuzzerPhase(roomId), listenDelayMillis, TimeUnit.MILLISECONDS);
    }

    public void startBuzzerPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.BATTLE);
        broadcast(roomId, new SocketMessage(GameState.BATTLE, "", "server", roomId));
        scheduler.schedule(() -> endBuzzerPhase(roomId), 5, TimeUnit.SECONDS);
    }

    public void endBuzzerPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null)
            return;
        Map<String, Integer> buzzerCount = room.getBuzzerCount();
        System.out.println("LOG SERVER - HẾT 5 GIÂY! Mở thùng phiếu ra kiểm tra: " + buzzerCount);
        if (buzzerCount.isEmpty()) {
            room.setGameState(GameState.LOBBY); // Trả về trạng thái chờ
            broadcast(roomId, new SocketMessage(GameState.LOBBY, "Không ai giành mic", "server", roomId));
            return;
        }
        String highestScoreUserId = "Chưa rõ";
        int maxScore = -1;
        for (Map.Entry<String, Integer> entry : buzzerCount.entrySet()) {
            if (entry.getValue() > maxScore) {
                highestScoreUserId = entry.getKey();
                maxScore = entry.getValue();
            }
        }
        String winnerName = "chưa rõ";
        for (User u : room.getUsers()) {
            if (u.getUserId().equalsIgnoreCase(highestScoreUserId)) {
                winnerName = u.getUserName();
                room.setCurrentPerformanceUser(u);
                break;
            }
        }
        room.setGameState(GameState.WINNER_SHOW);
        broadcast(roomId,
                new SocketMessage(GameState.WINNER_SHOW, room.getUserById(highestScoreUserId), "server", roomId));
        buzzerCount.clear();
        scheduler.schedule(() -> startCountdownPhase(roomId), 3, TimeUnit.SECONDS);
        // room.setGameState(GameState.PERFORMANCE);
        // broadcast(roomId, new
        // SocketMessage(GameState.PERFORMANCE,room.getUserById(highestScoreUserId),"server",roomId));
        // buzzerCount.clear();
        // scheduler.schedule(() -> startVotePhase(roomId), 15, TimeUnit.SECONDS );
    }

    public void startCountdownPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.COUNTDOWN);
        broadcast(roomId, new SocketMessage(GameState.COUNTDOWN, "", "server", roomId));
        scheduler.schedule(() -> startPerformancePhase(roomId), 3, TimeUnit.SECONDS);
    }

    public void startPerformancePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.PERFORMANCE);
        Song currentSong = room.getCurrentSong();
        broadcast(roomId, new SocketMessage(GameState.PERFORMANCE, new MusicInfo(currentSong.getVideoUrl(),
                currentSong.getListenDuration(), System.currentTimeMillis(), true), "server", roomId));
        double performanceTime = room.getCurrentSong().getTotalDuration() - room.getCurrentSong().getListenDuration();
        long performanceDelayMillis = (long) (performanceTime * 1000);
        scheduler.schedule(() -> startVotePhase(roomId), performanceDelayMillis, TimeUnit.MILLISECONDS);
    }

    public void startVotePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.VOTE);
        broadcast(roomId, new SocketMessage(GameState.VOTE, "", "server", roomId));
        scheduler.schedule(() -> endVotePhase(roomId), 5, TimeUnit.SECONDS);
    }

    public void endVotePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null)
            return;
        Map<String, Boolean> votes = room.getVotes();

        int numberOfUsers = room.getUsers().size() - 1;
        User performanceUser = room.getCurrentPerformanceUser();
        if (performanceUser == null)
            return;

        // 1. Xác định kết quả
        boolean isSuccess = false;

        if (numberOfUsers <= 0) {
            isSuccess = true; // Một mình tự hát tự nghe -> Cho qua luôn
        } else {
            int numberFalseVotes = 0;
            for (Map.Entry<String, Boolean> entry : votes.entrySet()) {
                if (!entry.getValue()) {
                    numberFalseVotes++;
                }
            }
            if ((numberOfUsers - numberFalseVotes) * 1.0 / numberOfUsers >= 0.5) {
                isSuccess = true;
            }
        }

        // 2. Cộng điểm nếu thành công
        if (isSuccess) {
            performanceUser.setScore(performanceUser.getScore() + 1);
        }

        // 3. Đóng gói Dữ liệu & Gửi xuống Frontend
        Map<String, Object> payload = new HashMap<>();
        payload.put("user", performanceUser);
        payload.put("isSuccess", isSuccess);

        room.setGameState(GameState.SCORE_SHOW);
        broadcast(roomId, new SocketMessage(GameState.SCORE_SHOW, payload, "server", roomId));

        // 4. Dọn dẹp và Lên lịch bài mới (Chạy cho MỌI trường hợp)
        votes.clear();
        if (room.getCurrentRound() < 3) {
            scheduler.schedule(() -> startGame(roomId), 3, TimeUnit.SECONDS);
        } else {
            scheduler.schedule(() -> startEndGamePhase(roomId), 3, TimeUnit.SECONDS);
        }

        room.setCurrentVideoId(null);
    }

    public void startEndGamePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.END_GAME);
        broadcast(roomId, new SocketMessage(GameState.END_GAME, "", "server", roomId));
        scheduler.schedule(() -> resetGame(roomId), 5, TimeUnit.SECONDS);
    }

    public void resetGame(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setCurrentRound(0);
        room.getPlayedSongIds().clear();
        for (User u : room.getUsers()) {
            u.setScore(0);
            u.setReady(false);
        }

        lobbyPhase(roomId);
    }

    public void handleUserVote(String roomId, String userId, String content) {
        Room room = roomService.getRoom(roomId);
        if (userId.equalsIgnoreCase(room.getCurrentPerformanceUser().getUserId())) {
            return;
        }
        if (room.getGameState() == GameState.VOTE) {
            Map<String, Boolean> votes = room.getVotes();
            votes.put(userId, Boolean.parseBoolean(content));
        }
    }

    public void handleUserClick(String roomId, String userId) {
        Room room = roomService.getRoom(roomId);
        if (room.getGameState() == GameState.BATTLE) {
            Map<String, Integer> buzzerCount = room.getBuzzerCount();
            buzzerCount.merge(userId, 1, Integer::sum);
        }
    }

    private void broadcast(String roomId, SocketMessage message) {
        messagingTemplate.convertAndSend("/topic/room/" + roomId, message);
    }

    private Song pickRandomSong(Room room) {
        List<Song> availablesSongs = new ArrayList<>();
        songBank.stream().filter(song -> !room.getPlayedSongIds().contains(song.getId())).forEach(availablesSongs::add);
        if (availablesSongs.isEmpty()) {
            room.getPlayedSongIds().clear();
            availablesSongs.addAll(songBank);
        }
        Random random = new Random();
        Song pickedSong = availablesSongs.get(random.nextInt(availablesSongs.size()));
        room.getPlayedSongIds().add(pickedSong.getId());
        return pickedSong;
    }
}
