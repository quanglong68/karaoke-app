package com.karaoke.backend.config;

import com.karaoke.backend.exception.AppException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
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
            Map.entry("INVALID_ROOM_REQUEST", "Thông tin phòng không hợp lệ."),
            Map.entry("SESSION_INVALID", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."),
            Map.entry("ADMIN_UNAUTHORIZED", "Bạn cần đăng nhập quản trị."),
            Map.entry("ADMIN_FORBIDDEN", "Bạn không có quyền quản trị."),
            Map.entry("INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng."),
            Map.entry("WRONG_CURRENT_PASSWORD", "Mật khẩu hiện tại không đúng."),
            Map.entry("INVALID_PASSWORD", "Mật khẩu mới phải từ 12 ký tự trở lên (tối đa 72 byte) và khác mật khẩu hiện tại."),
            Map.entry("ACCOUNT_LOCKED", "Tài khoản tạm khoá do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau."),
            Map.entry("SONG_NOT_FOUND", "Không tìm thấy bài hát."),
            Map.entry("INVALID_SONG_UPDATE", "Thông tin cập nhật bài hát không hợp lệ."),
            Map.entry("INVALID_GAME_CONFIG", "Cấu hình game không hợp lệ. Hãy kiểm tra lại giới hạn từng ô."),
            Map.entry("INVALID_STATUS", "Trạng thái bài hát không hợp lệ."),
            Map.entry("CLOUDINARY_NOT_CONFIGURED", "Cloudinary chưa được cấu hình."),
            Map.entry("UPLOAD_FAILED", "Không thể xử lý file tải lên."),
            Map.entry("UPLOAD_BUSY", "Hệ thống đang xử lý một file khác, vui lòng thử lại."),
            Map.entry("UPLOAD_CANCELLED", "Đã huỷ tải lên."),
            Map.entry("INVALID_UPLOAD", "File hoặc thông tin bài hát không hợp lệ."),
            Map.entry("FILE_TOO_LARGE", "File quá lớn, vui lòng chọn file nhỏ hơn."),
            Map.entry("PAYLOAD_TOO_LARGE", "Yêu cầu vượt quá kích thước cho phép."),
            Map.entry("ROOM_CAPACITY_REACHED", "Hệ thống đang đạt giới hạn số phòng hoạt động, vui lòng thử lại sau."),
            Map.entry("RATE_LIMITED", "Bạn thao tác quá nhanh, vui lòng thử lại sau."),
            Map.entry("EXTRACT_TIMEOUT", "Quá thời gian phân tích file audio."),
            Map.entry("NOT_FOUND", "Không tìm thấy tài nguyên."),
            Map.entry("BAD_REQUEST", "Yêu cầu không hợp lệ."),
            Map.entry("CONFLICT", "Không thể thực hiện thao tác ở trạng thái hiện tại."),
            Map.entry("REQUEST_FAILED", "Yêu cầu không thể xử lý."),
            Map.entry("INTERNAL_ERROR", "Đã xảy ra lỗi, vui lòng thử lại."));

    @ExceptionHandler(AppException.class)
    public ResponseEntity<Map<String, String>> handleApp(AppException exception) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(exception.getStatus());
        if (exception.getRetryAfterSeconds() != null) {
            builder.header(HttpHeaders.RETRY_AFTER, String.valueOf(exception.getRetryAfterSeconds()));
        }
        return builder.body(error(exception.getCode()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleResponseStatus(ResponseStatusException exception) {
        // Reason text is for logs only: it can leak internal details to the client.
        log.warn("Request failed with {}: {}", exception.getStatusCode(), exception.getReason());
        return ResponseEntity.status(exception.getStatusCode()).body(error("REQUEST_FAILED"));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleUnreadableBody(HttpMessageNotReadableException exception) {
        if (hasBodyTooLargeCause(exception)) {
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(error("PAYLOAD_TOO_LARGE"));
        }
        return ResponseEntity.badRequest().body(error("BAD_REQUEST"));
    }

    private boolean hasBodyTooLargeCause(Throwable throwable) {
        for (Throwable current = throwable; current != null; current = current.getCause()) {
            if (current instanceof RequestBodyLimitFilter.BodyTooLargeException) {
                return true;
            }
        }
        return false;
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
        log.warn("Request failed due to state: {}", exception.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error("CONFLICT"));
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
