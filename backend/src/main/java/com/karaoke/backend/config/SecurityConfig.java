package com.karaoke.backend.config;

import com.karaoke.backend.service.AdminAuthService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.util.List;
import java.util.Set;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final String UNAUTHORIZED_BODY =
            "{\"code\":\"ADMIN_UNAUTHORIZED\",\"message\":\"Bạn cần đăng nhập quản trị.\"}";
    private static final String FORBIDDEN_BODY =
            "{\"code\":\"ADMIN_FORBIDDEN\",\"message\":\"Bạn không có quyền quản trị.\"}";
    private static final Set<String> LOOPBACK_ADDRESSES =
            Set.of("127.0.0.1", "::1", "0:0:0:0:0:0:0:1");

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public CorsConfigurationSource adminCorsConfigurationSource(
            @Value("${app.allowed-origins:}") String allowedOrigins) {
        List<String> originPatterns = SecurityFilterSupport.parseOriginPatterns(allowedOrigins);
        CorsConfiguration configuration = new CorsConfiguration();
        if (!originPatterns.isEmpty()) {
            configuration.setAllowedOriginPatterns(originPatterns);
        }
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Content-Type", "X-Requested-With"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/admin/**", configuration);
        return source;
    }

    @Bean
    @Order(1)
    public SecurityFilterChain actuatorSecurityFilterChain(HttpSecurity http) throws Exception {
        http
                .securityMatcher("/actuator/**")
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize.anyRequest().access((authentication, context) ->
                        new AuthorizationDecision(
                                LOOPBACK_ADDRESSES.contains(context.getRequest().getRemoteAddr()))))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, exception) ->
                                SecurityFilterSupport.writeJsonError(response, HttpServletResponse.SC_FORBIDDEN, FORBIDDEN_BODY))
                        .accessDeniedHandler((request, response, exception) ->
                                SecurityFilterSupport.writeJsonError(response, HttpServletResponse.SC_FORBIDDEN, FORBIDDEN_BODY)));
        return http.build();
    }

    @Bean
    @Order(2)
    public SecurityFilterChain apiSecurityFilterChain(HttpSecurity http, AdminAuthService adminAuthService,
            CorsConfigurationSource adminCorsConfigurationSource) throws Exception {
        http
                .securityMatcher("/api/admin/**")
                .cors(cors -> cors.configurationSource(adminCorsConfigurationSource))
                // Cookie is HttpOnly + SameSite=Strict scoped to /api/admin, and mutating requests
                // carry X-Requested-With after AdminCsrfHeaderFilter.
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.POST, "/api/admin/login").permitAll()
                        .anyRequest().hasRole("ADMIN"))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, exception) ->
                                SecurityFilterSupport.writeJsonError(response, HttpServletResponse.SC_UNAUTHORIZED, UNAUTHORIZED_BODY))
                        .accessDeniedHandler((request, response, exception) ->
                                SecurityFilterSupport.writeJsonError(response, HttpServletResponse.SC_FORBIDDEN, FORBIDDEN_BODY)))
                .addFilterBefore(new AdminSessionAuthenticationFilter(adminAuthService),
                        UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(new AdminCsrfHeaderFilter(), AdminSessionAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    @Order(3)
    public SecurityFilterChain defaultSecurityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/api/rooms/**", "/ws-karaoke/**", "/error").permitAll()
                        .anyRequest().denyAll());
        return http.build();
    }
}
