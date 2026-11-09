package com.karaoke.backend.model;

public record RoomView(
        String roomId,
        String roomName,
        GameState gameState,
        int playerCount,
        int maxPlayers,
        String upcomingVideoUrl) {

    public static RoomView from(Room room) {
        Song upcoming = room.getUpcomingSong();
        return new RoomView(
                room.getRoomId(),
                room.getRoomName(),
                room.getGameState(),
                room.getUsers().size(),
                Room.MAX_PLAYERS,
                upcoming != null ? upcoming.getVideoUrl() : null);
    }
}
