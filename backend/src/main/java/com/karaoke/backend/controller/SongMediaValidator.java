package com.karaoke.backend.controller;

import com.karaoke.backend.exception.AppException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/**
 * Validates song upload payloads (sizes, extensions, media magic bytes, and metadata bounds).
 */
final class SongMediaValidator {

    private static final long MAX_FILE_BYTES = 200L * 1024 * 1024;
    private static final long MAX_TOTAL_BYTES = 400L * 1024 * 1024;
    private static final double MAX_DURATION_SECONDS = 3600.0;
    private static final int SIGNATURE_PROBE_BYTES = 12;
    private static final Set<String> ISO_BASE_ATOMS = Set.of("ftyp", "moov", "mdat", "wide", "free");

    // Browsers cannot play Matroska natively, so accepting .mkv produced songs
    // that uploaded fine and then failed to play in the room.
    static final Set<String> VIDEO_EXTENSIONS = Set.of(".mp4", ".webm", ".mov", ".m4v");
    static final Set<String> AUDIO_EXTENSIONS = Set.of(".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac");

    private SongMediaValidator() {
    }

    static void validateUpload(MultipartFile mainVideo, MultipartFile vocalFile, String title,
            String lyrics, double duration) {
        if (mainVideo == null || mainVideo.isEmpty() || vocalFile == null || vocalFile.isEmpty()) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        if (mainVideo.getSize() > MAX_FILE_BYTES || vocalFile.getSize() > MAX_FILE_BYTES
                || mainVideo.getSize() + vocalFile.getSize() > MAX_TOTAL_BYTES) {
            throw AppException.payloadTooLarge("FILE_TOO_LARGE");
        }
        requireAllowedExtension(mainVideo.getOriginalFilename(), VIDEO_EXTENSIONS);
        requireAllowedExtension(vocalFile.getOriginalFilename(), AUDIO_EXTENSIONS);
        validateMediaSignature(mainVideo, true);
        validateMediaSignature(vocalFile, false);
        validateMetadata(title, lyrics, duration);
    }

    static String requireAllowedExtension(String originalFilename, Set<String> allowed) {
        String extension = extractExtension(originalFilename);
        if (!allowed.contains(extension)) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        return extension;
    }

    static boolean matchesSignature(byte[] header, boolean video) {
        if (header == null || header.length < 4) {
            return false;
        }
        String atom = header.length >= 8
                ? new String(header, 4, 4, StandardCharsets.US_ASCII)
                : "";
        // ISO base media files (mp4/mov/m4v/m4a) usually start with ftyp but older
        // QuickTime files may begin with another top-level atom.
        boolean isoBase = ISO_BASE_ATOMS.contains(atom);
        boolean ebml = (header[0] & 0xFF) == 0x1A && (header[1] & 0xFF) == 0x45
                && (header[2] & 0xFF) == 0xDF && (header[3] & 0xFF) == 0xA3;
        if (video) {
            return isoBase || ebml;
        }
        boolean riff = header[0] == 'R' && header[1] == 'I' && header[2] == 'F' && header[3] == 'F';
        boolean flac = header[0] == 'f' && header[1] == 'L' && header[2] == 'a' && header[3] == 'C';
        boolean ogg = header[0] == 'O' && header[1] == 'g' && header[2] == 'g' && header[3] == 'S';
        boolean id3 = header[0] == 'I' && header[1] == 'D' && header[2] == '3';
        boolean frameSync = (header[0] & 0xFF) == 0xFF && (header[1] & 0xE0) == 0xE0;
        return isoBase || riff || flac || ogg || id3 || frameSync;
    }

    private static void validateMetadata(String title, String lyrics, double duration) {
        if (title == null || title.trim().isEmpty()
                || title.trim().length() > AdminControllerSupport.MAX_SONG_TITLE_LENGTH) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        if (lyrics == null || lyrics.trim().isEmpty()
                || lyrics.trim().length() > AdminControllerSupport.MAX_SONG_LYRICS_LENGTH) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        if (!Double.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
    }

    private static void validateMediaSignature(MultipartFile file, boolean video) {
        byte[] header;
        try (InputStream input = file.getInputStream()) {
            header = input.readNBytes(SIGNATURE_PROBE_BYTES);
        } catch (IOException exception) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        if (!matchesSignature(header, video)) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
    }

    private static String extractExtension(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return "";
        }
        int dotIndex = originalFilename.lastIndexOf('.');
        if (dotIndex < 0 || dotIndex == originalFilename.length() - 1) {
            return "";
        }
        return originalFilename.substring(dotIndex).toLowerCase(Locale.ROOT);
    }
}
