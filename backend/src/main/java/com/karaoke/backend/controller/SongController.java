package com.karaoke.backend.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.karaoke.backend.model.Song;
import com.karaoke.backend.service.GameService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;

@RestController
@RequestMapping("/api/admin")
@CrossOrigin("*")
public class SongController {

    @Autowired
    private GameService gameService;

    @PostMapping("/upload-song")
    public ResponseEntity<?> uploadSong(
            @RequestParam("mainVideo") MultipartFile mainVideo,
            @RequestParam("vocalFile") MultipartFile vocalFile,
            @RequestParam("title") String title,
            @RequestParam("lyrics") String lyrics,
            @RequestParam("duration") double duration
    ) {
        try {
            // 1. LƯU VIDEO CHÍNH VĨNH VIỄN
            File videoDir = new File("data/videos/");
            if (!videoDir.exists()) videoDir.mkdirs();

            String mainFileName = System.currentTimeMillis() + "_main_" + mainVideo.getOriginalFilename().replaceAll("\\s+", "");
            Path mainPath = Paths.get("data/videos/" + mainFileName);
            Files.copy(mainVideo.getInputStream(), mainPath, StandardCopyOption.REPLACE_EXISTING);
            String videoUrl = "http://localhost:8080/videos/" + mainFileName;

            // 2. LƯU FILE VOCAL TẠM THỜI
            File tempDir = new File("data/temp/");
            if (!tempDir.exists()) tempDir.mkdirs();

            String vocalFileName = System.currentTimeMillis() + "_vocal_" + vocalFile.getOriginalFilename().replaceAll("\\s+", "");
            Path vocalPath = Paths.get("data/temp/" + vocalFileName);
            Files.copy(vocalFile.getInputStream(), vocalPath, StandardCopyOption.REPLACE_EXISTING);

            // 3. JAVA GỌI PYTHON CHẠY AI LẤY PITCH
            List<Double> pitchContour = runPythonExtractor(vocalPath.toString());

            // 4. LƯU VÀO DATABASE
            Song savedSong = gameService.addNewSong(title, videoUrl, duration, lyrics, pitchContour);

            // 5. DỌN RÁC (XÓA FILE VOCAL VÀ FILE JSON TẠM)
            Files.deleteIfExists(vocalPath); // Xóa .wav/.mp4
            String jsonTempPath = vocalPath.toString().substring(0, vocalPath.toString().lastIndexOf('.')) + ".json";
            Files.deleteIfExists(Paths.get(jsonTempPath)); // Xóa .json

            return ResponseEntity.ok(savedSong);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("Lỗi hệ thống: " + e.getMessage());
        }
    }

    private List<Double> runPythonExtractor(String vocalFilePath) throws Exception {
        System.out.println("⏳ Đang kích hoạt Python...");

        // Cấu hình lệnh chạy Terminal (Windows thường dùng "python", Mac/Linux dùng "python3")
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
        return mapper.readValue(jsonFile, new TypeReference<List<Double>>() {});
    }
}