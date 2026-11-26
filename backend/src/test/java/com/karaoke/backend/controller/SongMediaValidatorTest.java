package com.karaoke.backend.controller;

import com.karaoke.backend.exception.AppException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SongMediaValidatorTest {

    @Test
    void matchesKnownVideoAndAudioSignatures() {
        byte[] mp4 = new byte[] { 0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'm', 'p', '4', '2' };
        byte[] webm = new byte[] { 0x1A, 0x45, (byte) 0xDF, (byte) 0xA3, 0x01, 0x00, 0x00, 0x00 };
        byte[] wav = new byte[] { 'R', 'I', 'F', 'F', 0x00, 0x00, 0x00, 0x00 };
        byte[] mp3 = new byte[] { 'I', 'D', '3', 0x04, 0x00, 0x00, 0x00, 0x00 };
        byte[] fake = "plain-text-header".getBytes();

        assertTrue(SongMediaValidator.matchesSignature(mp4, true));
        assertTrue(SongMediaValidator.matchesSignature(webm, true));
        assertFalse(SongMediaValidator.matchesSignature(wav, true));
        assertTrue(SongMediaValidator.matchesSignature(wav, false));
        assertTrue(SongMediaValidator.matchesSignature(mp3, false));
        assertFalse(SongMediaValidator.matchesSignature(fake, true));
        assertFalse(SongMediaValidator.matchesSignature(fake, false));
    }

    @Test
    void validatesUploadMetadataAndRejectsInvalidExtensions() {
        byte[] mp4 = new byte[] { 0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'm', 'p', '4', '2' };
        byte[] mp3 = new byte[] { 'I', 'D', '3', 0x04, 0x00, 0x00, 0x00, 0x00 };
        MockMultipartFile validVideo = new MockMultipartFile("mainVideo", "beat.mp4", "video/mp4", mp4);
        MockMultipartFile validVocal = new MockMultipartFile("vocalFile", "vocal.mp3", "audio/mpeg", mp3);

        assertDoesNotThrow(() -> SongMediaValidator.validateUpload(
                validVideo, validVocal, "Bài hát mẫu", "Lời bài hát", 90.5));

        MockMultipartFile mkvVideo = new MockMultipartFile("mainVideo", "beat.mkv", "video/x-matroska", mp4);
        AppException badExt = assertThrows(AppException.class, () -> SongMediaValidator.validateUpload(
                mkvVideo, validVocal, "Bài hát mẫu", "Lời bài hát", 90.5));
        assertEquals("INVALID_UPLOAD", badExt.getCode());

        AppException badDuration = assertThrows(AppException.class, () -> SongMediaValidator.validateUpload(
                validVideo, validVocal, "Bài hát mẫu", "Lời bài hát", Double.NaN));
        assertEquals("INVALID_UPLOAD", badDuration.getCode());
    }
}
