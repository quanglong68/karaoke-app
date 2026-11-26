package com.karaoke.backend.config;

import com.karaoke.backend.service.AdminAuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestBodyLimitFilter extends OncePerRequestFilter {

    static final long MAX_API_BODY_BYTES = 256L * 1024L;
    private static final String UPLOAD_PATH = "/api/admin/upload-song";
    private static final String DRAFT_UPLOAD_PATH = "/api/admin/song-drafts/upload-source";
    private static final java.util.regex.Pattern DRAFT_ANALYZE_PATH_PATTERN =
            java.util.regex.Pattern.compile("^/api/admin/song-drafts/[0-9a-fA-F-]{36}/analyze$");
    private static final String PAYLOAD_TOO_LARGE_BODY =
            "{\"code\":\"PAYLOAD_TOO_LARGE\",\"message\":\"Yêu cầu vượt quá kích thước cho phép.\"}";

    public static class BodyTooLargeException extends IOException {
        public BodyTooLargeException() {
            super("Request body exceeds limit");
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = SecurityFilterSupport.requestPath(request);
        if (!path.startsWith("/api/")) {
            return true;
        }
        String contentType = request.getContentType();
        boolean isMultipartAdminUpload = HttpMethod.POST.matches(request.getMethod())
                && (UPLOAD_PATH.equals(path)
                        || DRAFT_UPLOAD_PATH.equals(path)
                        || DRAFT_ANALYZE_PATH_PATTERN.matcher(path).matches())
                && contentType != null
                && contentType.toLowerCase(Locale.ROOT).startsWith("multipart/form-data");
        if (!isMultipartAdminUpload) {
            return false;
        }
        // Only lift the 256 KB body cap for requests carrying a structurally valid
        // admin session cookie and CSRF header, so anonymous clients cannot stream
        // 420 MB payloads past this filter.
        String sessionCookie = SecurityFilterSupport.readAdminSessionCookie(request);
        return AdminAuthService.isValidTokenShape(sessionCookie)
                && AdminCsrfHeaderFilter.REQUIRED_VALUE
                        .equals(request.getHeader(AdminCsrfHeaderFilter.REQUIRED_HEADER));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (request.getContentLengthLong() > MAX_API_BODY_BYTES) {
            SecurityFilterSupport.writeJsonError(
                    response, HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE, PAYLOAD_TOO_LARGE_BODY);
            return;
        }
        try {
            filterChain.doFilter(new BoundedBodyHttpServletRequest(request, MAX_API_BODY_BYTES), response);
        } catch (BodyTooLargeException exception) {
            if (!response.isCommitted()) {
                SecurityFilterSupport.writeJsonError(
                        response, HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE, PAYLOAD_TOO_LARGE_BODY);
            }
        }
    }

    private static final class BoundedBodyHttpServletRequest extends HttpServletRequestWrapper {
        private final long maxBytes;
        private ServletInputStream wrappedInputStream;
        private BufferedReader wrappedReader;

        private BoundedBodyHttpServletRequest(HttpServletRequest request, long maxBytes) {
            super(request);
            this.maxBytes = maxBytes;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (wrappedInputStream == null) {
                wrappedInputStream = new BoundedServletInputStream(super.getInputStream(), maxBytes);
            }
            return wrappedInputStream;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            if (wrappedReader == null) {
                String encoding = getCharacterEncoding();
                Charset charset = encoding != null ? Charset.forName(encoding) : StandardCharsets.UTF_8;
                wrappedReader = new BufferedReader(new InputStreamReader(getInputStream(), charset));
            }
            return wrappedReader;
        }
    }

    private static final class BoundedServletInputStream extends ServletInputStream {
        private final ServletInputStream delegate;
        private final long maxBytes;
        private long bytesRead;

        private BoundedServletInputStream(ServletInputStream delegate, long maxBytes) {
            this.delegate = delegate;
            this.maxBytes = maxBytes;
        }

        @Override
        public int read() throws IOException {
            int next = delegate.read();
            if (next != -1) {
                advance(1);
            }
            return next;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            int count = delegate.read(b, off, len);
            if (count > 0) {
                advance(count);
            }
            return count;
        }

        @Override
        public boolean isFinished() {
            return delegate.isFinished();
        }

        @Override
        public boolean isReady() {
            return delegate.isReady();
        }

        @Override
        public void setReadListener(ReadListener readListener) {
            delegate.setReadListener(readListener);
        }

        private void advance(long delta) throws IOException {
            bytesRead += delta;
            if (bytesRead > maxBytes) {
                throw new BodyTooLargeException();
            }
        }
    }
}
