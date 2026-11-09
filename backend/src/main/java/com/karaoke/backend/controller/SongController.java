package com.karaoke.backend.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.Song;
import com.karaoke.backend.service.CloudinaryMediaService;
import com.karaoke.backend.service.GameService;
import com.karaoke.backend.service.RateLimitService;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/admin")
public class SongController {
    private static final Logger log = LoggerFactory.getLogger(SongController.class);

    private static final int MAX_TITLE_LENGTH = 120;
    private static final int MAX_LYRICS_LENGTH = 10_000;
    private static final int MAX_PITCH_SAMPLES = 200_000;
    private static final long MAX_JSON_BYTES = 32L * 1024 * 1024;
    private static final long MAX_FILE_BYTES = 200L * 1024 * 1024;
    private static final int UPLOAD_LIMIT = 5;
    private static final long UPLOAD_WINDOW_MILLIS = 10 * 60 * 1000L;
    private static final Set<String> VIDEO_EXTENSIONS = Set.of(".mp4", ".webm", ".mov", ".mkv", ".m4v");
    private static final Set<String> AUDIO_EXTENSIONS = Set.of(".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac");

    private final GameService gameService;
    private final CloudinaryMediaService cloudinaryMediaService;
    private final RateLimitService rateLimitService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Semaphore uploadSlot = new Semaphore(1);

    @Value("${admin.api-key:}")
    private String adminApiKey;

    @Value("${app.python-command:python}")
    private String pythonCommand;

    @Value("${app.extract-timeout-seconds:300}")
    private long extractTimeoutSeconds;

    public SongController(GameService gameService, CloudinaryMediaService cloudinaryMediaService,
            RateLimitService rateLimitService) {
        this.gameService = gameService;
        this.cloudinaryMediaService = cloudinaryMediaService;
        this.rateLimitService = rateLimitService;
    }

    @PostMapping("/upload-song")
    public ResponseEntity<Map<String, Object>> uploadSong(
            @RequestHeader(value = "X-Admin-Key", required = false) String providedKey,
            @RequestParam("mainVideo") MultipartFile mainVideo,
            @RequestParam("vocalFile") MultipartFile vocalFile,
            @RequestParam("title") String title,
            @RequestParam("lyrics") String lyrics,
            @RequestParam("duration") double duration,
            HttpServletRequest request) {
        requireAdmin(providedKey);
        enforceRateLimit(request);
        validateSongInput(mainVideo, vocalFile, title, lyrics, duration);
        if (!cloudinaryMediaService.isConfigured()) {
            throw AppException.unavailable("CLOUDINARY_NOT_CONFIGURED");
        }
        if (!uploadSlot.tryAcquire()) {
            throw AppException.conflict("UPLOAD_BUSY");
        }

        Path mainTempPath = null;
        Path vocalTempPath = null;
        try {
            mainTempPath = createTempFile(mainVideo, VIDEO_EXTENSIONS);
            vocalTempPath = createTempFile(vocalFile, AUDIO_EXTENSIONS);

            String videoUrl = cloudinaryMediaService.uploadVideo(mainTempPath, "karaoke/videos");
            cloudinaryMediaService.uploadAudio(vocalTempPath, "karaoke/vocals");

            List<Double> pitchContour = runPythonExtractor(vocalTempPath);
            Song savedSong = gameService.addNewSong(
                    title.trim(),
                    videoUrl,
                    duration,
                    lyrics.trim(),
                    pitchContour);

            return ResponseEntity.ok(Map.of(
                    "id", savedSong.getId(),
                    "title", savedSong.getSongName()));
        } catch (AppException exception) {
            throw exception;
        } catch (Exception exception) {
            log.error("Upload failed", exception);
            throw AppException.internal("UPLOAD_FAILED");
        } finally {
            cleanupTempArtifacts(mainTempPath, vocalTempPath);
            uploadSlot.release();
        }
    }

    private void requireAdmin(String providedKey) {
        if (adminApiKey == null || adminApiKey.isBlank()) {
            throw AppException.unauthorized("ADMIN_UNAUTHORIZED");
        }
        if (providedKey == null) {
            throw AppException.unauthorized("ADMIN_UNAUTHORIZED");
        }
        boolean match = MessageDigest.isEqual(
                adminApiKey.getBytes(StandardCharsets.UTF_8),
                providedKey.getBytes(StandardCharsets.UTF_8));
        if (!match) {
            throw AppException.unauthorized("ADMIN_UNAUTHORIZED");
        }
    }

