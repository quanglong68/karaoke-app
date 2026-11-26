package com.karaoke.backend.service;

import com.karaoke.backend.model.*;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;

@Service
public class GameService {
    private static final Logger log = LoggerFactory.getLogger(GameService.class);

    private static final String SERVER_SENDER = "server";
    private static final int MAX_LYRICS_LENGTH = 2_000;
    private static final int MAX_PITCH_SAMPLES = 2_000;
    private static final double MAX_INPUT_PITCH_HZ = 2_000.0;
    private static final double MILLIS_PER_SECOND = 1_000.0;
    private static final long KICK_SOCKET_CLOSE_DELAY_MILLIS = 150L;
    // Buzzer rounds count clicks. Without a server-side floor a script can send
    // dozens of clicks per second and always win.
    private static final long MIN_BUZZER_CLICK_INTERVAL_MILLIS = 100L;

    private final ScheduledExecutorService scheduler;
    private final Map<String, ScheduledFuture<?>> performanceTimers = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> evaluationTimers = new ConcurrentHashMap<>();
    private final Map<String, Long> performanceStartMillis = new ConcurrentHashMap<>();

    private final RoomService roomService;
    private final SimpMessagingTemplate messagingTemplate;
    private final SongCatalog songCatalog;
    private final PerformanceScorer performanceScorer;
    private final RtcSignalRouter rtcSignalRouter;

    @Autowired
    public GameService(RoomService roomService, SimpMessagingTemplate messagingTemplate, SongCatalog songCatalog,
            PerformanceScorer performanceScorer, RtcSignalRouter rtcSignalRouter) {
        this(roomService, messagingTemplate, songCatalog, performanceScorer, rtcSignalRouter, newScheduler());
    }

    GameService(RoomService roomService, SimpMessagingTemplate messagingTemplate, SongCatalog songCatalog) {
        this(roomService, messagingTemplate, songCatalog, new PerformanceScorer(),
                new RtcSignalRouter(roomService, messagingTemplate), newScheduler());
    }

    GameService(RoomService roomService, SimpMessagingTemplate messagingTemplate, SongCatalog songCatalog,
            ScheduledExecutorService scheduler) {
        this(roomService, messagingTemplate, songCatalog, new PerformanceScorer(),
                new RtcSignalRouter(roomService, messagingTemplate), scheduler);
    }

    GameService(RoomService roomService, SimpMessagingTemplate messagingTemplate, SongCatalog songCatalog,
            PerformanceScorer performanceScorer, RtcSignalRouter rtcSignalRouter, ScheduledExecutorService scheduler) {
        this.roomService = roomService;
        this.messagingTemplate = messagingTemplate;
        this.songCatalog = songCatalog;
        this.performanceScorer = performanceScorer != null ? performanceScorer : new PerformanceScorer();
        this.rtcSignalRouter = rtcSignalRouter != null
                ? rtcSignalRouter
                : new RtcSignalRouter(roomService, messagingTemplate);
        this.scheduler = scheduler;
        if (roomService != null) {
            // Rooms are removed by RoomService (empty/evicted); drop their timers here
            // so performanceStartMillis cannot grow without bound.
            roomService.addRoomRemovalListener(this::forgetRoom);
        }
    }

    private static ScheduledExecutorService newScheduler() {
        return Executors.newScheduledThreadPool(10, runnable -> {
            Thread thread = new Thread(runnable, "game-scheduler");
            thread.setDaemon(true);
            return thread;
        });
    }

    public Song addNewSong(String title, String videoUrl, String vocalUrl, double duration, String lyrics,
            List<Double> pitch) {
        return addNewSong(title, videoUrl, vocalUrl, duration, lyrics, pitch, null);
    }

    public Song addNewSong(String title, String videoUrl, String vocalUrl, double duration, String lyrics,
            List<Double> pitch, String createdBy) {
        return songCatalog.addSong(title, videoUrl, vocalUrl, duration, lyrics, pitch, createdBy);
    }

    public boolean hasSongs() {
        return songCatalog.hasSongs();
    }

