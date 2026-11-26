package com.karaoke.backend.service;

import com.karaoke.backend.config.WebSocketSessionRegistry;
import com.karaoke.backend.model.GameSettings;
import com.karaoke.backend.model.GameState;
import com.karaoke.backend.model.MessageType;
import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.RoomJoinResponse;
import com.karaoke.backend.model.SocketMessage;
import com.karaoke.backend.model.Song;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class GameServiceTest {

    private RoomService roomService;
    private SongCatalog songCatalog;
    private SimpMessagingTemplate messagingTemplate;
    private ScheduledExecutorService scheduler;
    private GameService gameService;
    private final AtomicInteger songCounter = new AtomicInteger();

    @BeforeEach
    void setUp() {
        GameConfigService gameConfigService = mock(GameConfigService.class);
        when(gameConfigService.current()).thenReturn(GameSettings.defaults());
        roomService = new RoomService(mock(SessionService.class), mock(PresenceRegistry.class),
                mock(WebSocketSessionRegistry.class), gameConfigService);
        songCatalog = mock(SongCatalog.class);
        messagingTemplate = mock(SimpMessagingTemplate.class);
        scheduler = mock(ScheduledExecutorService.class);
        doReturn(mock(ScheduledFuture.class)).when(scheduler)
                .schedule(any(Runnable.class), anyLong(), any(TimeUnit.class));

        when(songCatalog.hasSongs()).thenReturn(true);
        when(songCatalog.songCount()).thenReturn(3);
        when(songCatalog.pickRandom(any())).thenAnswer(invocation -> song());

        gameService = new GameService(roomService, messagingTemplate, songCatalog, scheduler);
    }

    private Song song() {
        String id = "S" + songCounter.incrementAndGet();
        return new Song(id, id, "https://video/" + id, 1.0, 4.0, "lyrics", List.of(220.0, 330.0));
    }

    private Room roomWithTwoPlayers() {
        RoomJoinResponse host = roomService.createRoom("Phòng test", "Host");
        roomService.joinRoom(host.getRoom().roomId(), "Guest");
        return roomService.getRoom(host.getRoom().roomId());
    }

    @Test
    void lobbyPhasePicksUpcomingSongOnlyOnce() {
        Room room = roomWithTwoPlayers();
        String roomId = room.getRoomId();

        gameService.lobbyPhase(roomId);
        Song firstUpcoming = room.getUpcomingSong();
        assertNotNull(firstUpcoming);
        gameService.lobbyPhase(roomId);
        assertSame(firstUpcoming, room.getUpcomingSong());

        ArgumentCaptor<SocketMessage> captor = ArgumentCaptor.forClass(SocketMessage.class);
        verify(messagingTemplate, atLeastOnce())
                .convertAndSend(eq("/topic/room/" + roomId), captor.capture());
        long preloads = captor.getAllValues().stream()
                .filter(message -> message.getType() == MessageType.PRELOAD)
                .count();
        assertEquals(1, preloads);
    }

    @Test
    void lobbyPhaseDoesNotResetRoomThatAlreadyStarted() {
        Room room = roomWithTwoPlayers();
        room.setGameState(GameState.PLAY_SEGMENT);

        gameService.lobbyPhase(room.getRoomId());

        assertEquals(GameState.PLAY_SEGMENT, room.getGameState());
        verifyNoInteractions(messagingTemplate);
    }

    @Test
    void buzzerWinnerIsTheUserWithMostClicks() {
        Room room = roomWithTwoPlayers();
        List<String> userIds = room.getUsers().stream().map(user -> user.getUserId()).toList();
        String hostId = userIds.get(0);
        String guestId = userIds.get(1);
        room.setGameState(GameState.BATTLE);
        room.getBuzzerCount().put(hostId, 3);
        room.getBuzzerCount().put(guestId, 1);

        gameService.endBuzzerPhase(room.getRoomId());

        assertEquals(GameState.WINNER_SHOW, room.getGameState());
        assertNotNull(room.getCurrentPerformanceUser());
        assertEquals(hostId, room.getCurrentPerformanceUser().getUserId());
        assertTrue(room.getBuzzerCount().isEmpty());
    }

    @Test
    void clicksWithinTheThrottleWindowCountOnce() {
        Room room = roomWithTwoPlayers();
        String userId = room.getUsers().get(0).getUserId();
        room.setGameState(GameState.BATTLE);

        gameService.handleUserClick(room.getRoomId(), userId);
        gameService.handleUserClick(room.getRoomId(), userId);

        assertEquals(1, room.getBuzzerCount().get(userId));
    }

    @Test
    void performerLeavingDuringPerformanceAdvancesTheRound() {
        Room room = roomWithTwoPlayers();
        String performerId = room.getUsers().get(0).getUserId();
        room.setGameState(GameState.PERFORMANCE);
        room.setCurrentPerformanceUser(room.getUsers().get(0));

        gameService.handleUserLeave(room.getRoomId(), performerId);

        assertNull(room.getCurrentPerformanceUser());
        assertEquals(1, room.getUsers().size());
        ArgumentCaptor<SocketMessage> captor = ArgumentCaptor.forClass(SocketMessage.class);
        verify(messagingTemplate, atLeastOnce())
                .convertAndSend(eq("/topic/room/" + room.getRoomId()), captor.capture());
        assertTrue(captor.getAllValues().stream()
                .anyMatch(message -> message.getType() == MessageType.NO_WINNER));
        verify(scheduler, atLeastOnce())
                .schedule(any(Runnable.class), anyLong(), any(TimeUnit.class));
    }

    @Test
    void lastMemberLeavingRemovesTheRoom() {
        RoomJoinResponse host = roomService.createRoom("Phòng test", "Host");
        String roomId = host.getRoom().roomId();
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.PERFORMANCE);
        room.setCurrentPerformanceUser(room.getUsers().get(0));

        gameService.handleUserLeave(roomId, host.getUser().getUserId());

        assertNull(roomService.getRoom(roomId));
    }

    @Test
    void pickRandomReceivesThePlayedSongSet() {
        Room room = roomWithTwoPlayers();
        room.getPlayedSongIds().add("S1");

        gameService.lobbyPhase(room.getRoomId());

        verify(songCatalog).pickRandom(Set.of("S1"));
    }

    @Test
    void concurrentPerformerLeaveAndKickSchedulesOnlyOneTransition() {
        Room room = roomWithTwoPlayers();
        String hostId = room.getUsers().get(0).getUserId();
        String performerId = room.getUsers().get(1).getUserId();
        room.setGameState(GameState.PERFORMANCE);
        room.setCurrentPerformanceUser(room.getUserById(performerId));

        gameService.handleUserLeave(room.getRoomId(), performerId);
        gameService.handleUserKick(room.getRoomId(), hostId, performerId);

        assertEquals(GameState.COUNTDOWN, room.getGameState());
        verify(scheduler, org.mockito.Mockito.times(1))
                .schedule(any(Runnable.class), anyLong(), any(TimeUnit.class));
    }

    @Test
    void noWinnerOnFinalRoundEndsTheGameInsteadOfStartingAnotherRound() {
        Room room = roomWithTwoPlayers();
        room.setCurrentRound(room.settingsOrDefault().maxRounds());
        room.setGameState(GameState.BATTLE);

        gameService.endBuzzerPhase(room.getRoomId());

        ArgumentCaptor<Runnable> countdownTask = ArgumentCaptor.forClass(Runnable.class);
        verify(scheduler).schedule(countdownTask.capture(), eq(1L), eq(TimeUnit.SECONDS));
        countdownTask.getValue().run();

        ArgumentCaptor<Runnable> endGameTask = ArgumentCaptor.forClass(Runnable.class);
        verify(scheduler).schedule(endGameTask.capture(),
                eq((long) room.settingsOrDefault().countdownSeconds()), eq(TimeUnit.SECONDS));
        endGameTask.getValue().run();

        assertEquals(GameState.END_GAME, room.getGameState());
    }

    @Test
    void evaluatePerformanceAppliesRoomSuccessScoreAndLyricsFallback() {
        Room room = roomWithTwoPlayers();
        room.setSettings(new GameSettings(3, 5, 5, 3, 60, 15, 15, 3, 5, 85, 0.5));
        Song current = new Song("S99", "Test", "https://video/S99", 5.0, 10.0,
                "mot hai ba bon nam", List.of(220.0, 260.0, 300.0, 220.0));
        room.setCurrentSong(current);
        var singer = room.getUsers().get(0);
        room.setCurrentPerformanceUser(singer);
        room.setGameState(GameState.PERFORMANCE_EVALUATION);

        // Blank lyrics -> fallback to toneScore (100 >= 85) -> +1 point.
        gameService.evaluatePerformance(room.getRoomId(), singer.getUserId(), " ",
                List.of(220.0, 260.0, 300.0, 220.0));

        assertEquals(1, singer.getScore());
        assertEquals(GameState.SCORE_SHOW, room.getGameState());

        // With full matching lyrics (100) and monotone pitch (tone=0), weighted score is 50 < 85 -> no point.
        room.setGameState(GameState.PERFORMANCE_EVALUATION);
        gameService.evaluatePerformance(room.getRoomId(), singer.getUserId(), "mot hai ba bon nam",
                List.of(220.0, 220.0, 220.0, 220.0));

        assertEquals(1, singer.getScore());
    }

    @Test
    void latePhaseTimersAreIgnoredWhenRoomStateDoesNotMatch() {
        Room room = roomWithTwoPlayers();
        room.setGameState(GameState.LOBBY);

        gameService.startBuzzerPhase(room.getRoomId());
        assertEquals(GameState.LOBBY, room.getGameState());

        gameService.endBuzzerPhase(room.getRoomId());
        assertEquals(GameState.LOBBY, room.getGameState());

        gameService.startPerformancePhase(room.getRoomId());
        assertEquals(GameState.LOBBY, room.getGameState());

        gameService.startAIEvaluatePhase(room.getRoomId());
        assertEquals(GameState.LOBBY, room.getGameState());
        verifyNoInteractions(scheduler);

        room.setGameState(GameState.PLAY_SEGMENT);
        gameService.startCountdownPhase(room.getRoomId(), () -> { });
        assertEquals(GameState.PLAY_SEGMENT, room.getGameState());
        verifyNoInteractions(scheduler);

        room.setGameState(GameState.LOBBY);
        gameService.resetGame(room.getRoomId());
        assertEquals(GameState.LOBBY, room.getGameState());
    }

    @Test
    void kickBroadcastsKickPlayerBeforeClosingKickedSockets() {
        PresenceRegistry presenceRegistry = new PresenceRegistry();
        WebSocketSessionRegistry sessionRegistry = mock(WebSocketSessionRegistry.class);
        SessionService sessionService = mock(SessionService.class);
        GameConfigService gameConfigService = mock(GameConfigService.class);
        when(gameConfigService.current()).thenReturn(GameSettings.defaults());
        RoomService localRoomService = new RoomService(sessionService, presenceRegistry, sessionRegistry, gameConfigService);
        GameService localGameService = new GameService(localRoomService, messagingTemplate, songCatalog, scheduler);

        RoomJoinResponse host = localRoomService.createRoom("Phòng kick", "Host");
        String roomId = host.getRoom().roomId();
        RoomJoinResponse guest = localRoomService.joinRoom(roomId, "Guest");
        String hostId = host.getUser().getUserId();
        String guestId = guest.getUser().getUserId();
        presenceRegistry.register("ws-guest-1", roomId, guestId);

        localGameService.handleUserKick(roomId, hostId, guestId);

        verify(sessionService).revokeUser(roomId, guestId);
        verify(sessionRegistry, org.mockito.Mockito.never()).closeSessions(any());
        ArgumentCaptor<Runnable> closeTask = ArgumentCaptor.forClass(Runnable.class);
        verify(scheduler).schedule(closeTask.capture(), eq(150L), eq(TimeUnit.MILLISECONDS));
        closeTask.getValue().run();
        verify(sessionRegistry).closeSessions(List.of("ws-guest-1"));
    }
}
