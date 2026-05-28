package com.karaoke.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.model.*;
import org.apache.commons.text.similarity.LevenshteinDistance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.text.Normalizer;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class GameService {
    private static final String SERVER_SENDER = "server";
    private static final int BUZZER_DURATION_SECONDS = 5;
    private final int maxRounds;
    private static final int COUNTDOWN_DURATION_SECONDS = 3;
    private static final int PERFORMANCE_DURATION_MILLIS = 60000;
    private static final int NEXT_PHASE_DELAY_SECONDS = 3;
    private static final int END_GAME_DELAY_SECONDS = 5;
    private List<Song> songBank = new ArrayList<>();
    private final String DB_FILE_PATH = "data/songs.json";
    private final ObjectMapper objectMapper = new ObjectMapper();

    // SỬA LẠI CONSTRUCTOR NHƯ SAU:
    @Autowired // Có thể có hoặc không, Spring đời mới tự hiểu
    public GameService(RoomService roomService, SimpMessagingTemplate messagingTemplate) {
        this.roomService = roomService;
        this.messagingTemplate = messagingTemplate;

        // Vẫn gọi hàm nạp dữ liệu như bình thường
        loadSongsFromDatabase();
        maxRounds = Math.min(10, songBank.size());
    }

    private void loadSongsFromDatabase() {
        try {
            File file = new File(DB_FILE_PATH);
            if (file.exists()) {
                songBank = objectMapper.readValue(file, new TypeReference<List<Song>>() {
                });
                System.out.println("✅ Đã load " + songBank.size() + " bài hát từ songs.json");
            } else {
                file.getParentFile().mkdirs();
                file.createNewFile();
                saveSongsToDatabase();
            }
        } catch (IOException e) {
            System.err.println("❌ Lỗi đọc Database: " + e.getMessage());
        }
    }

    private void saveSongsToDatabase() {
        try {
            objectMapper.writeValue(new File(DB_FILE_PATH), songBank);
        } catch (IOException e) {
            System.err.println("❌ Lỗi ghi Database: " + e.getMessage());
        }
    }

    public Song addNewSong(String title, String videoUrl, double duration, String lyrics, List<Double> pitch) {
        String newId = "S" + String.format("%03d", songBank.size() + 1);
        Song newSong = new Song(newId, title, videoUrl, duration, duration, lyrics, pitch);

        songBank.add(newSong);
        saveSongsToDatabase();
        return newSong;
    }

    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(10);
    private final RoomService roomService;
    private final SimpMessagingTemplate messagingTemplate;
    private final Map<String, java.util.concurrent.ScheduledFuture<?>> performanceTimers = new HashMap<>();

    public void handleGameMessage(String roomId, SocketMessage message) {
        switch (message.getType()) {
            case PLAY_SEGMENT:
                startGame(roomId);
                break;
            case BATTLE:
                handleUserClick(roomId, message.getSender());
                break;
            case RTC_SIGNAL:
                broadcast(roomId, message);
                break;
            case JOIN:
                Room joinRoom = roomService.getRoom(roomId);
                if (joinRoom == null) {
                    return;
                }
                broadcastMessage(roomId, MessageType.JOIN, joinRoom.getUsers());
                if (joinRoom.getGameState() == GameState.LOBBY) {
                    lobbyPhase(roomId);
                }
                break;
            case KICK_PLAYER:
                handleUserKick(roomId, message.getSender(), message.getContent().toString());
                break;
            case TOGGLE_READY:
                handleToggleReady(roomId, message.getSender());
                break;
            case LEAVE:
                roomService.leaveRoom(roomId, message.getSender());
                Room leftRoom = roomService.getRoom(roomId);
                if (leftRoom != null) {
                    broadcastMessage(roomId, MessageType.JOIN, leftRoom.getUsers());
                }
                break;
            case RENAME:
                Object content = message.getContent();
                if (content instanceof Map) {
                    Object nameObj = ((Map<?, ?>) content).get("userName");
                    if (nameObj instanceof String) {
                        Room renamedRoom = roomService.renameUser(roomId, message.getSender(), (String) nameObj);
                        if (renamedRoom != null) {
                            broadcastMessage(roomId, MessageType.JOIN, renamedRoom.getUsers());
                        }
                    }
                }
                break;
            case USER_LYRICS:
                Room lyricsRoom = roomService.getRoom(roomId);
                if (lyricsRoom == null || lyricsRoom.getCurrentPerformanceUser() == null
                        || !lyricsRoom.getCurrentPerformanceUser().getUserId().equals(message.getSender())) {
                    return;
                }
                try {
                    Map<String, Object> contentMap = (Map<String, Object>) message.getContent();
                    String userLyrics = (String) contentMap.get("lyrics");
                    List<Double> userPitchContour = new ArrayList<>();
                    Object pitchObj = contentMap.get("pitchContour");

                    // Optional client-side songId check to prevent mismatched submissions
                    Object clientSongIdObj = contentMap.get("songId");
                    Song current = lyricsRoom.getCurrentSong();
                    if (clientSongIdObj instanceof String && current != null) {
                        String clientSongId = (String) clientSongIdObj;
                        if (!clientSongId.equals(current.getId())) {
                            System.out.println("Ignored USER_LYRICS: client songId does not match server currentSong");
                            return;
                        }
                    }

                    if (pitchObj instanceof List) {
                        for (Object num : (List<?>) pitchObj) {
                            if (num instanceof Number) {
                                userPitchContour.add(((Number) num).doubleValue());
                            }
                        }
                    }

                    evaluatePerformance(roomId, userLyrics, userPitchContour);

                } catch (Exception e) {
                    System.out.println("Lỗi khi đọc kết quả biểu diễn: " + e.getMessage());
                    evaluatePerformance(roomId, " ", List.of());
                }
                break;
            case PERFORMANCE_EVALUATION:
                Room evalRoom = roomService.getRoom(roomId);
                if (evalRoom == null || evalRoom.getCurrentPerformanceUser() == null
                        || !evalRoom.getCurrentPerformanceUser().getUserId().equals(message.getSender())) {
                    return;
                }
                cancelPerformanceTimer(roomId);
                startAIEvaluatePhase(roomId);
                break;
        }
    }

    private double[] analyzePitch(List<Double> pitches) {
        List<Double> notes = new ArrayList<>();
        for (Double hz : pitches) {
            if (hz != null && hz > 50 && hz < 2000) {
                notes.add(12 * (Math.log(hz / 440.0) / Math.log(2)));
            }
        }
        if (notes.size() < 2)
            return new double[] { 0.0, 0.0 };

        Collections.sort(notes);
        int trim = (int) (notes.size() * 0.05);
        List<Double> cleanNotes = notes.subList(trim, notes.size() - trim);
        if (cleanNotes.isEmpty())
            cleanNotes = notes;
        double sum = 0;
        for (double note : cleanNotes)
            sum += note;
        double mean = sum / cleanNotes.size();
        double varianceSum = 0;
        for (double note : cleanNotes)
            varianceSum += Math.pow(note - mean, 2);
        double variance = Math.sqrt(varianceSum / cleanNotes.size());
        return new double[] { mean, variance };
    }

    private double calculateToneScore(List<Double> userPitch, List<Double> originalPitch) {
        if (userPitch == null || userPitch.isEmpty() || originalPitch == null || originalPitch.isEmpty()) {
            return 0.0;
        }

        double[] userStats = analyzePitch(userPitch);
        double[] origStats = analyzePitch(originalPitch);

        double userMean = userStats[0];
        double origMean = origStats[0];
        double userVar = userStats[1];
        double origVar = origStats[1];

        double keyShift = origMean - userMean;
        int n = userPitch.size();
        int m = originalPitch.size();
        double[][] dtw = new double[n + 1][m + 1];
        for (int i = 0; i <= n; i++)
            Arrays.fill(dtw[i], Double.MAX_VALUE);
        dtw[0][0] = 0;

        double stretchPenalty = 2.0;

        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= m; j++) {
                double userHz = userPitch.get(i - 1);
                double originalHz = originalPitch.get(j - 1);

                double cost = 0;
                if (userHz > 0 && originalHz > 0) {
                    double userNote = 12 * (Math.log(userHz / 440.0) / Math.log(2));
                    double originalNote = 12 * (Math.log(originalHz / 440.0) / Math.log(2));

                    userNote += keyShift;
                    cost = Math.abs(userNote - originalNote);
                } else if (userHz > 0 || originalHz > 0) {
                    cost = 5;
                }

                double match = dtw[i - 1][j - 1];
                double insert = dtw[i - 1][j] + stretchPenalty;
                double delete = dtw[i][j - 1] + stretchPenalty;

                dtw[i][j] = cost + Math.min(match, Math.min(insert, delete));
            }
        }

        double totalDistance = dtw[n][m];
        double averageDeviation = totalDistance / Math.max(n, m);

        double score = Math.max(0, 100 - (averageDeviation * 12));
        if (origVar > 1.2 && userVar < 0.6) {
            System.out.println("🚨 [RADAR] ÁN TỬ HÌNH: PHÁT HIỆN HÁT NGANG! User Var: " + userVar);
            score = 0.0;
        }

        if (score < 70) {
            score = 0;
        }

        return score;
    }

    public double calculateLyricsScore(String userLyrics, String originalLyrics) {

        String cleanUserLyrics = normalizeText(userLyrics);

        String cleanOriginalLyrics = normalizeText(originalLyrics);

        LevenshteinDistance levenshteinDistance = new LevenshteinDistance();

        int distance = levenshteinDistance.apply(
                cleanUserLyrics,
                cleanOriginalLyrics);

        int maxLength = Math.max(
                cleanUserLyrics.length(),
                cleanOriginalLyrics.length());

        double similarity = 0;

        if (maxLength > 0) {
            similarity = (1.0 - ((double) distance / maxLength)) * 100;
        }
        return similarity;

    }

    public void evaluatePerformance(String roomId, String userLyrics, List<Double> userPitchContour) {
        Room room = roomService.getRoom(roomId);
        Song currentSong = room.getCurrentSong();

        double lyricsScore = calculateLyricsScore(userLyrics, currentSong.getOriginalLyrics());
        double toneScore = calculateToneScore(userPitchContour, currentSong.getOriginalPitchContour());
        double finalScore = (lyricsScore * 0.4) + (toneScore * 0.6);
        boolean isSuccess = finalScore >= 70.0;

        System.out.println("====== KẾT QUẢ CHẤM ĐIỂM ======");
        System.out.println("Lời hát nhận được: [" + userLyrics + "]");
        System.out.println("Số lượng mẫu Tone: " + userPitchContour.size() + " mẫu");
        System.out.println("🔥 ĐIỂM LỜI (40%): " + lyricsScore);
        System.out.println("🔥 ĐIỂM TONE (60%): " + toneScore);
        System.out.println("🔥 ĐIỂM TỔNG CỘNG: " + finalScore + " / 100");
        System.out.println("Kết quả: " + (isSuccess ? "PASS" : "FAIL"));

        User performanceUser = room.getCurrentPerformanceUser();
        if (isSuccess) {
            performanceUser.setScore(performanceUser.getScore() + 1);
        }
        Map<String, Object> payload = new HashMap<>();
        payload.put("user", performanceUser);
        payload.put("isSuccess", isSuccess);

        room.setGameState(GameState.SCORE_SHOW);
        broadcastState(roomId, GameState.SCORE_SHOW, payload);

        if (room.getCurrentRound() < maxRounds) {
            scheduler.schedule(() -> startGame(roomId), NEXT_PHASE_DELAY_SECONDS, TimeUnit.SECONDS);
        } else {
            scheduler.schedule(() -> startEndGamePhase(roomId), NEXT_PHASE_DELAY_SECONDS, TimeUnit.SECONDS);
        }
        room.setCurrentVideoId(null);
    }

    private String normalizeText(String text) {

        text = text.toLowerCase();

        text = Normalizer.normalize(
                text,
                Normalizer.Form.NFD);

        text = text.replaceAll("\\p{M}", "");

        text = text.replaceAll("\\s+", " ");

        text = text.replaceAll("[^a-z0-9 ]", "");

        text = text.trim();

        return text;
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
        broadcastState(roomId, GameState.LOBBY, room.getUsers());

        // Ensure clients can preload the first upcoming song while still in lobby
        try {
            if (room.getUpcomingSong() == null) {
                Song upcoming = pickRandomSong(room);
                room.setUpcomingSong(upcoming);
                MusicInfo preloadInfo = new MusicInfo(
                        upcoming.getVideoUrl(),
                        0,
                        System.currentTimeMillis(),
                        false,
                        null,
                        upcoming.getId(),
                        null);
                broadcastMessage(roomId, MessageType.PRELOAD, preloadInfo);
            }
        } catch (Exception e) {
            // don't block lobby on preload errors
            System.out.println("Preload selection failed: " + e.getMessage());
        }
    }

    public void handleUserKick(String roomId, String hostId, String kickedPlayer) {
        Room room = roomService.getRoom(roomId);
        if (room.getUserById(hostId).isHost() == false) {
            return;
        }
        room.getUsers().removeIf(user -> user.getUserId().equals(kickedPlayer));
        broadcast(roomId, new SocketMessage(MessageType.KICK_PLAYER, kickedPlayer, hostId, roomId));
        lobbyPhase(roomId);
    }

    public void startGame(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setCurrentRound(room.getCurrentRound() + 1);
        Song song = room.getUpcomingSong();
        if (song != null) {
            room.setUpcomingSong(null);
        } else {
            song = pickRandomSong(room);
        }
        room.setCurrentSong(song);
        room.setGameState(GameState.PLAY_SEGMENT);
        Song nextSong = pickRandomSong(room);
        room.setUpcomingSong(nextSong);
        broadcastState(roomId, GameState.PLAY_SEGMENT,
                new MusicInfo(
                        song.getVideoUrl(),
                        0,
                        System.currentTimeMillis(),
                        true,
                        nextSong != null ? nextSong.getVideoUrl() : null,
                        song.getId(),
                        nextSong != null ? nextSong.getId() : null));
        long listenDelayMillis = (long) (song.getListenDuration() * 1000);
        scheduler.schedule(() -> startBuzzerPhase(roomId), listenDelayMillis, TimeUnit.MILLISECONDS);
    }

    public void startBuzzerPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.BATTLE);
        broadcastState(roomId, GameState.BATTLE, "");
        scheduler.schedule(() -> endBuzzerPhase(roomId), BUZZER_DURATION_SECONDS, TimeUnit.SECONDS);
    }

    public void endBuzzerPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null)
            return;
        Map<String, Integer> buzzerCount = room.getBuzzerCount();
        System.out.println("LOG SERVER - HẾT 5 GIÂY! Mở thùng phiếu ra kiểm tra: " + buzzerCount);
        if (buzzerCount.isEmpty()) {
            room.setCurrentPerformanceUser(null);
            broadcastMessage(roomId, MessageType.NO_WINNER, "Không ai giành mic");
            buzzerCount.clear();
            if (room.getCurrentRound() >= maxRounds) {
                scheduler.schedule(() -> startCountdownPhase(roomId, () -> startEndGamePhase(roomId)), 1,
                        TimeUnit.SECONDS);
            } else {
                scheduler.schedule(() -> startCountdownPhase(roomId, () -> startGame(roomId)), 1, TimeUnit.SECONDS);
            }
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
        broadcastState(roomId, GameState.WINNER_SHOW, room.getUserById(highestScoreUserId));
        buzzerCount.clear();
        scheduler.schedule(() -> startCountdownPhase(roomId, () -> startPerformancePhase(roomId)),
                COUNTDOWN_DURATION_SECONDS, TimeUnit.SECONDS);
    }

    public void startCountdownPhase(String roomId, Runnable nextStep) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.COUNTDOWN);
        broadcastState(roomId, GameState.COUNTDOWN, "");
        scheduler.schedule(nextStep, COUNTDOWN_DURATION_SECONDS, TimeUnit.SECONDS);
    }

    public void startPerformancePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.PERFORMANCE);
        Song currentSong = room.getCurrentSong();
        broadcastState(roomId, GameState.PERFORMANCE, currentSong.getOriginalLyrics());
        var timer = scheduler.schedule(() -> {
            startAIEvaluatePhase(roomId);
            performanceTimers.remove(roomId);
        }, PERFORMANCE_DURATION_MILLIS, TimeUnit.MILLISECONDS);
        performanceTimers.put(roomId, timer);
    }

    public void startAIEvaluatePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.PERFORMANCE_EVALUATION);
        broadcastState(roomId, GameState.PERFORMANCE_EVALUATION, "");
    }

    private void cancelPerformanceTimer(String roomId) {
        var timer = performanceTimers.get(roomId);
        if (timer != null) {
            timer.cancel(false);
            performanceTimers.remove(roomId);
        }
    }

    public void startEndGamePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.END_GAME);
        broadcastState(roomId, GameState.END_GAME, "");
        scheduler.schedule(() -> resetGame(roomId), END_GAME_DELAY_SECONDS, TimeUnit.SECONDS);
    }

    public void resetGame(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setCurrentRound(0);
        room.setUpcomingSong(null);
        room.getPlayedSongIds().clear();
        for (User u : room.getUsers()) {
            u.setScore(0);
            u.setReady(false);
        }

        lobbyPhase(roomId);
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

    private void broadcastState(String roomId, GameState state, Object content) {
        broadcastMessage(roomId, MessageType.valueOf(state.name()), content);
    }

    private void broadcastMessage(String roomId, MessageType type, Object content) {
        broadcast(roomId, new SocketMessage(type, content, SERVER_SENDER, roomId));
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