    private int maxRounds(Room room) {
        return Math.min(room.settingsOrDefault().maxRounds(), songCatalog.songCount());
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
                rtcSignalRouter.route(roomId, userId, message.getContent());
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
        if (state != GameState.PERFORMANCE_EVALUATION) {
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

        List<Double> userPitch = extractValidPitchContour(map.get("pitchContour"));
        evaluatePerformance(roomId, userId, lyrics, userPitch);
    }

    private List<Double> extractValidPitchContour(Object rawPitch) {
        if (!(rawPitch instanceof List<?> pitchList)) {
            return List.of();
        }
        List<Double> userPitch = new ArrayList<>();
        for (Object sample : pitchList) {
            if (userPitch.size() >= MAX_PITCH_SAMPLES) {
                break;
            }
            if (sample instanceof Number number) {
                double value = number.doubleValue();
                // Human voice (and silence as 0 Hz) only; clients could otherwise
                // push arbitrary magnitudes into the DTW cost function.
                if (Double.isFinite(value) && value >= 0 && value <= MAX_INPUT_PITCH_HZ) {
                    userPitch.add(value);
                }
            }
        }
        return userPitch;
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
        Long startedAt = performanceStartMillis.get(roomId);
        if (startedAt != null
                && System.currentTimeMillis() - startedAt < room.settingsOrDefault().minPerformanceMillis()) {
            return;
        }
        cancelPerformanceTimer(roomId);
        startAIEvaluatePhase(roomId);
    }

    double calculateToneScore(List<Double> userPitch, List<Double> originalPitch) {
        return performanceScorer.calculateToneScore(userPitch, originalPitch);
    }

    boolean lyricsUnavailable(String userLyrics, String originalLyrics) {
        return performanceScorer.lyricsUnavailable(userLyrics, originalLyrics);
    }

    public double calculateLyricsScore(String userLyrics, String originalLyrics) {
        return performanceScorer.calculateLyricsScore(userLyrics, originalLyrics);
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
        performanceStartMillis.remove(roomId);

        double lyricsScore = calculateLyricsScore(userLyrics, currentSong.getOriginalLyrics());
        double toneScore = calculateToneScore(userPitchContour, currentSong.getOriginalPitchContour());
        // Browsers without SpeechRecognition send an empty transcript even when the
        // performance was fine. Scoring that as 0 lyrics capped everyone at 60 points,
        // so use the tone score alone when lyric recognition clearly failed.
        boolean lyricsUnavailable = lyricsUnavailable(userLyrics, currentSong.getOriginalLyrics());
        GameSettings settings = room.settingsOrDefault();
        double lyricsWeight = settings.lyricsWeight();
        double finalScore = lyricsUnavailable
                ? toneScore
                : (lyricsScore * lyricsWeight) + (toneScore * (1.0 - lyricsWeight));
        boolean isSuccess = finalScore >= settings.successScore();

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
        boolean endGame = maxRounds(room) == 0 || room.getCurrentRound() >= maxRounds(room);
        scheduler.schedule(() -> {
            if (endGame) {
                startEndGamePhase(roomId);
            } else {
                startGame(roomId);
            }
        }, room.settingsOrDefault().nextPhaseDelaySeconds(), TimeUnit.SECONDS);
    }

    public void handleToggleReady(String roomId, String userId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        synchronized (room) {
            if (room.getGameState() != GameState.LOBBY) {
                return;
            }
            User user = room.getUserById(userId);
            if (user == null) {
                return;
            }
            user.setReady(!user.isReady());
        }
        lobbyPhase(roomId);
    }

    public void lobbyPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        Song upcoming = null;
        synchronized (room) {
            // A join/rename/ready racing a START must not pull the room back to LOBBY.
            if (room.getGameState() != GameState.LOBBY) {
                return;
            }
            if (room.getUpcomingSong() == null && hasSongs()) {
                upcoming = pickRandomSong(room);
                if (upcoming != null) {
                    room.setUpcomingSong(upcoming);
                }
            }
        }
        broadcastState(roomId, GameState.LOBBY, room.getUsers());
        if (upcoming == null) {
            return;
        }
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
        List<String> kickedSessions = roomService.detachUserSessions(roomId, targetId);
        leaveUserAndAdvance(roomId, targetId);
        broadcast(roomId, new SocketMessage(MessageType.KICK_PLAYER, targetId, SERVER_SENDER, roomId));
        if (!kickedSessions.isEmpty()) {
            // Delay the hard socket close briefly so the KICK_PLAYER frame flushes to the
            // kicked client; its session token and presence are already revoked above.
            scheduler.schedule(() -> roomService.closeWebSocketSessions(kickedSessions),
                    KICK_SOCKET_CLOSE_DELAY_MILLIS, TimeUnit.MILLISECONDS);
        }

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
        leaveUserAndAdvance(roomId, userId);
        notifyRoomUpdate(roomId);
    }

