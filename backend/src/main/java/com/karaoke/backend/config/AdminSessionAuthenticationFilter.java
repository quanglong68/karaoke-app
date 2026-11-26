package com.karaoke.backend.config;

import com.karaoke.backend.service.AdminAuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

public class AdminSessionAuthenticationFilter extends OncePerRequestFilter {

    private final AdminAuthService adminAuthService;

    public AdminSessionAuthenticationFilter(AdminAuthService adminAuthService) {
        this.adminAuthService = adminAuthService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return SecurityFilterSupport.isAdminLoginRequest(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            String token = SecurityFilterSupport.readAdminSessionCookie(request);
            adminAuthService.authenticate(token).ifPresent(session -> {
                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        session.username(),
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + session.role().name())));
                authentication.setDetails(session);
                SecurityContextHolder.getContext().setAuthentication(authentication);
            });
        }
        filterChain.doFilter(request, response);
    }
}
