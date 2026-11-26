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
                room.settingsOrDefault().maxPlayers(),
                upcoming != null ? upcoming.getVideoUrl() : null);
    }

    /**
     * Public lobby listing: shows who is playing, not which media the room will use.
     * The upcoming video URL is only sent to members after they join.
     */
    public static RoomView summary(Room room) {
        return new RoomView(
                room.getRoomId(),
                room.getRoomName(),
                room.getGameState(),
                room.getUsers().size(),
                room.settingsOrDefault().maxPlayers(),
                null);
    }
}