    /**
     * Removes the member and keeps the round moving. Kick, LEAVE, the disconnect grace
     * path and the HTTP leave endpoint all funnel through here so a departing singer
     * cannot leave the room parked on the performance screen until the 60s timer fires.
     */
    private void leaveUserAndAdvance(String roomId, String userId) {
        if (roomService.leaveRoom(roomId, userId)) {
            handlePerformerDeparted(roomId);
        }
    }

    private void handlePerformerDeparted(String roomId) {
        cancelPerformanceTimer(roomId);
        cancelEvaluationTimer(roomId);
        performanceStartMillis.remove(roomId);
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        synchronized (room) {
            if (room.getGameState() != GameState.PERFORMANCE
                    && room.getGameState() != GameState.PERFORMANCE_EVALUATION) {
                return;
            }
            room.setCurrentPerformanceUser(null);
            room.setCurrentVideoId(null);
            // Leave the performance state inside the same lock so concurrent leave/kick
            // paths cannot both schedule a round transition.
            room.setGameState(GameState.COUNTDOWN);
        }
        broadcastMessage(roomId, MessageType.NO_WINNER, "Người hát đã rời phòng");
        scheduleCountdownThenNext(roomId);
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
        boolean missingSongs = false;
        Song[] selected = null;
        synchronized (room) {
            User user = room.getUserById(userId);
            if (user == null || !user.isHost()) {
                return;
            }
            if (room.getGameState() != GameState.LOBBY) {
                return;
            }
            boolean everyoneReady = room.getUsers().size() >= 2
                    && room.getUsers().stream().allMatch(member -> member.isHost() || member.isReady());
            if (!everyoneReady) {
                return;
            }
            if (!hasSongs()) {
                missingSongs = true;
            } else {
                selected = prepareRoundLocked(room);
            }
        }
        if (missingSongs) {
            broadcastMessage(roomId, MessageType.LOBBY, "Chưa có bài hát nào trong hệ thống.");
            return;
        }
        if (selected != null) {
            launchPreparedRound(roomId, selected[0], selected[1]);
        }
    }

