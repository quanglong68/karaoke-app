package com.karaoke.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Guards cookie-authenticated admin mutations against cross-site and simple-form CSRF
 * by rejecting cross-site Fetch metadata and requiring the custom X-Requested-With header.
 */
public class AdminCsrfHeaderFilter extends OncePerRequestFilter {

    private static final Set<String> MUTATING_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
    static final String REQUIRED_HEADER = "X-Requested-With";
    static final String REQUIRED_VALUE = "XMLHttpRequest";
    private static final String FORBIDDEN_BODY =
            "{\"code\":\"ADMIN_FORBIDDEN\",\"message\":\"Bạn không có quyền quản trị.\"}";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (!MUTATING_METHODS.contains(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }
        String fetchSite = request.getHeader("Sec-Fetch-Site");
        if (fetchSite != null && "cross-site".equalsIgnoreCase(fetchSite.trim())) {
            SecurityFilterSupport.writeJsonError(response, HttpServletResponse.SC_FORBIDDEN, FORBIDDEN_BODY);
            return;
        }
        String sessionCookie = SecurityFilterSupport.readAdminSessionCookie(request);
        boolean hasCookie = sessionCookie != null && !sessionCookie.isBlank();
        if (!SecurityFilterSupport.isAdminLoginRequest(request) && hasCookie
                && !REQUIRED_VALUE.equals(request.getHeader(REQUIRED_HEADER))) {
            SecurityFilterSupport.writeJsonError(response, HttpServletResponse.SC_FORBIDDEN, FORBIDDEN_BODY);
            return;
        }
        filterChain.doFilter(request, response);
    }
}
