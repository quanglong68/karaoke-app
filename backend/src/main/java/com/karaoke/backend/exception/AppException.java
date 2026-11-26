package com.karaoke.backend.exception;

import org.springframework.http.HttpStatus;

public class AppException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final Long retryAfterSeconds;

    public AppException(HttpStatus status, String code) {
        this(status, code, null);
    }

    public AppException(HttpStatus status, String code, Long retryAfterSeconds) {
        super(code);
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public Long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }

    public static AppException badRequest(String code) {
        return new AppException(HttpStatus.BAD_REQUEST, code);
    }

    public static AppException unauthorized(String code) {
        return new AppException(HttpStatus.UNAUTHORIZED, code);
    }

    public static AppException notFound(String code) {
        return new AppException(HttpStatus.NOT_FOUND, code);
    }

    public static AppException conflict(String code) {
        return new AppException(HttpStatus.CONFLICT, code);
    }

    public static AppException payloadTooLarge(String code) {
        return new AppException(HttpStatus.PAYLOAD_TOO_LARGE, code);
    }

    public static AppException tooManyRequests(String code) {
        return new AppException(HttpStatus.TOO_MANY_REQUESTS, code);
    }

    public static AppException tooManyRequests(String code, long retryAfterSeconds) {
        return new AppException(HttpStatus.TOO_MANY_REQUESTS, code, Math.max(1L, retryAfterSeconds));
    }

    public static AppException unavailable(String code) {
        return new AppException(HttpStatus.SERVICE_UNAVAILABLE, code);
    }

    public static AppException internal(String code) {
        return new AppException(HttpStatus.INTERNAL_SERVER_ERROR, code);
    }
}
