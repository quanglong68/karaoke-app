package com.karaoke.backend.service;

import com.karaoke.backend.model.*;
import org.apache.commons.text.similarity.LevenshteinDistance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class GameService {
    private static final String SERVER_SENDER = "server";
    private static final int BUZZER_DURATION_SECONDS = 5;
    private static final int COUNTDOWN_DURATION_SECONDS = 3;
    private static final int PERFORMANCE_DURATION_MILLIS = 30000;
    private static final int NEXT_PHASE_DELAY_SECONDS = 3;
    private static final int END_GAME_DELAY_SECONDS = 5;
    private final List<Song> songBank = List.of(
            new Song("S01", "Ex Hate Me(Part 2)", "http://localhost:8080/videos/song1.mp4", 11.24, 31.23,
                    "Cám ơn anh vì ngày tháng qua\n" +
                            "Và cám ơn anh vì đã để chúng mình xa\n" +
                            "Để rồi mới biết ra, ta vốn không thuộc về nhau\n" +
                            "Chúc anh yêu được người tốt hơn\n" +
                            "Và sẽ bên anh một quãng đường dài hơn",
                    List.of(0.0, 349.23, 305.78, 349.23, 349.23, 351.25, 351.25, 351.25, 351.25, 392.0, 392.0, 425.01,
                            0.0, 298.8, 331.54, 0.0, 297.08, 333.46, 229.08, 325.84, 0.0, 0.0, 322.1, 331.54, 389.74,
                            432.44, 369.99, 374.29, 355.33, 347.22, 347.22, 355.33, 0.0, 351.25, 351.25, 329.63, 0.0,
                            351.25, 248.37, 261.63, 295.37, 311.13, 349.23, 331.54, 327.73, 316.57, 329.63, 260.12,
                            293.66, 285.3, 290.29, 234.43, 229.08, 227.76, 231.74, 233.08, 221.27, 0.0, 231.74, 231.74,
                            0.0, 220.0, 220.0, 210.07, 0.0)),
            new Song("S02", "Không buông", "http://localhost:8080/videos/song2.mp4", 11, 39,
                    "Em cũng có nỗi niềm của riêng mình\n" +
                            "Em xin lỗi đã bỏ anh một mình\n" +
                            "Sau bao tháng năm ta cùng chung đường\n" +
                            "Giờ hai đứa hai nơi\n" +
                            "Đoạn cảm xúc tưởng như là lâu dài\n" +
                            "Nhưng lại kết thúc bất ngờ vì hiểu lầm\n" +
                            "Em trách sao lúc đó mình không vì nhau mà cố",
                    List.of(0.0, 197.13, 194.87, 295.37, 331.54, 298.8, 290.29, 227.76, 222.56, 200.58, 197.13, 196.0,
                            298.8, 327.73, 314.74, 295.37, 231.74, 220.0, 220.0, 220.0, 0.0, 0.0, 0.0, 226.45, 222.56,
                            245.52, 264.67, 297.08, 280.4, 266.2, 261.63, 260.12, 222.56, 194.87, 194.87, 264.67,
                            295.37, 280.4, 263.14, 263.14, 261.63, 246.94, 199.42, 220.0, 217.47, 217.47, 244.11, 196.0,
                            186.07, 186.07, 193.75, 194.87, 194.87, 197.13, 196.0, 197.13, 196.0, 197.13, 204.09,
                            198.28)),
            new Song("S03", "Trú mưa nơi cầu vồng", "http://localhost:8080/videos/song3.mp4", 7.21, 25.28,
                    "Hoá ra khi trưởng thành không cô độc như em đã nghĩ từ đầu\n" +
                            "Khi em tìm được anh giống phép nhiệm màu\n" +
                            "Như hai hành tinh cô đơn không cùng phương hướng\n" +
                            "Bỗng ngã vào đời nhau, khi chẳng nơi nương náu",
                    List.of(0.0, 351.25, 392.0, 311.13, 309.34, 312.93, 312.93, 312.93, 314.74, 312.93, 359.46, 349.23,
                            392.0, 385.26, 394.27, 312.93, 311.13, 311.13, 309.34, 291.97, 309.34, 0.0, 212.51, 231.74,
                            238.53, 261.63, 210.07, 235.79, 295.37, 311.13, 314.74, 314.74, 261.63, 0.0, 257.13, 314.74,
                            316.57, 314.74, 312.93, 312.93, 337.33, 351.25)),
            new Song("S04", "Trú mưa nơi cầu vồng 2", "http://localhost:8080/videos/song4.mp4", 8.2, 25.24,
                    "Sẽ là rất tuyệt\n" +
                            "Khi ta nghe cùng playlist\n" +
                            "Chẳng cần nói nhiều\n" +
                            "Thuộc lòng từng suy nghĩ nhau\n" +
                            "Nói nhiều điều thật lòng\n" +
                            "Không muốn cứ mập mờ lòng vòng\n" +
                            "Như những người mới lớn trưởng thành cùng nhau",
                    List.of(0.0, 440.0, 316.57, 305.78, 320.24, 312.93, 0.0, 312.93, 311.13, 0.0, 347.22, 392.0, 353.29,
                            359.46, 318.4, 318.4, 311.13, 311.13, 314.74, 314.74, 307.55, 0.0, 230.4, 231.74, 263.14,
                            226.45, 220.0, 280.4, 309.34, 0.0, 312.93, 266.2, 269.29, 261.63, 309.34, 0.0, 312.93,
                            312.93, 0.0, 312.93, 347.22, 349.23, 349.23, 349.23)));
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
            case VOICE:
                broadcast(roomId, message);
                break;
            case RTC_SIGNAL:
                broadcast(roomId, message);
                break;
            case JOIN:
                Room joinRoom = roomService.getRoom(roomId);
                if (joinRoom == null) {
                    return;
                }
                broadcastState(roomId, GameState.JOIN, joinRoom.getUsers());
                lobbyPhase(roomId);
                break;
            case KICK_PLAYER:
                handleUserKick(roomId, message.getSender(), message.getContent().toString());
                break;
            case TOGGLE_READY:
                handleToggleReady(roomId, message.getSender());
                break;
            case USER_LYRICS:
                Room lyricsRoom = roomService.getRoom(roomId);
                if (lyricsRoom == null || lyricsRoom.getCurrentPerformanceUser() == null
                        || !lyricsRoom.getCurrentPerformanceUser().getUserId().equals(message.getSender())) {
                    return;
                }
                try {
                    // Dịch gói JSON từ Frontend thành Map
                    Map<String, Object> contentMap = (Map<String, Object>) message.getContent();

                    // 1. Lấy Lời bài hát
                    String userLyrics = (String) contentMap.get("lyrics");

                    // 2. Lấy Mảng tần số Tone
                    List<Double> userPitchContour = new ArrayList<>();
                    Object pitchObj = contentMap.get("pitchContour");

                    if (pitchObj instanceof List) {
                        for (Object num : (List<?>) pitchObj) {
                            if (num instanceof Number) {
                                userPitchContour.add(((Number) num).doubleValue());
                            }
                        }
                    }

                    // Nộp cả 2 thứ cho AI chấm điểm
                    evaluatePerformance(roomId, userLyrics, userPitchContour);

                } catch (Exception e) {
                    System.out.println("Lỗi khi đọc kết quả biểu diễn: " + e.getMessage());
                    evaluatePerformance(roomId, " ", List.of()); // Fallback chống sập
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

    // 1. BỘ PHÂN TÍCH GIỌNG HÁT: Lọc nhiễu, Tính Tông trung bình và Độ luyến láy
    private double[] analyzePitch(List<Double> pitches) {
        List<Double> notes = new ArrayList<>();
        for (Double hz : pitches) {
            if (hz != null && hz > 50 && hz < 2000) {
                notes.add(12 * (Math.log(hz / 440.0) / Math.log(2)));
            }
        }
        if (notes.size() < 2)
            return new double[] { 0.0, 0.0 };

        // 👉 MÁY CẮT RÁC: Xóa 5% cao nhất và 5% thấp nhất để chống nhiễu micro (glitch)
        Collections.sort(notes);
        int trim = (int) (notes.size() * 0.05);
        List<Double> cleanNotes = notes.subList(trim, notes.size() - trim);
        if (cleanNotes.isEmpty())
            cleanNotes = notes; // Fallback

        // Tính Tông trung bình (Mean)
        double sum = 0;
        for (double note : cleanNotes)
            sum += note;
        double mean = sum / cleanNotes.size();

        // Tính Độ luyến láy (Variance)
        double varianceSum = 0;
        for (double note : cleanNotes)
            varianceSum += Math.pow(note - mean, 2);
        double variance = Math.sqrt(varianceSum / cleanNotes.size());

        // Trả về [Tông trung bình, Độ luyến láy]
        return new double[] { mean, variance };
    }

    // 2. THUẬT TOÁN DTW (Ver 6 - CHUYÊN NGHIỆP): Dịch tông tự động + Ép chết hát
    // ngang
    private double calculateToneScore(List<Double> userPitch, List<Double> originalPitch) {
        if (userPitch == null || userPitch.isEmpty() || originalPitch == null || originalPitch.isEmpty()) {
            return 0.0;
        }

        // 1. Phân tích dữ liệu 2 bên
        double[] userStats = analyzePitch(userPitch);
        double[] origStats = analyzePitch(originalPitch);

        double userMean = userStats[0];
        double origMean = origStats[0];
        double userVar = userStats[1];
        double origVar = origStats[1];

        // 👉 DỊCH TÔNG: Khoảng cách giữa Tông gốc và Tông của người hát
        double keyShift = origMean - userMean;

        // 2. Thiết lập Ma trận DTW
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

                    // DỊCH GIAI ĐIỆU CỦA NGƯỜI CHƠI LÊN BẰNG VỚI CA SĨ
                    userNote += keyShift;

                    // So sánh sự chênh lệch trực tiếp (Không dùng % 12 nữa)
                    cost = Math.abs(userNote - originalNote);
                } else if (userHz > 0 || originalHz > 0) {
                    // Phạt tội hát sai nhịp hoặc im lặng
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

        // 3. Tính điểm (Trừ 12 điểm cho mỗi 1 nốt chênh lệch)
        double score = Math.max(0, 100 - (averageDeviation * 12));

        // 👉 ÁN TỬ HÌNH CHO HÁT NGANG:
        if (origVar > 1.2 && userVar < 0.6) {
            System.out.println("🚨 [RADAR] ÁN TỬ HÌNH: PHÁT HIỆN HÁT NGANG! User Var: " + userVar);
            score = 0.0; // Đánh rớt 100%, không cho gỡ điểm!
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

        // 1. Chấm điểm Lời (Thuật toán Levenshtein cũ của bạn) -> max 100đ
        double lyricsScore = calculateLyricsScore(userLyrics, currentSong.getOriginalLyrics());

        // 2. Chấm điểm Tone (Thuật toán DTW ở trên) -> max 100đ
        double toneScore = calculateToneScore(userPitchContour, currentSong.getOriginalPitchContour());

        // 3. Tính điểm tổng hợp (Tỉ lệ vàng: 40% Lời, 60% Tone)
        double finalScore = (lyricsScore * 0.4) + (toneScore * 0.6);

        // 4. Quyết định Pass/Fail
        boolean isSuccess = finalScore >= 70.0;

        System.out.println("====== KẾT QUẢ CHẤM ĐIỂM ======");
        System.out.println("Lời hát nhận được: [" + userLyrics + "]");
        System.out.println("Số lượng mẫu Tone: " + userPitchContour.size() + " mẫu");
        System.out.println("🔥 ĐIỂM LỜI (40%): " + lyricsScore);
        System.out.println("🔥 ĐIỂM TONE (60%): " + toneScore);
        System.out.println("🔥 ĐIỂM TỔNG CỘNG: " + finalScore + " / 100");
        System.out.println("Kết quả: " + (isSuccess ? "PASS" : "FAIL"));

        // 1. Xác định kết quả
        User performanceUser = room.getCurrentPerformanceUser();
        if (isSuccess) {
            performanceUser.setScore(performanceUser.getScore() + 1);
        }

        // 3. Đóng gói Dữ liệu & Gửi xuống Frontend
        Map<String, Object> payload = new HashMap<>();
        payload.put("user", performanceUser);
        payload.put("isSuccess", isSuccess);

        room.setGameState(GameState.SCORE_SHOW);
        broadcastState(roomId, GameState.SCORE_SHOW, payload);

        if (room.getCurrentRound() < 3) {
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
        broadcastState(roomId, GameState.LOBBY, room.getUsers());
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
        broadcastState(roomId, GameState.PLAY_SEGMENT,
                new MusicInfo(song.getVideoUrl(), 0, System.currentTimeMillis(), true));
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
            room.setGameState(GameState.LOBBY); // Trả về trạng thái chờ
            broadcastState(roomId, GameState.LOBBY, "Không ai giành mic");
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
        scheduler.schedule(() -> startCountdownPhase(roomId), COUNTDOWN_DURATION_SECONDS, TimeUnit.SECONDS);
    }

    public void startCountdownPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.COUNTDOWN);
        broadcastState(roomId, GameState.COUNTDOWN, "");
        scheduler.schedule(() -> startPerformancePhase(roomId), COUNTDOWN_DURATION_SECONDS, TimeUnit.SECONDS);
    }

    public void startPerformancePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.PERFORMANCE);
        Song currentSong = room.getCurrentSong();
        broadcastState(roomId, GameState.PERFORMANCE, currentSong.getOriginalLyrics());
        var timer = scheduler.schedule(() -> {
            startAIEvaluatePhase(roomId);
            performanceTimers.remove(roomId); // Nổ xong thì xóa đi
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
            timer.cancel(false); // Hủy lịch hẹn
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
        broadcast(roomId, new SocketMessage(state, content, SERVER_SENDER, roomId));
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
