package com.karaoke.backend.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;

@Entity
@Table(name = "ai_api_keys")
@Getter
@Setter
@NoArgsConstructor
public class AiApiKeyEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(length = 100)
    private String label;

    @Column(name = "key_encrypted", nullable = false, columnDefinition = "text")
    private String keyEncrypted;

    @Column(name = "key_masked", nullable = false, length = 24)
    private String keyMasked;

    @Column(name = "key_fingerprint", nullable = false, unique = true, length = 64)
    private String keyFingerprint;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private int priority = 100;

    @Column(name = "fail_count", nullable = false)
    private int failCount = 0;

    @Column(name = "last_test_at")
    private OffsetDateTime lastTestAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "last_test_status", nullable = false, length = 20)
    private AiTestStatus lastTestStatus = AiTestStatus.NEVER;

    @Column(name = "last_test_message", length = 500)
    private String lastTestMessage;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
