package com.karaoke.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.model.*;
import org.apache.commons.text.similarity.LevenshteinDistance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.text.Normalizer;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class GameService {
    private static final Logger log = LoggerFactory.getLogger(GameService.class);

    private static final String SERVER_SENDER = "server";
    private static final int BUZZER_DURATION_SECONDS = 5;
    private static final int COUNTDOWN_DURATION_SECONDS = 3;
    private static final int PERFORMANCE_DURATION_MILLIS = 60_000;
    private static final int EVALUATION_FALLBACK_SECONDS = 15;
    private static final int NEXT_PHASE_DELAY_SECONDS = 3;
    private static final int END_GAME_DELAY_SECONDS = 5;
    private static final int MAX_LYRICS_LENGTH = 2_000;
    private static final int MAX_PITCH_SAMPLES = 2_000;
    private static final int MAX_TEXT_LENGTH = 3_000;
    private static final int MAX_RTC_PAYLOAD_CHARS = 64_000;
    private static final Set<String> ALLOWED_RTC_ACTIONS = Set.of("offer", "answer", "candidate");
    private static final Pattern SONG_ID_PATTERN = Pattern.compile("^S(\\d+)$");

    private final List<Song> songBank = new CopyOnWriteArrayList<>();
    private final Path databasePath = Path.of("data", "songs.json");
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Object databaseLock = new Object();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(10, runnable -> {
        Thread thread = new Thread(runnable, "game-scheduler");
        thread.setDaemon(true);
        return thread;
    });
    private final Map<String, ScheduledFuture<?>> performanceTimers = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> evaluationTimers = new ConcurrentHashMap<>();

    private final RoomService roomService;
    private final SimpMessagingTemplate messagingTemplate;
    private final int maxRounds;

    public GameService(RoomService roomService, SimpMessagingTemplate messagingTemplate,
            @Value("${app.max-rounds:3}") int maxRounds) {
        this.roomService = roomService;
        this.messagingTemplate = messagingTemplate;
        this.maxRounds = maxRounds;
        loadSongsFromDatabase();
    }

    private void loadSongsFromDatabase() {
        try {
            File file = databasePath.toFile();
            if (!file.exists()) {
                Files.createDirectories(databasePath.getParent());
                saveSongsToDatabase();
                return;
            }
            List<Song> loaded = objectMapper.readValue(file, new TypeReference<List<Song>>() {
            });
            if (loaded != null) {
                loaded.stream()
                        .filter(Objects::nonNull)
                        .filter(song -> song.getId() != null)
                        .forEach(songBank::add);
            }
            log.info("Loaded {} songs from songs.json", songBank.size());
        } catch (IOException exception) {
            log.error("Failed to read song database", exception);
        }
    }

    private void saveSongsToDatabase() {
        synchronized (databaseLock) {
            try {
                Files.createDirectories(databasePath.getParent());
                Path tempPath = databasePath.resolveSibling(databasePath.getFileName() + ".tmp");
                objectMapper.writeValue(tempPath.toFile(), new ArrayList<>(songBank));
                try {
                    Files.move(tempPath, databasePath, StandardCopyOption.REPLACE_EXISTING,
                            StandardCopyOption.ATOMIC_MOVE);
                } catch (AtomicMoveNotSupportedException exception) {
                    Files.move(tempPath, databasePath, StandardCopyOption.REPLACE_EXISTING);
                }
            } catch (IOException exception) {
                log.error("Failed to write song database", exception);
            }
        }
    }

    public Song addNewSong(String title, String videoUrl, double duration, String lyrics, List<Double> pitch) {
        String newId;
        Song newSong;
        synchronized (databaseLock) {
            newId = "S" + String.format("%03d", nextSongNumber());
            newSong = new Song(newId, title, videoUrl, duration, duration, lyrics, pitch);
            songBank.add(newSong);
            saveSongsToDatabase();
        }
        return newSong;
    }

    private int nextSongNumber() {
        int max = 0;
        for (Song song : songBank) {
            if (song.getId() == null) {
                continue;
            }
            Matcher matcher = SONG_ID_PATTERN.matcher(song.getId());
            if (matcher.matches()) {
                try {
                    max = Math.max(max, Integer.parseInt(matcher.group(1)));
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return max + 1;
    }

    public boolean hasSongs() {
        return !songBank.isEmpty();
    }

    public int maxRounds() {
        return Math.min(maxRounds, songBank.size());
    }

    public void handleGameMessage(String roomId, SocketMessage message, String userId) {
        if (roomId == null || message == null || message.getType() == null || userId == null) {
            return;
        }
        Room room = roomService.getRoom(roomId);
        if (room == null || room.getUserById(userId) == null) {
            return;
        }
        roomService.touch(roomId);

        switch (message.getType()) {
            case PLAY_SEGMENT:
                startGameByHost(roomId, userId);
                break;
            case BATTLE:
                handleUserClick(roomId, userId);
                break;
            case RTC_SIGNAL:
                handleRtcSignal(roomId, userId, message.getContent());
                break;
            case JOIN:
                broadcastMessage(roomId, MessageType.JOIN, room.getUsers());
                if (room.getGameState() == GameState.LOBBY) {
                    lobbyPhase(roomId);
                }
                break;
            case KICK_PLAYER:
                handleUserKick(roomId, userId, message.getContent());
                break;
            case TOGGLE_READY:
                handleToggleReady(roomId, userId);
                break;
            case LEAVE:
                handleUserLeave(roomId, userId);
                break;
            case RENAME:
                handleRename(roomId, userId, message.getContent());
                break;
            case USER_LYRICS:
                handleUserLyrics(roomId, userId, message.getContent());
                break;
            case PERFORMANCE_EVALUATION:
                handleEvaluationRequest(roomId, userId);
                break;
        }
    }

    private void handleRename(String roomId, String userId, Object content) {
        if (!(content instanceof Map<?, ?> map)) {
            return;
        }
        Object nameObj = map.get("userName");
        if (!(nameObj instanceof String name)) {
            return;
        }
        Room renamedRoom = roomService.renameUser(roomId, userId, name);
        if (renamedRoom != null) {
            broadcastMessage(roomId, MessageType.JOIN, renamedRoom.getUsers());
            if (renamedRoom.getGameState() == GameState.LOBBY) {
                lobbyPhase(roomId);
            }
        }
    }

    private void handleUserLyrics(String roomId, String userId, Object content) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        Song currentSong = room.getCurrentSong();
        User performer = room.getCurrentPerformanceUser();
        if (currentSong == null || performer == null || !performer.getUserId().equals(userId)) {
            return;
        }
        GameState state = room.getGameState();
        if (state != GameState.PERFORMANCE && state != GameState.PERFORMANCE_EVALUATION) {
            return;
        }
        if (!(content instanceof Map<?, ?> map)) {
            return;
        }

        Object clientSongId = map.get("songId");
        if (clientSongId instanceof String songId && !songId.equals(currentSong.getId())) {
            return;
        }

        Object lyricsObj = map.get("lyrics");
        String lyrics = lyricsObj instanceof String rawLyrics ? rawLyrics : "";
        if (lyrics.length() > MAX_LYRICS_LENGTH) {
            lyrics = lyrics.substring(0, MAX_LYRICS_LENGTH);
        }

        List<Double> userPitch = new ArrayList<>();
        Object pitchObj = map.get("pitchContour");
        if (pitchObj instanceof List<?> pitchList) {
            for (Object sample : pitchList) {
                if (userPitch.size() >= MAX_PITCH_SAMPLES) {
                    break;
                }
                if (sample instanceof Number number) {
                    double value = number.doubleValue();
                    if (Double.isFinite(value)) {
                        userPitch.add(value);
                    }
                }
            }
        }

        evaluatePerformance(roomId, userId, lyrics, userPitch);
    }

    private void handleEvaluationRequest(String roomId, String userId) {
        Room room = roomService.getRoom(roomId);
        if (room == null || room.getGameState() != GameState.PERFORMANCE) {
            return;
        }
        User performer = room.getCurrentPerformanceUser();
        if (performer == null || !performer.getUserId().equals(userId)) {
            return;
        }
        cancelPerformanceTimer(roomId);
        startAIEvaluatePhase(roomId);
    }

    private void handleRtcSignal(String roomId, String userId, Object content) {
        if (!(content instanceof Map<?, ?> payload)) {
            return;
        }
        Object toObj = payload.get("to");
        Object actionObj = payload.get("action");
        if (!(toObj instanceof String targetId) || !(actionObj instanceof String action)) {
            return;
        }
        if (!ALLOWED_RTC_ACTIONS.contains(action)) {
            return;
        }
        Room room = roomService.getRoom(roomId);
        if (room == null || room.getUserById(targetId) == null || targetId.equals(userId)) {
            return;
        }

        Map<String, Object> safePayload = new HashMap<>();
        safePayload.put("action", action);
        safePayload.put("from", userId);
        safePayload.put("to", targetId);
        if ("candidate".equals(action)) {
            Object candidate = payload.get("candidate");
            if (!(candidate instanceof Map) || !withinPayloadLimit(candidate)) {
                return;
            }
            safePayload.put("candidate", candidate);
        } else {
            Object sdp = payload.get("sdp");
            if (!(sdp instanceof Map) || !withinPayloadLimit(sdp)) {
                return;
            }
            safePayload.put("sdp", sdp);
        }
        broadcast(roomId, new SocketMessage(MessageType.RTC_SIGNAL, safePayload, userId, roomId));
    }

    private boolean withinPayloadLimit(Object value) {
        try {
            return objectMapper.writeValueAsString(value).length() <= MAX_RTC_PAYLOAD_CHARS;
        } catch (IOException exception) {
            return false;
        }
    }

    private double[] analyzePitch(List<Double> pitches) {
        List<Double> notes = new ArrayList<>();
        for (Double hz : pitches) {
            if (hz != null && hz > 50 && hz < 2000) {
                notes.add(12 * (Math.log(hz / 440.0) / Math.log(2)));
            }
        }
        if (notes.size() < 2) {
            return new double[] { 0.0, 0.0 };
        }

        Collections.sort(notes);
        int trim = (int) (notes.size() * 0.05);
        List<Double> cleanNotes = notes.subList(trim, notes.size() - trim);
        if (cleanNotes.isEmpty()) {
            cleanNotes = notes;
        }
        double sum = 0;
        for (double note : cleanNotes) {
            sum += note;
        }
        double mean = sum / cleanNotes.size();
        double varianceSum = 0;
        for (double note : cleanNotes) {
            varianceSum += Math.pow(note - mean, 2);
        }
        double variance = Math.sqrt(varianceSum / cleanNotes.size());
        return new double[] { mean, variance };
    }

    double calculateToneScore(List<Double> userPitch, List<Double> originalPitch) {
        if (userPitch == null || userPitch.isEmpty() || originalPitch == null || originalPitch.isEmpty()) {
            log.info("Tone skipped: empty contour (user={} original={})",
                    userPitch == null ? 0 : userPitch.size(),
                    originalPitch == null ? 0 : originalPitch.size());
            return 0.0;
        }

        // Silences between phrases arrive as 0 Hz. Keeping them in the DTW alignment
        // masquerades as a 5-semitone error and drags every real attempt to 0 points.
        List<Double> userSamples = voicedSamples(limitSamples(userPitch));
        List<Double> originalSamples = voicedSamples(limitSamples(originalPitch));
        if (userSamples.size() < 2 || originalSamples.size() < 2) {
            log.info("Tone skipped: not enough voiced samples (user={} original={})",
                    userSamples.size(), originalSamples.size());
            return 0.0;
        }

        double[] userStats = analyzePitch(userSamples);
        double[] origStats = analyzePitch(originalSamples);

        double userMean = userStats[0];
        double origMean = origStats[0];
        double userVar = userStats[1];
        double origVar = origStats[1];

        double keyShift = origMean - userMean;
        int n = userSamples.size();
        int m = originalSamples.size();
        double[][] dtw = new double[n + 1][m + 1];
        for (int i = 0; i <= n; i++) {
            Arrays.fill(dtw[i], Double.MAX_VALUE);
        }
        dtw[0][0] = 0;

        double stretchPenalty = 2.0;

        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= m; j++) {
                double cost = noteCost(userSamples.get(i - 1), originalSamples.get(j - 1), keyShift);
                double match = dtw[i - 1][j - 1];
                double insert = dtw[i - 1][j] + stretchPenalty;
                double delete = dtw[i][j - 1] + stretchPenalty;

                dtw[i][j] = cost + Math.min(match, Math.min(insert, delete));
            }
        }

        // Score a high-percentile alignment cost rather than the mean: a few detections
        // during note transitions are garbage and would otherwise dominate the average,
        // while the upper part of the distribution still punishes a wandering melody.
        double averageDeviation = alignmentDeviation(dtw, userSamples, originalSamples, keyShift, stretchPenalty);

        double score = Math.max(0, 100 - (averageDeviation * 14));
        if (origVar > 1.2 && userVar < 0.6) {
            score = 0.0;
        }
        // Singing only a short fragment used to score highly because DTW can stretch
        // those few notes over the whole song; scale it down until most of it is sung.
        double coverage = Math.min(1.0, (double) n / m);
        score *= Math.min(1.0, coverage / 0.6);

        log.info("Tone detail: userSamples={} originalSamples={} userVar={} origVar={} keyShift={} avgDeviation={} score={}",
                n, m, round2(userVar), round2(origVar), round2(keyShift), round2(averageDeviation),
                Math.round(score));
        return score;
    }

    private double noteCost(double userHz, double originalHz, double keyShift) {
        double userNote = 12 * (Math.log(userHz / 440.0) / Math.log(2)) + keyShift;
        double originalNote = 12 * (Math.log(originalHz / 440.0) / Math.log(2));
        return Math.abs(userNote - originalNote);
    }

    private double alignmentDeviation(double[][] dtw, List<Double> userSamples, List<Double> originalSamples,
            double keyShift, double stretchPenalty) {
        List<Double> costs = new ArrayList<>();
        int i = userSamples.size();
        int j = originalSamples.size();
        while (i > 0 && j > 0) {
            double best = dtw[i][j];
            double cost = noteCost(userSamples.get(i - 1), originalSamples.get(j - 1), keyShift);
            // Each transition pays the cell cost first, mirroring the DP fill. Omitting it
            // from the stretch checks made every non-diagonal step look impossible, so the
            // walk just slid along the last row and ignored half of the performance.
            if (withinTolerance(best, cost + dtw[i - 1][j - 1])) {
                costs.add(cost);
                i--;
                j--;
            } else if (withinTolerance(best, cost + stretchPenalty + dtw[i - 1][j])) {
                i--;
            } else if (withinTolerance(best, cost + stretchPenalty + dtw[i][j - 1])) {
                j--;
            } else {
                i--;
                j--;
            }
        }
        if (costs.isEmpty()) {
            return 0.0;
        }
        costs.sort(Double::compareTo);
        int index = (int) Math.round(costs.size() * 0.7);
        return costs.get(Math.min(costs.size() - 1, index));
    }

    private static boolean withinTolerance(double actual, double expected) {
        return Math.abs(actual - expected) <= 1e-9 * Math.max(1.0, Math.abs(expected));
    }

    private List<Double> voicedSamples(List<Double> samples) {
        List<Double> voiced = new ArrayList<>(samples.size());
        for (Double hz : samples) {
            if (hz != null && hz > 50 && hz < 2000) {
                voiced.add(hz);
            }
        }
        return voiced;
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private List<Double> limitSamples(List<Double> samples) {
        if (samples.size() <= MAX_PITCH_SAMPLES) {
            return samples;
        }
        List<Double> limited = new ArrayList<>(MAX_PITCH_SAMPLES);
        double step = (double) samples.size() / MAX_PITCH_SAMPLES;
        for (int i = 0; i < MAX_PITCH_SAMPLES; i++) {
            limited.add(samples.get(Math.min(samples.size() - 1, (int) (i * step))));
        }
        return limited;
    }

    boolean lyricsUnavailable(String userLyrics, String originalLyrics) {
        String cleanOriginal = normalizeText(originalLyrics);
        if (cleanOriginal.isEmpty()) {
            return true;
        }
        String cleanUser = normalizeText(userLyrics);
        return cleanUser.length() < Math.max(3, Math.round(cleanOriginal.length() * 0.2));
    }

    public double calculateLyricsScore(String userLyrics, String originalLyrics) {
        String cleanUserLyrics = truncate(normalizeText(userLyrics), MAX_TEXT_LENGTH);
        String cleanOriginalLyrics = truncate(normalizeText(originalLyrics), MAX_TEXT_LENGTH);

        int maxLength = Math.max(cleanUserLyrics.length(), cleanOriginalLyrics.length());
        if (maxLength == 0) {
            return 0;
        }
        int distance = LevenshteinDistance.getDefaultInstance().apply(cleanUserLyrics, cleanOriginalLyrics);
        return (1.0 - ((double) distance / maxLength)) * 100;
    }

    private String truncate(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    public void evaluatePerformance(String roomId, String userId, String userLyrics, List<Double> userPitchContour) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }

        User performanceUser;
        Song currentSong;
        synchronized (room) {
            GameState state = room.getGameState();
            if (state != GameState.PERFORMANCE && state != GameState.PERFORMANCE_EVALUATION) {
                return;
            }
            performanceUser = room.getCurrentPerformanceUser();
            currentSong = room.getCurrentSong();
            if (performanceUser == null || currentSong == null) {
                return;
            }
            if (userId != null && !performanceUser.getUserId().equals(userId)) {
                return;
            }
            room.setGameState(GameState.SCORE_SHOW);
        }

        cancelPerformanceTimer(roomId);
        cancelEvaluationTimer(roomId);

        double lyricsScore = calculateLyricsScore(userLyrics, currentSong.getOriginalLyrics());
        double toneScore = calculateToneScore(userPitchContour, currentSong.getOriginalPitchContour());
        // Browsers without SpeechRecognition send an empty transcript even when the
        // performance was fine. Scoring that as 0 lyrics capped everyone at 60 points,
        // so use the tone score alone when lyric recognition clearly failed.
        boolean lyricsUnavailable = lyricsUnavailable(userLyrics, currentSong.getOriginalLyrics());
        double finalScore = lyricsUnavailable ? toneScore : (lyricsScore * 0.4) + (toneScore * 0.6);
        boolean isSuccess = finalScore >= 70.0;

        log.info("Score room={} user={} lyrics={} tone={} total={} lyricsUnavailable={}",
                roomId, performanceUser.getUserId(), Math.round(lyricsScore), Math.round(toneScore),
                Math.round(finalScore), lyricsUnavailable);
        if (isSuccess) {
            performanceUser.setScore(performanceUser.getScore() + 1);
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("user", performanceUser);
        payload.put("isSuccess", isSuccess);

        room.setCurrentVideoId(null);
        broadcastState(roomId, GameState.SCORE_SHOW, payload);
        scheduleNextPhase(roomId);
    }

    private void scheduleNextPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        boolean endGame = maxRounds() == 0 || room.getCurrentRound() >= maxRounds();
        scheduler.schedule(() -> {
            if (endGame) {
                startEndGamePhase(roomId);
            } else {
                startGame(roomId);
            }
        }, NEXT_PHASE_DELAY_SECONDS, TimeUnit.SECONDS);
    }

    private String normalizeText(String text) {
        if (text == null) {
            return "";
        }
        String normalized = Normalizer.normalize(text.toLowerCase(), Normalizer.Form.NFD);
        normalized = normalized.replaceAll("\\p{M}", "");
        normalized = normalized.replaceAll("\\s+", " ");
        normalized = normalized.replaceAll("[^a-z0-9 ]", "");
        return normalized.trim();
    }

    public void handleToggleReady(String roomId, String userId) {
        Room room = roomService.getRoom(roomId);
        if (room == null || room.getGameState() != GameState.LOBBY) {
            return;
        }
        User user = room.getUserById(userId);
        if (user == null) {
            return;
        }
        user.setReady(!user.isReady());
        lobbyPhase(roomId);
    }

    public void lobbyPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        room.setGameState(GameState.LOBBY);
        broadcastState(roomId, GameState.LOBBY, room.getUsers());

        if (room.getUpcomingSong() != null || !hasSongs()) {
            return;
        }
        Song upcoming = pickRandomSong(room);
        if (upcoming == null) {
            return;
        }
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

    public void handleUserKick(String roomId, String hostId, Object targetContent) {
        Room room = roomService.getRoom(roomId);
        if (room == null || !(targetContent instanceof String targetId) || targetId.isBlank()
                || targetId.equals(hostId)) {
            return;
        }
        User host = room.getUserById(hostId);
        if (host == null || !host.isHost() || room.getUserById(targetId) == null) {
            return;
        }
        roomService.leaveRoom(roomId, targetId);
        roomService.revokeUserSessions(roomId, targetId);
        broadcast(roomId, new SocketMessage(MessageType.KICK_PLAYER, targetId, SERVER_SENDER, roomId));

        Room updated = roomService.getRoom(roomId);
        if (updated == null) {
            return;
        }
        if (updated.getGameState() == GameState.LOBBY) {
            lobbyPhase(roomId);
        } else {
            broadcastMessage(roomId, MessageType.JOIN, updated.getUsers());
        }
    }

    public void handleUserLeave(String roomId, String userId) {
        roomService.revokeUserSessions(roomId, userId);
        roomService.leaveRoom(roomId, userId);
        notifyRoomUpdate(roomId);
    }

    public void notifyRoomUpdate(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room != null) {
            broadcastMessage(roomId, MessageType.JOIN, room.getUsers());
        }
    }

    public void startGameByHost(String roomId, String userId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        User user = room.getUserById(userId);
        if (user == null || !user.isHost()) {
            return;
        }
        if (room.getGameState() != GameState.LOBBY) {
            return;
        }
        if (!hasSongs()) {
            broadcastMessage(roomId, MessageType.LOBBY, "Chưa có bài hát nào trong hệ thống.");
            return;
        }
        startGame(roomId);
    }

    public void startGame(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null || !hasSongs()) {
            return;
        }
        Song song = room.getUpcomingSong();
        if (song == null) {
            song = pickRandomSong(room);
        }
        if (song == null) {
            return;
        }
        Song nextSong = pickRandomSong(room);

        synchronized (room) {
            if (room.getUsers().isEmpty()) {
                return;
            }
            room.setCurrentRound(room.getCurrentRound() + 1);
            room.setCurrentPerformanceUser(null);
            room.setCurrentSong(song);
            room.setUpcomingSong(nextSong);
            room.setCurrentVideoId(song.getId());
            room.setGameState(GameState.PLAY_SEGMENT);
        }

        broadcastState(roomId, GameState.PLAY_SEGMENT,
                new MusicInfo(
                        song.getVideoUrl(),
                        0,
                        System.currentTimeMillis(),
                        true,
                        nextSong != null ? nextSong.getVideoUrl() : null,
                        song.getId(),
                        nextSong != null ? nextSong.getId() : null));
        long listenDelayMillis = Math.max(0L, (long) (song.getListenDuration() * 1000));
        scheduler.schedule(() -> startBuzzerPhase(roomId), listenDelayMillis, TimeUnit.MILLISECONDS);
    }

    public void startBuzzerPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        synchronized (room) {
            room.getBuzzerCount().clear();
            room.setGameState(GameState.BATTLE);
        }
        broadcastState(roomId, GameState.BATTLE, "");
        scheduler.schedule(() -> endBuzzerPhase(roomId), BUZZER_DURATION_SECONDS, TimeUnit.SECONDS);
    }

    public void endBuzzerPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        Map<String, Integer> buzzerCount = room.getBuzzerCount();
        if (buzzerCount.isEmpty()) {
            room.setCurrentPerformanceUser(null);
            broadcastMessage(roomId, MessageType.NO_WINNER, "Không ai giành mic");
            scheduleCountdownThenNext(roomId);
            return;
        }

        int maxScore = buzzerCount.values().stream().max(Integer::compareTo).orElse(0);
        List<String> topUsers = buzzerCount.entrySet().stream()
                .filter(entry -> entry.getValue() == maxScore)
                .map(Map.Entry::getKey)
                .toList();
        String winnerId = topUsers.get(ThreadLocalRandom.current().nextInt(topUsers.size()));
        User winner = room.getUserById(winnerId);
        buzzerCount.clear();
        if (winner == null) {
            room.setCurrentPerformanceUser(null);
            broadcastMessage(roomId, MessageType.NO_WINNER, "Không ai giành mic");
            scheduleCountdownThenNext(roomId);
            return;
        }

        room.setCurrentPerformanceUser(winner);
        room.setGameState(GameState.WINNER_SHOW);
        broadcastState(roomId, GameState.WINNER_SHOW, winner);
        scheduler.schedule(() -> startCountdownPhase(roomId, () -> startPerformancePhase(roomId)),
                COUNTDOWN_DURATION_SECONDS, TimeUnit.SECONDS);
    }

    private void scheduleCountdownThenNext(String roomId) {
        if (maxRounds() == 0) {
            scheduler.schedule(() -> startCountdownPhase(roomId, () -> startEndGamePhase(roomId)), 1,
                    TimeUnit.SECONDS);
        } else {
            scheduler.schedule(() -> startCountdownPhase(roomId, () -> startGame(roomId)), 1, TimeUnit.SECONDS);
        }
    }

    public void startCountdownPhase(String roomId, Runnable nextStep) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        room.setGameState(GameState.COUNTDOWN);
        broadcastState(roomId, GameState.COUNTDOWN, "");
        scheduler.schedule(nextStep, COUNTDOWN_DURATION_SECONDS, TimeUnit.SECONDS);
    }

    public void startPerformancePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        Song currentSong = room.getCurrentSong();
        if (currentSong == null || room.getCurrentPerformanceUser() == null) {
            scheduleNextPhase(roomId);
            return;
        }
        room.setGameState(GameState.PERFORMANCE);
        broadcastState(roomId, GameState.PERFORMANCE, currentSong.getOriginalLyrics());
        ScheduledFuture<?> timer = scheduler.schedule(() -> {
            performanceTimers.remove(roomId);
            startAIEvaluatePhase(roomId);
        }, PERFORMANCE_DURATION_MILLIS, TimeUnit.MILLISECONDS);
        cancelPerformanceTimer(roomId);
        performanceTimers.put(roomId, timer);
    }

    public void startAIEvaluatePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        if (room.getCurrentPerformanceUser() == null || room.getCurrentSong() == null) {
            scheduleNextPhase(roomId);
            return;
        }
        synchronized (room) {
            if (room.getGameState() != GameState.PERFORMANCE) {
                return;
            }
            room.setGameState(GameState.PERFORMANCE_EVALUATION);
        }
        broadcastState(roomId, GameState.PERFORMANCE_EVALUATION, "");

        cancelEvaluationTimer(roomId);
        ScheduledFuture<?> fallback = scheduler.schedule(() -> {
            evaluationTimers.remove(roomId);
            Room current = roomService.getRoom(roomId);
            if (current != null && current.getGameState() == GameState.PERFORMANCE_EVALUATION) {
                evaluatePerformance(roomId, null, "", List.of());
            }
        }, EVALUATION_FALLBACK_SECONDS, TimeUnit.SECONDS);
        evaluationTimers.put(roomId, fallback);
    }

    private void cancelPerformanceTimer(String roomId) {
        ScheduledFuture<?> timer = performanceTimers.remove(roomId);
        if (timer != null) {
            timer.cancel(false);
        }
    }

    private void cancelEvaluationTimer(String roomId) {
        ScheduledFuture<?> timer = evaluationTimers.remove(roomId);
        if (timer != null) {
            timer.cancel(false);
        }
    }

    public void startEndGamePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        room.setGameState(GameState.END_GAME);
        broadcastState(roomId, GameState.END_GAME, "");
        scheduler.schedule(() -> resetGame(roomId), END_GAME_DELAY_SECONDS, TimeUnit.SECONDS);
    }

    public void resetGame(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        room.setCurrentRound(0);
        room.setUpcomingSong(null);
        room.setCurrentSong(null);
        room.setCurrentPerformanceUser(null);
        room.setCurrentVideoId(null);
        room.getPlayedSongIds().clear();
        room.getBuzzerCount().clear();
        for (User user : room.getUsers()) {
            user.setScore(0);
            user.setReady(false);
        }
        lobbyPhase(roomId);
    }

    public void handleUserClick(String roomId, String userId) {
        Room room = roomService.getRoom(roomId);
        if (room == null || room.getGameState() != GameState.BATTLE || room.getUserById(userId) == null) {
            return;
        }
        room.getBuzzerCount().merge(userId, 1, Integer::sum);
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
        List<Song> availableSongs = songBank.stream()
                .filter(Objects::nonNull)
                .filter(song -> song.getId() != null && !room.getPlayedSongIds().contains(song.getId()))
                .toList();
        if (availableSongs.isEmpty()) {
            room.getPlayedSongIds().clear();
            availableSongs = songBank.stream().filter(Objects::nonNull).toList();
        }
        if (availableSongs.isEmpty()) {
            return null;
        }
        Song pickedSong = availableSongs.get(ThreadLocalRandom.current().nextInt(availableSongs.size()));
        room.getPlayedSongIds().add(pickedSong.getId());
        return pickedSong;
    }
}
