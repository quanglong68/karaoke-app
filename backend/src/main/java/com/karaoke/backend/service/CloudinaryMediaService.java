package com.karaoke.backend.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class CloudinaryMediaService {
    private static final Logger log = LoggerFactory.getLogger(CloudinaryMediaService.class);
    private static final Pattern UPLOAD_URL_PATTERN =
            Pattern.compile("^https?://res\\.cloudinary\\.com/([^/]+)/(image|video|raw)/upload/(?:v\\d+/)?(.+)$");
    private static final int UPLOAD_CONNECT_TIMEOUT_MS = 15_000;
    private static final int UPLOAD_SOCKET_TIMEOUT_MS = 300_000;
    private static final int DELETE_CONNECT_TIMEOUT_MS = 10_000;
    private static final int DELETE_SOCKET_TIMEOUT_MS = 30_000;

    private final String cloudName;
    private final Cloudinary cloudinary;

    public CloudinaryMediaService(
            @Value("${cloudinary.cloud-name:}") String cloudName,
            @Value("${cloudinary.api-key:}") String apiKey,
            @Value("${cloudinary.api-secret:}") String apiSecret) {
        this.cloudName = cloudName.trim();
        boolean configured = !this.cloudName.isBlank() && !apiKey.isBlank() && !apiSecret.isBlank();
        this.cloudinary = configured
                ? new Cloudinary(ObjectUtils.asMap(
                        "cloud_name", this.cloudName,
                        "api_key", apiKey,
                        "api_secret", apiSecret))
                : null;
    }

    public boolean isConfigured() {
        return cloudinary != null;
    }

    public String uploadVideo(Path filePath, String folder) throws IOException {
        return upload(filePath, folder, "video");
    }

    public String uploadAudio(Path filePath, String folder) throws IOException {
        return upload(filePath, folder, "auto");
    }

    public boolean deleteByUrl(String url) {
        if (cloudinary == null || url == null || url.isBlank()) {
            return false;
        }
        Matcher matcher = UPLOAD_URL_PATTERN.matcher(url);
        if (!matcher.matches() || !cloudName.equals(matcher.group(1))) {
            log.warn("Skipping Cloudinary delete for non-upload URL");
            return false;
        }
        String resourceType = matcher.group(2);
        String publicId = trimExtension(URLDecoder.decode(matcher.group(3), StandardCharsets.UTF_8));
        try {
            Map<?, ?> result = cloudinary.uploader().destroy(publicId, ObjectUtils.asMap(
                    "resource_type", resourceType,
                    "invalidate", true,
                    "connect_timeout", DELETE_CONNECT_TIMEOUT_MS,
                    "connection_request_timeout", DELETE_CONNECT_TIMEOUT_MS,
                    "timeout", DELETE_SOCKET_TIMEOUT_MS));
            Object status = result.get("result");
            return "ok".equals(status) || "not found".equals(status);
        } catch (IOException exception) {
            log.warn("Cloudinary delete failed for publicId={}", publicId, exception);
            return false;
        }
    }

    private static String trimExtension(String publicId) {
        int lastSlash = publicId.lastIndexOf('/');
        int lastDot = publicId.lastIndexOf('.');
        return lastDot > lastSlash ? publicId.substring(0, lastDot) : publicId;
    }

    private String upload(Path filePath, String folder, String resourceType) throws IOException {
        if (cloudinary == null) {
            throw new IllegalStateException("CLOUDINARY_NOT_CONFIGURED");
        }
        Map<?, ?> uploadResult = cloudinary.uploader().upload(filePath.toFile(), ObjectUtils.asMap(
                "folder", folder,
                "resource_type", resourceType,
                "overwrite", true,
                "use_filename", true,
                "unique_filename", true,
                "connect_timeout", UPLOAD_CONNECT_TIMEOUT_MS,
                "connection_request_timeout", UPLOAD_CONNECT_TIMEOUT_MS,
                "timeout", UPLOAD_SOCKET_TIMEOUT_MS));

        Object secureUrl = uploadResult.get("secure_url");
        if (!(secureUrl instanceof String)) {
            throw new IllegalStateException("UPLOAD_FAILED");
        }
        return (String) secureUrl;
    }
}
