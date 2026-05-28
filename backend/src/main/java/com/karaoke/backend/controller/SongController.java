package com.karaoke.backend.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.model.Song;
import com.karaoke.backend.service.CloudinaryMediaService;
import com.karaoke.backend.service.GameService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class SongController {

    @Autowired
    private GameService gameService;

    @Autowired
    private CloudinaryMediaService cloudinaryMediaService;

    @PostMapping("/upload-song")
    public ResponseEntity<?> uploadSong(
            @RequestParam("mainVideo") MultipartFile mainVideo,
            @RequestParam("vocalFile") MultipartFile vocalFile,
            @RequestParam("title") String title,
            @RequestParam("lyrics") String lyrics,
            @RequestParam("duration") double duration) {
        try {
            Path mainTempPath = createTempFile(mainVideo);
            Path vocalTempPath = createTempFile(vocalFile);

            // 1. UPLOAD MEDIA LÊN CLOUDINARY
            String videoUrl = cloudinaryMediaService.uploadVideo(mainTempPath, "karaoke/videos");
            cloudinaryMediaService.uploadAudio(vocalTempPath, "karaoke/vocals");

            // 2. JAVA GỌI PYTHON CHẠY AI LẤY PITCH TỪ FILE TẠM
            List<Double> pitchContour = runPythonExtractor(vocalTempPath.toString());

            // 3. LƯU VÀO DATABASE
            Song savedSong = gameService.addNewSong(title, videoUrl, duration, lyrics, pitchContour);

            // 4. DỌN RÁC (XÓA FILE TẠM VÀ FILE JSON TẠM)
            cleanupTempArtifacts(mainTempPath, vocalTempPath);

            return ResponseEntity.ok(savedSong);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("Lỗi hệ thống: " + e.getMessage());
        }
    }

    private List<Double> runPythonExtractor(String vocalFilePath) throws Exception {
        System.out.println("⏳ Đang kích hoạt Python...");

        // Cấu hình lệnh chạy Terminal (Windows thường dùng "python", Mac/Linux dùng
        // "python3")
        ProcessBuilder processBuilder = new ProcessBuilder("python", "extract.py", vocalFilePath);
        processBuilder.redirectErrorStream(true); // Gộp cả luồng log và luồng lỗi
        processBuilder.redirectOutput(ProcessBuilder.Redirect.INHERIT); // In log Python ra console của Java

        Process process = processBuilder.start();
        int exitCode = process.waitFor();

        if (exitCode != 0) {
            throw new RuntimeException("Tiến trình Python chạy thất bại với mã lỗi: " + exitCode);
        }

        // Đọc kết quả file JSON do Python xuất ra
        String jsonFilePath = vocalFilePath.substring(0, vocalFilePath.lastIndexOf('.')) + ".json";
        File jsonFile = new File(jsonFilePath);

        if (!jsonFile.exists()) {
            throw new RuntimeException("Không tìm thấy file kết quả từ Python!");
        }

        ObjectMapper mapper = new ObjectMapper();
        return mapper.readValue(jsonFile, new TypeReference<List<Double>>() {
        });
    }

    private Path createTempFile(MultipartFile file) throws Exception {
        String suffix = getFileExtension(file.getOriginalFilename());
        Path tempFile = Files.createTempFile("karaoke-upload-", suffix);
        Files.copy(file.getInputStream(), tempFile, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        return tempFile;
    }

    private void cleanupTempArtifacts(Path mainTempPath, Path vocalTempPath) {
        try {
            Files.deleteIfExists(mainTempPath);
        } catch (Exception ignored) {
        }

        try {
            Files.deleteIfExists(vocalTempPath);
        } catch (Exception ignored) {
        }

        String jsonTempPath = vocalTempPath.toString().substring(0, vocalTempPath.toString().lastIndexOf('.'))
                + ".json";
        try {
            Files.deleteIfExists(Path.of(jsonTempPath));
        } catch (Exception ignored) {
        }
    }

    private String getFileExtension(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return ".tmp";
        }
        int dotIndex = originalFilename.lastIndexOf('.');
        if (dotIndex < 0 || dotIndex == originalFilename.length() - 1) {
            return ".tmp";
        }
        return originalFilename.substring(dotIndex);
    }
}