    public void startGame(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null || !hasSongs()) {
            return;
        }
        Song[] selected;
        synchronized (room) {
            GameState state = room.getGameState();
            if (state != GameState.LOBBY && state != GameState.SCORE_SHOW && state != GameState.COUNTDOWN) {
                return;
            }
            selected = prepareRoundLocked(room);
        }
        if (selected != null) {
            launchPreparedRound(roomId, selected[0], selected[1]);
        }
    }

    private Song[] prepareRoundLocked(Room room) {
        if (room.getUsers().isEmpty()) {
            return null;
        }
        Song song = room.getUpcomingSong();
        if (song == null) {
            song = pickRandomSong(room);
        }
        if (song == null) {
            return null;
        }
        Song nextSong = pickRandomSong(room);
        room.setCurrentRound(room.getCurrentRound() + 1);
        room.setCurrentPerformanceUser(null);
        room.setCurrentSong(song);
        room.setUpcomingSong(nextSong);
        room.setCurrentVideoId(song.getId());
        room.setGameState(GameState.PLAY_SEGMENT);
        return new Song[] { song, nextSong };
    }

    private void launchPreparedRound(String roomId, Song song, Song nextSong) {
        broadcastState(roomId, GameState.PLAY_SEGMENT,
                new MusicInfo(
                        song.getVideoUrl(),
                        0,
                        System.currentTimeMillis(),
                        true,
                        nextSong != null ? nextSong.getVideoUrl() : null,
                        song.getId(),
                        nextSong != null ? nextSong.getId() : null));
        long listenDelayMillis = Math.max(0L, (long) (song.getListenDuration() * MILLIS_PER_SECOND));
        scheduler.schedule(() -> startBuzzerPhase(roomId), listenDelayMillis, TimeUnit.MILLISECONDS);
    }

    public void startBuzzerPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        synchronized (room) {
            if (room.getGameState() != GameState.PLAY_SEGMENT) {
                return;
            }
            room.getBuzzerCount().clear();
            room.getBuzzerLastClickAt().clear();
            room.setGameState(GameState.BATTLE);
        }
        broadcastState(roomId, GameState.BATTLE, "");
        scheduler.schedule(() -> endBuzzerPhase(roomId), room.settingsOrDefault().buzzerSeconds(), TimeUnit.SECONDS);
    }

    public void endBuzzerPhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        User winner;
        synchronized (room) {
            if (room.getGameState() != GameState.BATTLE) {
                return;
            }
            // Read, decide and clear under the same lock as handleUserClick so a click
            // arriving on the 5s boundary is either counted or rejected, never wiped
            // after the maximum was computed.
            Map<String, Integer> buzzerCount = room.getBuzzerCount();
            room.getBuzzerLastClickAt().clear();
            if (buzzerCount.isEmpty()) {
                room.setCurrentPerformanceUser(null);
                winner = null;
            } else {
                int maxScore = buzzerCount.values().stream().max(Integer::compareTo).orElse(0);
                List<String> topUsers = buzzerCount.entrySet().stream()
                        .filter(entry -> entry.getValue() == maxScore)
                        .map(Map.Entry::getKey)
                        .toList();
                String winnerId = topUsers.get(ThreadLocalRandom.current().nextInt(topUsers.size()));
                buzzerCount.clear();
                winner = room.getUserById(winnerId);
                if (winner == null) {
                    room.setCurrentPerformanceUser(null);
                } else {
                    room.setCurrentPerformanceUser(winner);
                    room.setGameState(GameState.WINNER_SHOW);
                }
            }
        }

        if (winner == null) {
            broadcastMessage(roomId, MessageType.NO_WINNER, "Không ai giành mic");
            scheduleCountdownThenNext(roomId);
            return;
        }
        broadcastState(roomId, GameState.WINNER_SHOW, winner);
        scheduler.schedule(() -> startCountdownPhase(roomId, () -> startPerformancePhase(roomId)),
                room.settingsOrDefault().countdownSeconds(), TimeUnit.SECONDS);
    }

    private void scheduleCountdownThenNext(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        boolean endGame = maxRounds(room) == 0 || room.getCurrentRound() >= maxRounds(room);
        if (endGame) {
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
        synchronized (room) {
            GameState state = room.getGameState();
            if (state != GameState.WINNER_SHOW && state != GameState.BATTLE && state != GameState.COUNTDOWN) {
                return;
            }
            room.setGameState(GameState.COUNTDOWN);
        }
        broadcastState(roomId, GameState.COUNTDOWN, "");
        scheduler.schedule(nextStep, room.settingsOrDefault().countdownSeconds(), TimeUnit.SECONDS);
    }

    public void startPerformancePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        Song currentSong;
        synchronized (room) {
            if (room.getGameState() != GameState.COUNTDOWN) {
                return;
            }
            currentSong = room.getCurrentSong();
            if (currentSong == null || room.getCurrentPerformanceUser() == null) {
                currentSong = null;
            } else {
                room.setGameState(GameState.PERFORMANCE);
            }
        }
        if (currentSong == null) {
            scheduleNextPhase(roomId);
            return;
        }
        performanceStartMillis.put(roomId, System.currentTimeMillis());
        broadcastState(roomId, GameState.PERFORMANCE, currentSong.getOriginalLyrics());
        ScheduledFuture<?> timer = scheduler.schedule(() -> {
            performanceTimers.remove(roomId);
            startAIEvaluatePhase(roomId);
        }, room.settingsOrDefault().performanceSecondsMillis(), TimeUnit.MILLISECONDS);
        cancelPerformanceTimer(roomId);
        performanceTimers.put(roomId, timer);
    }

    public void startAIEvaluatePhase(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        boolean missingPerformanceContext = false;
        synchronized (room) {
            if (room.getGameState() != GameState.PERFORMANCE) {
                return;
            }
            if (room.getCurrentPerformanceUser() == null || room.getCurrentSong() == null) {
                // Leave PERFORMANCE atomically inside the lock so concurrent timers
                // or leave paths cannot schedule duplicate round transitions.
                room.setGameState(GameState.COUNTDOWN);
                missingPerformanceContext = true;
            } else {
                room.setGameState(GameState.PERFORMANCE_EVALUATION);
            }
        }
        if (missingPerformanceContext) {
            cancelPerformanceTimer(roomId);
            performanceStartMillis.remove(roomId);
            scheduleNextPhase(roomId);
            return;
        }
        broadcastState(roomId, GameState.PERFORMANCE_EVALUATION, "");

        cancelEvaluationTimer(roomId);
        ScheduledFuture<?> fallback = scheduler.schedule(() -> {
            evaluationTimers.remove(roomId);
            Room current = roomService.getRoom(roomId);
            if (current != null && current.getGameState() == GameState.PERFORMANCE_EVALUATION) {
                evaluatePerformance(roomId, null, "", List.of());
            }
        }, room.settingsOrDefault().evaluationSeconds(), TimeUnit.SECONDS);
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
        synchronized (room) {
            GameState state = room.getGameState();
            if (state == GameState.LOBBY || state == GameState.END_GAME) {
                return;
            }
            room.setGameState(GameState.END_GAME);
        }
        broadcastState(roomId, GameState.END_GAME, "");
        scheduler.schedule(() -> resetGame(roomId), room.settingsOrDefault().endGameDelaySeconds(), TimeUnit.SECONDS);
    }

    public void resetGame(String roomId) {
        Room room = roomService.getRoom(roomId);
        if (room == null) {
            return;
        }
        synchronized (room) {
            if (room.getGameState() != GameState.END_GAME) {
                return;
            }
            room.setGameState(GameState.LOBBY);
            room.setCurrentRound(0);
            room.setUpcomingSong(null);
            room.setCurrentSong(null);
            room.setCurrentPerformanceUser(null);
            room.setCurrentVideoId(null);
            room.getPlayedSongIds().clear();
            room.getBuzzerCount().clear();
            room.getBuzzerLastClickAt().clear();
            for (User user : room.getUsers()) {
                user.setScore(0);
                user.setReady(false);
            }
        }
        performanceStartMillis.remove(roomId);
        lobbyPhase(roomId);
    }

    /**
     * Drops every timer owned by a room that no longer exists.
     */
    public void forgetRoom(String roomId) {
        cancelPerformanceTimer(roomId);
        cancelEvaluationTimer(roomId);
        performanceStartMillis.remove(roomId);
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdownNow();
    }

    public void handleUserClick(String roomId, String userId) {
        Room room = roomService.getRoom(roomId);
        if (room == null || room.getUserById(userId) == null) {
            return;
        }
        long now = System.currentTimeMillis();
        synchronized (room) {
            if (room.getGameState() != GameState.BATTLE) {
                return;
            }
            Long lastClick = room.getBuzzerLastClickAt().get(userId);
            if (lastClick != null && now - lastClick < MIN_BUZZER_CLICK_INTERVAL_MILLIS) {
                return;
            }
            room.getBuzzerLastClickAt().put(userId, now);
            room.getBuzzerCount().merge(userId, 1, Integer::sum);
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
        return songCatalog.pickRandom(room.getPlayedSongIds());
    }
}
