package com.karaoke.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.controller.AdminControllerSupport;
import com.karaoke.backend.controller.SongMediaValidator;
import com.karaoke.backend.exception.AppException;
import com.karaoke.backend.model.Song;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Service
public class SmartSongDraftService {

    private static final Logger log = LoggerFactory.getLogger(SmartSongDraftService.class);

    private static final String WORKER_JSON_PREFIX = "KARAOKE_JSON:";
    private static final Pattern UUID_PATTERN =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Pattern REQUEST_ID_PATTERN = Pattern.compile("[A-Za-z0-9-]{8,64}");

    private static final double MAX_SOURCE_DURATION_SEC = 15 * 60.0;
    private static final double MIN_LISTEN_DURATION_SEC = 3.0;
    private static final double MAX_LISTEN_DURATION_SEC = 120.0;
    private static final double MIN_SING_DURATION_SEC = 5.0;
    private static final double MAX_SING_DURATION_SEC = 90.0;
    private static final double END_TOLERANCE_SEC = 0.5;

    private static final int MAX_PITCH_SAMPLES = 200_000;
    private static final long MAX_JSON_BYTES = 16L * 1024 * 1024;
    private static final int MAX_WORKER_OUTPUT_BYTES = 32_768;
    private static final long CANCEL_TTL_MILLIS = 15 * 60 * 1000L;
    private static final int MAX_CANCELLED_ENTRIES = 200;
    private static final int MAX_ACTIVE_DRAFTS = 5;

    public record DraftSourceResponse(
            String draftId,
            String suggestedTitle,
            double totalDuration,
            boolean hasOfficialSubtitles,
            String sourceStreamUrl) {
    }

    public record DraftAnalyzeResponse(
            String draftId,
            double listenDuration,
            double singDuration,
            int pitchSampleCount,
            int voicedSampleCount,
            String suggestedTitle,
            String lyrics,
            String lyricsSource,
            String lyricsWarning,
            String listenClipUrl,
            String vocalPreviewUrl) {
    }

    public record DraftMedia(Path path, MediaType mediaType) {
    }

    private static final class DraftState {
        final String draftId;
        final Path dir;
        final Path sourceVideoPath;
        final Path subtitlePath;
        final double totalDuration;
        String suggestedTitle;
        volatile long lastAccessedMillis;
        final java.util.concurrent.atomic.AtomicBoolean inUse = new java.util.concurrent.atomic.AtomicBoolean(false);
        volatile boolean pendingDelete;
        final AtomicInteger analysisSeq = new AtomicInteger(0);

        volatile boolean analyzed;
        volatile Path listenClipPath;
        volatile double listenDuration;
        volatile Path vocalCleanPath;
        volatile List<Double> pitchContour;

        DraftState(String draftId, Path dir, Path sourceVideoPath, Path subtitlePath,
                double totalDuration, String suggestedTitle) {
            this.draftId = draftId;
            this.dir = dir;
            this.sourceVideoPath = sourceVideoPath;
            this.subtitlePath = subtitlePath;
            this.totalDuration = totalDuration;
            this.suggestedTitle = suggestedTitle;
            this.lastAccessedMillis = System.currentTimeMillis();
        }

        void touch() {
            this.lastAccessedMillis = System.currentTimeMillis();
        }
    }