    private void enforceRateLimit(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        String ip = forwarded != null && !forwarded.isBlank()
                ? forwarded.split(",")[0].trim()
                : request.getRemoteAddr();
        if (!rateLimitService.allow("upload:" + ip, UPLOAD_LIMIT, UPLOAD_WINDOW_MILLIS)) {
            throw AppException.tooManyRequests("RATE_LIMITED");
        }
    }

    private void validateSongInput(MultipartFile mainVideo, MultipartFile vocalFile, String title,
            String lyrics, double duration) {
        if (mainVideo == null || mainVideo.isEmpty() || vocalFile == null || vocalFile.isEmpty()) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        if (mainVideo.getSize() > MAX_FILE_BYTES || vocalFile.getSize() > MAX_FILE_BYTES) {
            throw AppException.payloadTooLarge("FILE_TOO_LARGE");
        }
        validateExtension(mainVideo, VIDEO_EXTENSIONS);
        validateExtension(vocalFile, AUDIO_EXTENSIONS);
        if (title == null || title.trim().isEmpty() || title.trim().length() > MAX_TITLE_LENGTH) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        if (lyrics == null || lyrics.trim().isEmpty() || lyrics.trim().length() > MAX_LYRICS_LENGTH) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        if (!Double.isFinite(duration) || duration <= 0 || duration > 3600) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
    }

    private void validateExtension(MultipartFile file, Set<String> allowed) {
        String extension = getFileExtension(file.getOriginalFilename());
        if (!allowed.contains(extension)) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
    }

    private List<Double> runPythonExtractor(Path vocalFilePath) throws IOException, InterruptedException {
        Path jsonPath = siblingJsonPath(vocalFilePath);
        ProcessBuilder processBuilder = new ProcessBuilder(pythonCommand, "extract.py", vocalFilePath.toString());
        processBuilder.redirectErrorStream(true);
        processBuilder.redirectOutput(ProcessBuilder.Redirect.DISCARD);

        Process process = processBuilder.start();
        boolean finished = process.waitFor(extractTimeoutSeconds, TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            throw AppException.internal("EXTRACT_TIMEOUT");
        }
        if (process.exitValue() != 0) {
            log.error("Python extractor exited with code {}", process.exitValue());
            throw AppException.internal("UPLOAD_FAILED");
        }
        if (!Files.exists(jsonPath) || Files.size(jsonPath) > MAX_JSON_BYTES) {
            throw AppException.internal("UPLOAD_FAILED");
        }

        List<Double> pitch = objectMapper.readValue(jsonPath.toFile(), new TypeReference<List<Double>>() {
        });
        if (pitch == null || pitch.isEmpty() || pitch.size() > MAX_PITCH_SAMPLES) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        return pitch;
    }

    private Path createTempFile(MultipartFile file, Set<String> allowedExtensions) throws IOException {
        String originalName = file.getOriginalFilename();
        String extension = getFileExtension(originalName);
        if (!allowedExtensions.contains(extension)) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        Path tempFile = Files.createTempFile("karaoke-upload-", extension);
        try (var inputStream = file.getInputStream()) {
            Files.copy(inputStream, tempFile, StandardCopyOption.REPLACE_EXISTING);
        }
        return tempFile;
    }

    private void cleanupTempArtifacts(Path mainTempPath, Path vocalTempPath) {
        if (mainTempPath != null) {
            try {
                Files.deleteIfExists(mainTempPath);
            } catch (IOException ignored) {
            }
        }
        if (vocalTempPath != null) {
            try {
                Files.deleteIfExists(vocalTempPath);
            } catch (IOException ignored) {
            }
            try {
                Files.deleteIfExists(siblingJsonPath(vocalTempPath));
            } catch (IOException ignored) {
            }
        }
    }

    private Path siblingJsonPath(Path vocalFilePath) {
        String fileName = vocalFilePath.getFileName().toString();
        int dot = fileName.lastIndexOf('.');
        String baseName = dot > 0 ? fileName.substring(0, dot) : fileName;
        return vocalFilePath.resolveSibling(baseName + ".json");
    }

    private String getFileExtension(String originalFilename) {
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
