package com.karaoke.backend.service;

import com.karaoke.backend.model.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class GameService {
    private final ScheduledExecutorService scheduler =
            Executors.newScheduledThreadPool(10);
    private final RoomService roomService;
    private final SimpMessagingTemplate messagingTemplate;

    public void handleGameMessage(String roomId, SocketMessage message) {
        switch (message.getType()) {
            case PLAY_SEGMENT:
                 startGame(roomId, "P-AoULl-dkU");
                 break;
            case VOTE:
                handleUserClick(roomId, message.getSender());

        }
    }
    public GameService(RoomService roomService, SimpMessagingTemplate messagingTemplate) {
        this.roomService = roomService;
        this.messagingTemplate = messagingTemplate;
    }
    public void startGame(String roomId, String videoId) {
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.PLAY_SEGMENT);
        broadcast(roomId, new SocketMessage(GameState.PLAY_SEGMENT, new MusicInfo(videoId,0
                ,10,true),"server",roomId));
        scheduler.schedule(() -> startBuzzerPhase(roomId), 10, TimeUnit.SECONDS );
    }
    public void startBuzzerPhase(String roomId){
        Room room = roomService.getRoom(roomId);
        room.setGameState(GameState.BATTLE);
        broadcast(roomId, new SocketMessage(GameState.BATTLE,"","server",roomId));
        scheduler.schedule(() -> endBuzzerPhase(roomId), 5, TimeUnit.SECONDS );
    }
    public void endBuzzerPhase(String roomId){
        Room room = roomService.getRoom(roomId);
        if (room == null) return;
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
            if(entry.getValue() > maxScore){
                highestScoreUserId = entry.getKey();
                maxScore = entry.getValue();
            }
        }
        String winnerName  = "chưa rõ";
        for(User u : room.getUsers()){
            if(u.getUserId().equalsIgnoreCase(highestScoreUserId)){
                winnerName = u.getUserName();
                break;
            }
        }
        room.setGameState(GameState.PERFORMANCE);
        broadcast(roomId, new SocketMessage(GameState.PERFORMANCE,room.getUserById(highestScoreUserId),"server",roomId));
        buzzerCount.clear();
    }
    public void handleUserClick(String roomId, String userId){
        Room room = roomService.getRoom(roomId);
        if(room.getGameState() == GameState.BATTLE){
            Map<String, Integer> buzzerCount = room.getBuzzerCount();
            buzzerCount.merge(userId, 1, Integer::sum);
        }
    }
    private void broadcast(String roomId, SocketMessage message){
        messagingTemplate.convertAndSend("/topic/room/"+roomId, message);
    }
}
