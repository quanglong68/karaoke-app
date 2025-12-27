package com.karaoke.backend.service;

import com.karaoke.backend.model.GameState;
import com.karaoke.backend.model.Room;
import com.karaoke.backend.model.User;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class GameService {
    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor();
    private final RoomService roomService;
    public GameService(RoomService roomService) {
        this.roomService = roomService;
    }
    public void startGame(String roomId, String videoId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.PLAY_MUSIC);

        scheduler.schedule(() -> startBuzzerPhase(roomId), 10, TimeUnit.SECONDS );
    }
    public void startBuzzerPhase(String roomId){
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.BATTLE);
        scheduler.schedule(() -> endBuzzerPhase(roomId), 3, TimeUnit.SECONDS );
    }
    public void endBuzzerPhase(String roomId){

    }
    public void handleUserClick(String roomId, String userId){
        Room room = roomService.getRoom(roomId);
        if(room.getGameState() == GameState.BATTLE){
            Map<String, Integer> buzzerCount = room.getBuzzerCount();
            buzzerCount.merge(userId, 1, Integer::sum);
        }
    }
}
