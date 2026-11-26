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
@Table(name = "ai_models")
@Getter
@Setter
@NoArgsConstructor
public class AiModelEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "model_name", nullable = false, unique = true, length = 120)
    private String modelName;

    @Column(name = "display_name", length = 120)
    private String displayName;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private int priority = 100;

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
