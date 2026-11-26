package com.karaoke.backend.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.Song;
import com.karaoke.backend.service.AuditLogger;
import com.karaoke.backend.service.ClientIpResolver;
import com.karaoke.backend.service.CloudinaryMediaService;
import com.karaoke.backend.service.GameService;
import com.karaoke.backend.service.RateLimitService;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/admin")
public class SongController {
    private static final Logger log = LoggerFactory.getLogger(SongController.class);

    private static final int MAX_PITCH_SAMPLES = 200_000;
    private static final long MAX_JSON_BYTES = 32L * 1024 * 1024;
    private static final int MAX_EXTRACTOR_LOG_BYTES = 4_096;
    private static final int UPLOAD_LIMIT = 5;
    private static final int CANCEL_LIMIT = 20;
    private static final int MAX_CANCELLED_ENTRIES = 200;
    private static final long UPLOAD_WINDOW_MILLIS = 10 * 60 * 1000L;
    private static final Pattern REQUEST_ID_PATTERN = Pattern.compile("[A-Za-z0-9-]{8,64}");
    private static final long CANCEL_TTL_MILLIS = 15 * 60 * 1000L;

    private final GameService gameService;
    private final CloudinaryMediaService cloudinaryMediaService;
    private final RateLimitService rateLimitService;
    private final ClientIpResolver clientIpResolver;
    private final AuditLogger auditLogger;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Semaphore uploadSlot = new Semaphore(1);
    // Aborting the multipart request on the client does not stop work already running
    // on the server, so cancellations are signalled by requestId and checked between steps.
    private final Map<String, Long> cancelledUploads = new ConcurrentHashMap<>();
    private final Map<String, Process> runningExtractions = new ConcurrentHashMap<>();

    @Value("${app.python-command:python}")
    private String pythonCommand;

    @Value("${app.extract-timeout-seconds:300}")
    private long extractTimeoutSeconds;

    public SongController(GameService gameService, CloudinaryMediaService cloudinaryMediaService,
            RateLimitService rateLimitService, ClientIpResolver clientIpResolver, AuditLogger auditLogger) {
        this.gameService = gameService;
        this.cloudinaryMediaService = cloudinaryMediaService;
        this.rateLimitService = rateLimitService;
        this.clientIpResolver = clientIpResolver;
        this.auditLogger = auditLogger;
    }

    @PostMapping("/upload-song")
    public ResponseEntity<Map<String, Object>> uploadSong(
            @RequestParam("mainVideo") MultipartFile mainVideo,
            @RequestParam("vocalFile") MultipartFile vocalFile,
            @RequestParam("title") String title,
            @RequestParam("lyrics") String lyrics,
            @RequestParam("duration") double duration,
            @RequestParam(value = "requestId", required = false) String requestId,
            HttpServletRequest request,
            Authentication authentication) {
        String actor = AdminControllerSupport.actorName(authentication);
        enforceRateLimit("upload:" + actor, UPLOAD_LIMIT);
        SongMediaValidator.validateUpload(mainVideo, vocalFile, title, lyrics, duration);
        if (requestId != null && !REQUEST_ID_PATTERN.matcher(requestId).matches()) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        if (!cloudinaryMediaService.isConfigured()) {
            throw AppException.unavailable("CLOUDINARY_NOT_CONFIGURED");
        }
        if (!uploadSlot.tryAcquire()) {
            throw AppException.conflict("UPLOAD_BUSY");
        }

        Path mainTempPath = null;
        Path vocalTempPath = null;
        String videoUrl = null;
        String vocalUrl = null;
        try {
            checkCancelled(requestId);
            mainTempPath = createTempFile(mainVideo, SongMediaValidator.VIDEO_EXTENSIONS);
            vocalTempPath = createTempFile(vocalFile, SongMediaValidator.AUDIO_EXTENSIONS);

            checkCancelled(requestId);
            videoUrl = cloudinaryMediaService.uploadVideo(mainTempPath, "karaoke/videos");
            checkCancelled(requestId);
            vocalUrl = cloudinaryMediaService.uploadAudio(vocalTempPath, "karaoke/vocals");

            List<Double> pitchContour = runPythonExtractor(vocalTempPath, requestId);
            checkCancelled(requestId);
            Song savedSong = gameService.addNewSong(
                    title.trim(),
                    videoUrl,
                    vocalUrl,
                    duration,
                    lyrics.trim(),
                    pitchContour,
                    actor);
            auditLogger.event("song.upload.success", actor,
                    clientIpResolver.resolve(request), "songId=" + savedSong.getId());

            return ResponseEntity.ok(Map.of(
                    "id", savedSong.getId(),
                    "title", savedSong.getSongName()));
        } catch (AppException exception) {
            deleteUploadedAssets(videoUrl, vocalUrl);
            auditLogger.event("song.upload.failure", actor,
                    clientIpResolver.resolve(request), "code=" + exception.getCode());
            throw exception;
        } catch (Exception exception) {
            deleteUploadedAssets(videoUrl, vocalUrl);
            log.error("Upload failed", exception);
            auditLogger.event("song.upload.failure", actor,
                    clientIpResolver.resolve(request), "code=INTERNAL_ERROR");
            throw AppException.internal("UPLOAD_FAILED");
        } finally {
            cleanupTempArtifacts(mainTempPath, vocalTempPath);
            if (requestId != null) {
                cancelledUploads.remove(requestId);
                runningExtractions.remove(requestId);
            }
            uploadSlot.release();
        }
    }

