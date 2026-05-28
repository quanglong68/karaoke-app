package com.karaoke.backend.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

@Service
public class CloudinaryMediaService {
    private final Cloudinary cloudinary;

    public CloudinaryMediaService(
            @Value("${cloudinary.cloud-name}") String cloudName,
            @Value("${cloudinary.api-key}") String apiKey,
            @Value("${cloudinary.api-secret}") String apiSecret) {
        this.cloudinary = new Cloudinary(ObjectUtils.asMap(
                "cloud_name", cloudName,
                "api_key", apiKey,
                "api_secret", apiSecret));
    }

    public String uploadVideo(Path filePath, String folder) throws IOException {
        return upload(filePath, folder, "video");
    }

    public String uploadAudio(Path filePath, String folder) throws IOException {
        return upload(filePath, folder, "auto");
    }

    private String upload(Path filePath, String folder, String resourceType) throws IOException {
        Map<?, ?> uploadResult = cloudinary.uploader().upload(filePath.toFile(), ObjectUtils.asMap(
                "folder", folder,
                "resource_type", resourceType,
                "overwrite", true,
                "use_filename", true,
                "unique_filename", true));

        Object secureUrl = uploadResult.get("secure_url");
        if (!(secureUrl instanceof String)) {
            throw new IllegalStateException("Cloudinary không trả về secure_url hợp lệ");
        }
        return (String) secureUrl;
    }
}