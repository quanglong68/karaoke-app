package com.karaoke.backend.persistence;

import com.karaoke.backend.model.Song;

import java.util.List;

public final class SongMapper {

    private SongMapper() {
    }

    public static Song toDomain(SongEntity entity, List<Double> pitchContour) {
        if (entity == null) {
            return null;
        }
        return new Song(
                entity.getId(),
                entity.getSongName(),
                entity.getVideoUrl(),
                entity.getListenDuration(),
                entity.getTotalDuration(),
                entity.getLyrics(),
                pitchContour);
    }

    public static SongEntity toEntity(Song song) {
        if (song == null) {
            return null;
        }
        SongEntity entity = new SongEntity();
        entity.setId(song.getId());
        entity.setSongName(song.getSongName());
        entity.setVideoUrl(song.getVideoUrl());
        entity.setListenDuration(song.getListenDuration());
        entity.setTotalDuration(song.getTotalDuration());
        entity.setLyrics(song.getOriginalLyrics());
        entity.setStatus(SongStatus.ACTIVE);
        return entity;
    }
}