    @PostMapping("/upload-song/cancel")
    public ResponseEntity<Void> cancelUpload(@RequestParam(value = "requestId", required = false) String requestId,
            Authentication authentication, HttpServletRequest request) {
        String actor = AdminControllerSupport.actorName(authentication);
        enforceRateLimit("upload-cancel:" + actor, CANCEL_LIMIT);
        if (requestId == null || !REQUEST_ID_PATTERN.matcher(requestId).matches()) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        long now = System.currentTimeMillis();
        cancelledUploads.values().removeIf(timestamp -> now - timestamp > CANCEL_TTL_MILLIS);
        if (cancelledUploads.size() >= MAX_CANCELLED_ENTRIES && !cancelledUploads.containsKey(requestId)) {
            cancelledUploads.entrySet().stream()
                    .min(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .ifPresent(cancelledUploads::remove);
        }
        cancelledUploads.put(requestId, now);
        Process extraction = runningExtractions.get(requestId);
        if (extraction != null) {
            extraction.destroyForcibly();
        }
        auditLogger.event("song.upload.cancel", actor, clientIpResolver.resolve(request), "requestId=" + requestId);
        return ResponseEntity.accepted().build();
    }

    private void checkCancelled(String requestId) {
        if (requestId != null && cancelledUploads.containsKey(requestId)) {
            throw AppException.conflict("UPLOAD_CANCELLED");
        }
    }

    private void deleteUploadedAssets(String videoUrl, String vocalUrl) {
        deleteUploadedAsset(videoUrl);
        deleteUploadedAsset(vocalUrl);
    }

    private void deleteUploadedAsset(String url) {
        if (url == null || url.isBlank()) {
            return;
        }
        try {
            cloudinaryMediaService.deleteByUrl(url);
        } catch (Exception exception) {
            log.warn("Failed to clean up uploaded asset", exception);
        }
    }

    private void enforceRateLimit(String key, int limit) {
        RateLimitService.Decision decision = rateLimitService.check(key, limit, UPLOAD_WINDOW_MILLIS);
        if (!decision.allowed()) {
            throw AppException.tooManyRequests("RATE_LIMITED", decision.retryAfterSeconds());
        }
    }

    private List<Double> runPythonExtractor(Path vocalFilePath, String requestId)
            throws IOException, InterruptedException {
        Path jsonPath = siblingJsonPath(vocalFilePath);
        ProcessBuilder processBuilder = new ProcessBuilder(pythonCommand, "extract.py", vocalFilePath.toString());
        processBuilder.redirectErrorStream(true);

        Process process = processBuilder.start();
        ByteArrayOutputStream capturedOutput = new ByteArrayOutputStream();
        Thread outputDrainer = drainBoundedOutput(process.getInputStream(), capturedOutput);
        if (requestId != null) {
            runningExtractions.put(requestId, process);
            if (cancelledUploads.containsKey(requestId)) {
                process.destroyForcibly();
            }
        }
        try {
            boolean finished = process.waitFor(extractTimeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw AppException.internal("EXTRACT_TIMEOUT");
            }
            outputDrainer.join(1_000L);
            checkCancelled(requestId);
            if (process.exitValue() != 0) {
                String excerpt = capturedOutput.toString(StandardCharsets.UTF_8).trim();
                log.error("Python extractor exited with code {}: {}",
                        process.exitValue(), excerpt.isEmpty() ? "<no output>" : excerpt);
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
        } finally {
            if (requestId != null) {
                runningExtractions.remove(requestId, process);
            }
        }
    }

    private Thread drainBoundedOutput(InputStream stream, ByteArrayOutputStream target) {
        Thread thread = new Thread(() -> {
            byte[] buffer = new byte[1_024];
            try (InputStream in = stream) {
                int read;
                while ((read = in.read(buffer)) != -1) {
                    int remaining = MAX_EXTRACTOR_LOG_BYTES - target.size();
                    if (remaining > 0) {
                        target.write(buffer, 0, Math.min(read, remaining));
                    }
                }
            } catch (IOException ignored) {
            }
        }, "python-output-drainer");
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    private Path createTempFile(MultipartFile file, Set<String> allowedExtensions) throws IOException {
        String extension = SongMediaValidator.requireAllowedExtension(file.getOriginalFilename(), allowedExtensions);
        Path tempFile = Files.createTempFile("karaoke-upload-", extension);
        try (var inputStream = file.getInputStream()) {
            Files.copy(inputStream, tempFile, StandardCopyOption.REPLACE_EXISTING);
        }
        return tempFile;
    }

    private void cleanupTempArtifacts(Path mainTempPath, Path vocalTempPath) {
        deleteQuietly(mainTempPath);
        if (vocalTempPath != null) {
            deleteQuietly(vocalTempPath);
            deleteQuietly(siblingJsonPath(vocalTempPath));
        }
    }

    private void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
        }
    }

    private Path siblingJsonPath(Path vocalFilePath) {
        String fileName = vocalFilePath.getFileName().toString();
        int dot = fileName.lastIndexOf('.');
        String baseName = dot > 0 ? fileName.substring(0, dot) : fileName;
        return vocalFilePath.resolveSibling(baseName + ".json");
    }
}
