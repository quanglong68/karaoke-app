package com.karaoke.backend.config;

import com.karaoke.backend.exception.AppException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    private static final Map<String, String> MESSAGES = Map.ofEntries(
            Map.entry("ROOM_NOT_FOUND", "Không tìm thấy phòng."),
            Map.entry("ROOM_FULL", "Phòng đã đầy."),
            Map.entry("ROOM_PLAYING", "Phòng đang chơi."),
            Map.entry("NO_SONGS", "Chưa có bài hát nào trong hệ thống."),
            Map.entry("ROOM_NAME_INVALID", "Tên phòng không hợp lệ."),
            Map.entry("USER_NAME_INVALID", "Tên người dùng không hợp lệ."),
            Map.entry("SESSION_INVALID", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."),
            Map.entry("ADMIN_UNAUTHORIZED", "Bạn không có quyền quản trị."),
            Map.entry("CLOUDINARY_NOT_CONFIGURED", "Cloudinary chưa được cấu hình."),
            Map.entry("UPLOAD_FAILED", "Không thể xử lý file tải lên."),
            Map.entry("UPLOAD_BUSY", "Hệ thống đang xử lý một file khác, vui lòng thử lại."),
            Map.entry("INVALID_UPLOAD", "File hoặc thông tin bài hát không hợp lệ."),
            Map.entry("FILE_TOO_LARGE", "File quá lớn, vui lòng chọn file nhỏ hơn."),
            Map.entry("RATE_LIMITED", "Bạn thao tác quá nhanh, vui lòng thử lại sau."),
            Map.entry("EXTRACT_TIMEOUT", "Quá thời gian phân tích file audio."),
            Map.entry("NOT_FOUND", "Không tìm thấy tài nguyên."),
            Map.entry("BAD_REQUEST", "Yêu cầu không hợp lệ."),
            Map.entry("INTERNAL_ERROR", "Đã xảy ra lỗi, vui lòng thử lại."));

    @ExceptionHandler(AppException.class)
    public ResponseEntity<Map<String, String>> handleApp(AppException exception) {
        return ResponseEntity.status(exception.getStatus()).body(error(exception.getCode()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleResponseStatus(ResponseStatusException exception) {
        String code = exception.getReason() != null ? exception.getReason() : "REQUEST_FAILED";
        return ResponseEntity.status(exception.getStatusCode()).body(error(code));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> handleMaxUploadSize(MaxUploadSizeExceededException exception) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(error("FILE_TOO_LARGE"));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgument(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().body(error("BAD_REQUEST"));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleIllegalState(IllegalStateException exception) {
        String code = exception.getMessage() != null ? exception.getMessage() : "CONFLICT";
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error(code));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NoResourceFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("NOT_FOUND"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception exception) {
        log.error("Unhandled request error", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error("INTERNAL_ERROR"));
    }

    private Map<String, String> error(String code) {
        return Map.of("code", code, "message", MESSAGES.getOrDefault(code, "Đã xảy ra lỗi, vui lòng thử lại."));
    }
}