    private final GameService gameService;
    private final CloudinaryMediaService cloudinaryMediaService;
    private final GeminiClient geminiClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Semaphore workerSlot = new Semaphore(1);
    private final Map<String, DraftState> drafts = new ConcurrentHashMap<>();
    private final Map<String, Long> cancelledRequests = new ConcurrentHashMap<>();
    private final Map<String, Process> runningProcesses = new ConcurrentHashMap<>();
    private final ScheduledExecutorService cleanupScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "draft-cleanup");
        t.setDaemon(true);
        return t;
    });

    @Value("${app.python-command:python}")
    private String pythonCommand = "python";

    @Value("${app.smart-worker-script:smart_song_worker.py}")
    private String workerScript = "smart_song_worker.py";

    @Value("${app.uvr-model-path:models/Kim_Vocal_2.onnx}")
    private String uvrModelPath = "models/Kim_Vocal_2.onnx";

    @Value("${app.extract-timeout-seconds:300}")
    private long extractTimeoutSeconds = 300L;

    @Value("${app.draft-ttl-minutes:30}")
    private long draftTtlMinutes = 30L;

    public SmartSongDraftService(
            GameService gameService,
            CloudinaryMediaService cloudinaryMediaService,
            GeminiClient geminiClient) {
        this.gameService = gameService;
        this.cloudinaryMediaService = cloudinaryMediaService;
        this.geminiClient = geminiClient;
    }

    @PostConstruct
    void startCleanupTask() {
        sweepOrphanedTempDirs();
        cleanupScheduler.scheduleAtFixedRate(this::evictExpiredDrafts, 5, 10, TimeUnit.MINUTES);
    }

    @PreDestroy
    public void shutdown() {
        cleanupScheduler.shutdownNow();
        runningProcesses.values().forEach(Process::destroyForcibly);
        runningProcesses.clear();
        for (String id : new ArrayList<>(drafts.keySet())) {
            deleteDraftInternal(id);
        }
    }

    public DraftSourceResponse createYoutubeDraft(String rawUrl, String requestId) {
        validateRequestId(requestId);
        String canonicalUrl = YoutubeUrlValidator.normalizeYoutubeUrl(rawUrl);
        if (!workerSlot.tryAcquire()) {
            throw AppException.conflict("UPLOAD_BUSY");
        }

        String draftId = UUID.randomUUID().toString();
        Path draftDir = null;
        try {
            checkCancelled(requestId);
            draftDir = Files.createTempDirectory("karaoke-draft-" + draftId + "-");

            JsonNode result = runWorkerCommand(
                    List.of(pythonCommand, resolveWorkerScriptPath(), "youtube",
                            "--url", canonicalUrl,
                            "--out-dir", draftDir.toString()),
                    requestId);
            checkCancelled(requestId);

            Path videoPath = Path.of(result.path("videoPath").asText(""));
            if (!Files.isRegularFile(videoPath)) {
                throw AppException.unprocessable("YOUTUBE_DOWNLOAD_FAILED");
            }
            double duration = result.path("duration").asDouble(0.0);
            validateSourceDuration(duration, true);

            String rawSub = result.path("subtitlePath").asText(null);
            Path subtitlePath = (rawSub != null && !rawSub.isBlank() && Files.isRegularFile(Path.of(rawSub)))
                    ? Path.of(rawSub)
                    : null;
            String suggestedTitle = YoutubeUrlValidator.cleanSongTitle(result.path("title").asText(""));

            DraftState state = new DraftState(draftId, draftDir, videoPath, subtitlePath, duration, suggestedTitle);
            registerDraftAndEvictOldest(state);
            return new DraftSourceResponse(
                    draftId,
                    suggestedTitle,
                    duration,
                    subtitlePath != null,
                    "/api/admin/song-drafts/" + draftId + "/media/source");
        } catch (AppException exception) {
            deleteDirectoryQuietly(draftDir);
            throw exception;
        } catch (Exception exception) {
            deleteDirectoryQuietly(draftDir);
            log.warn("YouTube draft creation failed", exception);
            throw AppException.unprocessable("YOUTUBE_DOWNLOAD_FAILED");
        } finally {
            finishRequestTracking(requestId);
            workerSlot.release();
        }
    }

    public DraftSourceResponse createUploadDraft(MultipartFile sourceVideo, String requestId) {
        validateRequestId(requestId);
        String ext = SongMediaValidator.validateSingleVideo(sourceVideo);
        if (!workerSlot.tryAcquire()) {
            throw AppException.conflict("UPLOAD_BUSY");
        }

        String draftId = UUID.randomUUID().toString();
        Path draftDir = null;
        try {
            checkCancelled(requestId);
            draftDir = Files.createTempDirectory("karaoke-draft-" + draftId + "-");
            Path sourcePath = draftDir.resolve("source" + ext);
            try (InputStream in = sourceVideo.getInputStream()) {
                Files.copy(in, sourcePath, StandardCopyOption.REPLACE_EXISTING);
            }
            checkCancelled(requestId);

            JsonNode probe = runWorkerCommand(
                    List.of(pythonCommand, resolveWorkerScriptPath(), "probe", "--input", sourcePath.toString()),
                    requestId);
            double duration = probe.path("duration").asDouble(0.0);
            validateSourceDuration(duration, false);

            String suggestedTitle = YoutubeUrlValidator.cleanSongTitle(sourceVideo.getOriginalFilename());
            DraftState state = new DraftState(draftId, draftDir, sourcePath, null, duration, suggestedTitle);
            registerDraftAndEvictOldest(state);
            return new DraftSourceResponse(
                    draftId,
                    suggestedTitle,
                    duration,
                    false,
                    "/api/admin/song-drafts/" + draftId + "/media/source");
        } catch (AppException exception) {
            deleteDirectoryQuietly(draftDir);
            throw exception;
        } catch (Exception exception) {
            deleteDirectoryQuietly(draftDir);
            log.error("Upload draft creation failed", exception);
            throw AppException.internal("UPLOAD_FAILED");
        } finally {
            finishRequestTracking(requestId);
            workerSlot.release();
        }
    }

    public DraftAnalyzeResponse analyzeDraft(
            String draftId,
            double listenStart,
            double listenEnd,
            double singStart,
            double singEnd,
            String titleHint,
            MultipartFile vocalOverride,
            String requestId) {
        validateRequestId(requestId);
        DraftState state = requireDraft(draftId);
        validateSegmentRanges(listenStart, listenEnd, singStart, singEnd, state.totalDuration);

        String overrideExt = null;
        if (vocalOverride != null && !vocalOverride.isEmpty()) {
            overrideExt = SongMediaValidator.validateSingleAudio(vocalOverride);
        }

        if (!workerSlot.tryAcquire()) {
            throw AppException.conflict("UPLOAD_BUSY");
        }

        Path vocalOverridePath = null;
        try {
            if (drafts.get(draftId) != state || state.pendingDelete || !Files.isRegularFile(state.sourceVideoPath)) {
                throw AppException.notFound("DRAFT_NOT_FOUND");
            }
            state.inUse.set(true);
            checkCancelled(requestId);
            state.touch();

            if (overrideExt != null) {
                vocalOverridePath = state.dir.resolve("vocal_override" + overrideExt);
                try (InputStream in = vocalOverride.getInputStream()) {
                    Files.copy(in, vocalOverridePath, StandardCopyOption.REPLACE_EXISTING);
                }
            }

            List<String> command = new ArrayList<>(List.of(
                    pythonCommand,
                    resolveWorkerScriptPath(),
                    "analyze",
                    "--source", state.sourceVideoPath.toString(),
                    "--out-dir", state.dir.toString(),
                    "--listen-start", String.format(Locale.ROOT, "%.3f", listenStart),
                    "--listen-end", String.format(Locale.ROOT, "%.3f", listenEnd),
                    "--sing-start", String.format(Locale.ROOT, "%.3f", singStart),
                    "--sing-end", String.format(Locale.ROOT, "%.3f", singEnd),
                    "--uvr-model", resolveUvrModelPath()));
            if (vocalOverridePath != null) {
                command.add("--vocal-override");
                command.add(vocalOverridePath.toString());
            }

            JsonNode workerResult = runWorkerCommand(command, requestId);
            checkCancelled(requestId);

            Path listenClipPath = Path.of(workerResult.path("listenClipPath").asText(""));
            Path vocalCleanPath = Path.of(workerResult.path("vocalCleanPath").asText(""));
            Path geminiAudioPath = Path.of(workerResult.path("geminiAudioPath").asText(""));
            Path pitchPath = Path.of(workerResult.path("pitchPath").asText(""));

            if (!Files.isRegularFile(listenClipPath)
                    || !Files.isRegularFile(vocalCleanPath)
                    || !Files.isRegularFile(pitchPath)
                    || Files.size(pitchPath) > MAX_JSON_BYTES) {
                throw AppException.internal("UPLOAD_FAILED");
            }

            List<Double> contour = objectMapper.readValue(
                    pitchPath.toFile(), new TypeReference<List<Double>>() {
                    });
            if (contour == null || contour.isEmpty() || contour.size() > MAX_PITCH_SAMPLES) {
                throw AppException.badRequest("INVALID_UPLOAD");
            }
            int voicedCount = (int) contour.stream()
                    .filter(hz -> hz != null && hz > 50.0 && hz < 2_000.0)
                    .count();

            double actualListenDuration = workerResult.path("listenDuration").asDouble(listenEnd - listenStart);
            double actualSingDuration = workerResult.path("singDuration").asDouble(singEnd - singStart);

            String effectiveTitleHint = (titleHint != null && !titleHint.isBlank())
                    ? titleHint.trim()
                    : state.suggestedTitle;
            LyricsExtractionOutcome lyricsOutcome =
                    resolveLyrics(state, geminiAudioPath, singStart, singEnd, effectiveTitleHint);

            if ((effectiveTitleHint == null || effectiveTitleHint.isBlank())
                    && lyricsOutcome.suggestedTitle() != null
                    && !lyricsOutcome.suggestedTitle().isBlank()) {
                state.suggestedTitle = YoutubeUrlValidator.cleanSongTitle(lyricsOutcome.suggestedTitle());
            } else if (titleHint != null && !titleHint.isBlank()) {
                state.suggestedTitle = titleHint.trim();
            }

            String warning = lyricsOutcome.warning();
            if (voicedCount < 4) {
                String lowVoiceNote = "Đoạn hát tách ra có rất ít nốt giọng người (" + voicedCount
                        + " mẫu). Hãy bấm nghe thử giọng ca sĩ đã tách để kiểm tra xem có chọn nhầm đoạn nhạc dạo không.";
                warning = (warning == null || warning.isBlank()) ? lowVoiceNote : warning + " " + lowVoiceNote;
            }

            state.listenClipPath = listenClipPath;
            state.listenDuration = actualListenDuration;
            state.vocalCleanPath = vocalCleanPath;
            state.pitchContour = List.copyOf(contour);
            state.analyzed = true;
            state.touch();

            int version = state.analysisSeq.incrementAndGet();
            return new DraftAnalyzeResponse(
                    draftId,
                    actualListenDuration,
                    actualSingDuration,
                    contour.size(),
                    voicedCount,
                    state.suggestedTitle,
                    lyricsOutcome.lyrics(),
                    lyricsOutcome.source(),
                    warning,
                    "/api/admin/song-drafts/" + draftId + "/media/listen-clip?v=" + version,
                    "/api/admin/song-drafts/" + draftId + "/media/vocal-preview?v=" + version);
        } catch (AppException exception) {
            throw exception;
        } catch (Exception exception) {
            log.error("Draft analyze failed for {}", draftId, exception);
            throw AppException.internal("UPLOAD_FAILED");
        } finally {
            state.inUse.set(false);
            deleteFileQuietly(vocalOverridePath);
            if (state.pendingDelete) {
                deleteDraftInternal(draftId);
            }
            finishRequestTracking(requestId);
            workerSlot.release();
        }
    }

    public List<Double> getAnalyzedPitchContour(String draftId) {
        DraftState state = requireDraft(draftId);
        state.touch();
        if (!state.analyzed || state.pitchContour == null || state.pitchContour.isEmpty()) {
            throw AppException.badRequest("DRAFT_NOT_ANALYZED");
        }
        return state.pitchContour;
    }

    public DraftMedia getDraftMedia(String draftId, String kind) {
        DraftState state = requireDraft(draftId);
        state.touch();
        return switch (kind == null ? "" : kind.trim().toLowerCase(Locale.ROOT)) {
            case "source" -> new DraftMedia(state.sourceVideoPath, detectVideoMediaType(state.sourceVideoPath));
            case "listen-clip" -> {
                if (!state.analyzed || state.listenClipPath == null || !Files.isRegularFile(state.listenClipPath)) {
                    throw AppException.notFound("DRAFT_NOT_FOUND");
                }
                yield new DraftMedia(state.listenClipPath, MediaType.valueOf("video/mp4"));
            }
            case "vocal-preview" -> {
                if (!state.analyzed || state.vocalCleanPath == null || !Files.isRegularFile(state.vocalCleanPath)) {
                    throw AppException.notFound("DRAFT_NOT_FOUND");
                }
                yield new DraftMedia(state.vocalCleanPath, MediaType.valueOf("audio/wav"));
            }
            default -> throw AppException.notFound("NOT_FOUND");
        };
    }

    public Song commitDraft(String draftId, String title, String lyrics, String requestId, String actor) {
        validateRequestId(requestId);
        if (!cloudinaryMediaService.isConfigured()) {
            throw AppException.unavailable("CLOUDINARY_NOT_CONFIGURED");
        }
        DraftState state = requireDraft(draftId);
        if (!state.analyzed || state.listenClipPath == null || state.vocalCleanPath == null
                || state.pitchContour == null || state.pitchContour.isEmpty()) {
            throw AppException.badRequest("DRAFT_NOT_ANALYZED");
        }
        String trimmedTitle = title == null ? "" : title.trim();
        String trimmedLyrics = lyrics == null ? "" : lyrics.trim();
        if (trimmedTitle.isEmpty() || trimmedTitle.length() > AdminControllerSupport.MAX_SONG_TITLE_LENGTH
                || trimmedLyrics.isEmpty() || trimmedLyrics.length() > AdminControllerSupport.MAX_SONG_LYRICS_LENGTH) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        if (!workerSlot.tryAcquire()) {
            throw AppException.conflict("UPLOAD_BUSY");
        }

        String videoUrl = null;
        String vocalUrl = null;
        try {
            if (drafts.get(draftId) != state || state.pendingDelete
                    || !Files.isRegularFile(state.listenClipPath)
                    || !Files.isRegularFile(state.vocalCleanPath)) {
                throw AppException.notFound("DRAFT_NOT_FOUND");
            }
            state.inUse.set(true);
            checkCancelled(requestId);
            videoUrl = cloudinaryMediaService.uploadVideo(state.listenClipPath, "karaoke/videos");
            checkCancelled(requestId);
            vocalUrl = cloudinaryMediaService.uploadAudio(state.vocalCleanPath, "karaoke/vocals");
            checkCancelled(requestId);

            Song saved = gameService.addNewSong(
                    trimmedTitle,
                    videoUrl,
                    vocalUrl,
                    state.listenDuration,
                    trimmedLyrics,
                    state.pitchContour,
                    actor);
            state.pendingDelete = true;
            return saved;
        } catch (AppException exception) {
            rollbackCloudinary(videoUrl, vocalUrl);
            throw exception;
        } catch (Exception exception) {
            rollbackCloudinary(videoUrl, vocalUrl);
            log.error("Commit draft failed for {}", draftId, exception);
            throw AppException.internal("UPLOAD_FAILED");
        } finally {
            state.inUse.set(false);
            if (state.pendingDelete) {
                deleteDraftInternal(draftId);
            }
            finishRequestTracking(requestId);
            workerSlot.release();
        }
    }

    public void cancelOperation(String requestId) {
        if (requestId == null || !REQUEST_ID_PATTERN.matcher(requestId).matches()) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
        long now = System.currentTimeMillis();
        cancelledRequests.values().removeIf(ts -> now - ts > CANCEL_TTL_MILLIS);
        if (cancelledRequests.size() >= MAX_CANCELLED_ENTRIES && !cancelledRequests.containsKey(requestId)) {
            cancelledRequests.entrySet().stream()
                    .min(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .ifPresent(cancelledRequests::remove);
        }
        cancelledRequests.put(requestId, now);
        Process running = runningProcesses.get(requestId);
        if (running != null) {
            running.destroyForcibly();
        }
    }

    public void deleteDraft(String draftId) {
        validateDraftId(draftId);
        DraftState state = drafts.get(draftId);
        if (state == null) {
            return;
        }
        state.pendingDelete = true;
        if (!state.inUse.get()) {
            deleteDraftInternal(draftId);
        }
    }

    private record LyricsExtractionOutcome(String lyrics, String suggestedTitle, String source, String warning) {
    }

    private LyricsExtractionOutcome resolveLyrics(
            DraftState state, Path geminiAudioPath, double singStart, double singEnd, String titleHint) {
        if (state.subtitlePath != null) {
            String subLyrics = SubtitleSegmentExtractor.extractSegment(state.subtitlePath, singStart, singEnd);
            if (!subLyrics.isBlank()) {
                return new LyricsExtractionOutcome(subLyrics, "", "YOUTUBE_SUBTITLES", null);
            }
        }

        if (!geminiClient.hasActiveCredentials()) {
            return new LyricsExtractionOutcome(
                    "",
                    "",
                    "MANUAL_REQUIRED",
                    "Chưa có Gemini API Key đang bật ở tab Cấu hình AI nên chưa thể tự nghe nhạc chép lời. Bạn vui lòng nhập lời bài hát hoặc thêm Key Gemini.");
        }

        if (geminiAudioPath == null || !Files.isRegularFile(geminiAudioPath)) {
            return new LyricsExtractionOutcome(
                    "",
                    "",
                    "MANUAL_REQUIRED",
                    "Không tìm thấy đoạn âm thanh tạm để chép lời tự động. Bạn vui lòng nhập lời bài hát bên dưới.");
        }

        try {
            byte[] mp3Bytes = Files.readAllBytes(geminiAudioPath);
            GeminiClient.AudioTranscriptionResult result =
                    geminiClient.transcribeSongSegment(mp3Bytes, "audio/mp3", titleHint);
            if (result.lyrics() != null && !result.lyrics().isBlank()) {
                return new LyricsExtractionOutcome(
                        result.lyrics(),
                        result.suggestedTitle(),
                        "GEMINI_AUDIO (" + result.modelUsed() + ")",
                        null);
            }
            return new LyricsExtractionOutcome(
                    "",
                    result.suggestedTitle(),
                    "MANUAL_REQUIRED",
                    "Gemini không nhận diện được tiếng hát rõ ràng trong đoạn này. Bạn vui lòng kiểm tra lại đoạn cắt hoặc tự nhập lời.");
        } catch (Exception exception) {
            log.warn("Gemini audio lyrics transcription fallback triggered: {}", exception.getMessage());
            return new LyricsExtractionOutcome(
                    "",
                    "",
                    "MANUAL_REQUIRED",
                    "Tất cả Gemini API Key/Model hiện đang hết hạn mức hoặc lỗi kết nối. Video & giọng gốc vẫn đã tách xong, bạn hãy nhập lời thủ công bên dưới.");
        }
    }

    JsonNode runWorkerCommand(List<String> command, String requestId)
            throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.redirectErrorStream(true);
        Process process = pb.start();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        Thread drainer = drainBoundedOutput(process.getInputStream(), output);

        if (requestId != null) {
            runningProcesses.put(requestId, process);
            if (cancelledRequests.containsKey(requestId)) {
                process.destroyForcibly();
            }
        }
        try {
            boolean finished = process.waitFor(extractTimeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw AppException.internal("EXTRACT_TIMEOUT");
            }
            drainer.join(1_000L);
            checkCancelled(requestId);
            String fullLog = output.toString(StandardCharsets.UTF_8);
            if (process.exitValue() != 0) {
                log.warn("Smart worker exited with {}: {}", process.exitValue(), fullLog.trim());
                if (fullLog.contains("VIDEO_DURATION_OUT_OF_RANGE")) {
                    throw AppException.badRequest("INVALID_YOUTUBE_DURATION");
                }
                if (fullLog.contains("FILE_TOO_LARGE")) {
                    throw AppException.payloadTooLarge("FILE_TOO_LARGE");
                }
                if (command.contains("youtube")) {
                    throw AppException.unprocessable("YOUTUBE_DOWNLOAD_FAILED");
                }
                throw AppException.internal("UPLOAD_FAILED");
            }

            for (String line : fullLog.split("\\R")) {
                int idx = line.indexOf(WORKER_JSON_PREFIX);
                if (idx >= 0) {
                    String jsonPart = line.substring(idx + WORKER_JSON_PREFIX.length()).trim();
                    return objectMapper.readTree(jsonPart);
                }
            }
            throw AppException.internal("UPLOAD_FAILED");
        } finally {
            if (requestId != null) {
                runningProcesses.remove(requestId, process);
            }
        }
    }

    private Thread drainBoundedOutput(InputStream stream, ByteArrayOutputStream target) {
        Thread thread = new Thread(() -> {
            byte[] buffer = new byte[1_024];
            try (InputStream in = stream) {
                int read;
                while ((read = in.read(buffer)) != -1) {
                    int remaining = MAX_WORKER_OUTPUT_BYTES - target.size();
                    if (remaining > 0) {
                        target.write(buffer, 0, Math.min(read, remaining));
                    }
                }
            } catch (IOException ignored) {
            }
        }, "smart-worker-drainer");
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    private DraftState requireDraft(String draftId) {
        validateDraftId(draftId);
        DraftState state = drafts.get(draftId);
        if (state == null || state.pendingDelete
                || !Files.isDirectory(state.dir) || !Files.isRegularFile(state.sourceVideoPath)) {
            if (state != null && !state.inUse.get()) {
                deleteDraftInternal(draftId);
            }
            throw AppException.notFound("DRAFT_NOT_FOUND");
        }
        return state;
    }

    private void registerDraftAndEvictOldest(DraftState created) {
        drafts.put(created.draftId, created);
        while (drafts.size() > MAX_ACTIVE_DRAFTS) {
            String oldestId = drafts.entrySet().stream()
                    .filter(e -> !e.getKey().equals(created.draftId) && !e.getValue().inUse.get())
                    .min(Comparator.comparingLong(e -> e.getValue().lastAccessedMillis))
                    .map(Map.Entry::getKey)
                    .orElse(null);
            if (oldestId == null) {
                break;
            }
            deleteDraftInternal(oldestId);
        }
    }

    private String resolveWorkerScriptPath() {
        Path direct = Path.of(workerScript);
        if (Files.isRegularFile(direct) || direct.isAbsolute()) {
            return direct.toString();
        }
        Path inBackend = Path.of("backend").resolve(workerScript);
        if (Files.isRegularFile(inBackend)) {
            return inBackend.toString();
        }
        return workerScript;
    }

    private String resolveUvrModelPath() {
        Path direct = Path.of(uvrModelPath);
        if (Files.isRegularFile(direct) || direct.isAbsolute()) {
            return direct.toString();
        }
        Path inBackend = Path.of("backend").resolve(uvrModelPath);
        if (Files.isRegularFile(inBackend) || Files.isDirectory(Path.of("backend"))) {
            return inBackend.toString();
        }
        return uvrModelPath;
    }

    private static void validateDraftId(String draftId) {
        if (draftId == null || !UUID_PATTERN.matcher(draftId).matches()) {
            throw AppException.notFound("DRAFT_NOT_FOUND");
        }
    }

    private static void validateRequestId(String requestId) {
        if (requestId != null && !requestId.isBlank() && !REQUEST_ID_PATTERN.matcher(requestId).matches()) {
            throw AppException.badRequest("INVALID_UPLOAD");
        }
    }

    private void checkCancelled(String requestId) {
        if (requestId != null && cancelledRequests.containsKey(requestId)) {
            throw AppException.conflict("UPLOAD_CANCELLED");
        }
    }

    private void finishRequestTracking(String requestId) {
        if (requestId != null) {
            cancelledRequests.remove(requestId);
            runningProcesses.remove(requestId);
        }
    }

    private static void validateSourceDuration(double duration, boolean youtube) {
        if (!Double.isFinite(duration) || duration <= 0 || duration > MAX_SOURCE_DURATION_SEC) {
            throw AppException.badRequest(youtube ? "INVALID_YOUTUBE_DURATION" : "INVALID_UPLOAD");
        }
    }

    public static void validateSegmentRanges(
            double listenStart, double listenEnd, double singStart, double singEnd, double totalDuration) {
        if (!Double.isFinite(listenStart) || !Double.isFinite(listenEnd)
                || !Double.isFinite(singStart) || !Double.isFinite(singEnd)) {
            throw AppException.badRequest("INVALID_SEGMENT_RANGE");
        }
        double listenLen = listenEnd - listenStart;
        double singLen = singEnd - singStart;
        if (listenStart < 0 || singStart < 0
                || listenLen < MIN_LISTEN_DURATION_SEC || listenLen > MAX_LISTEN_DURATION_SEC
                || singLen < MIN_SING_DURATION_SEC || singLen > MAX_SING_DURATION_SEC
                || listenEnd > totalDuration + END_TOLERANCE_SEC
                || singEnd > totalDuration + END_TOLERANCE_SEC) {
            throw AppException.badRequest("INVALID_SEGMENT_RANGE");
        }
    }

    private static MediaType detectVideoMediaType(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".webm")) return MediaType.valueOf("video/webm");
        if (name.endsWith(".mov")) return MediaType.valueOf("video/quicktime");
        return MediaType.valueOf("video/mp4");
    }

    private void rollbackCloudinary(String videoUrl, String vocalUrl) {
        if (videoUrl != null && !videoUrl.isBlank()) {
            try {
                cloudinaryMediaService.deleteByUrl(videoUrl);
            } catch (Exception ignored) {
            }
        }
        if (vocalUrl != null && !vocalUrl.isBlank()) {
            try {
                cloudinaryMediaService.deleteByUrl(vocalUrl);
            } catch (Exception ignored) {
            }
        }
    }

    private void evictExpiredDrafts() {
        long ttlMillis = Math.max(1L, draftTtlMinutes) * 60_000L;
        long now = System.currentTimeMillis();
        for (Map.Entry<String, DraftState> entry : drafts.entrySet()) {
            DraftState state = entry.getValue();
            if (!state.inUse.get() && now - state.lastAccessedMillis > ttlMillis) {
                deleteDraftInternal(entry.getKey());
            }
        }
    }

    private void sweepOrphanedTempDirs() {
        try {
            Path tempRoot = Path.of(System.getProperty("java.io.tmpdir"));
            try (Stream<Path> children = Files.list(tempRoot)) {
                children.filter(Files::isDirectory)
                        .filter(p -> p.getFileName().toString().startsWith("karaoke-draft-"))
                        .forEach(this::deleteDirectoryQuietly);
            }
        } catch (Exception ignored) {
        }
    }

    private void deleteDraftInternal(String draftId) {
        DraftState removed = drafts.remove(draftId);
        if (removed != null) {
            deleteDirectoryQuietly(removed.dir);
        }
    }

    private void deleteDirectoryQuietly(Path dir) {
        if (dir == null || !Files.exists(dir)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(this::deleteFileQuietly);
        } catch (IOException ignored) {
        }
    }

    private void deleteFileQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
        }
    }
}
