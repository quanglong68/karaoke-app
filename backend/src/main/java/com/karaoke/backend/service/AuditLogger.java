package com.karaoke.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class AuditLogger {

    private static final Logger audit = LoggerFactory.getLogger("AUDIT");
    private static final int MAX_VALUE_LENGTH = 160;

    public void event(String event, String actor, String ip, String detail) {
        audit.info("event={} actor={} ip={} detail={}",
                sanitize(event), sanitize(actor), sanitize(ip), sanitize(detail));
    }

    private String sanitize(String value) {
        if (value == null || value.isBlank()) {
            return "-";
        }
        String cleaned = value.replace('\r', '_').replace('\n', '_').replace('\t', '_').trim();
        return cleaned.length() <= MAX_VALUE_LENGTH ? cleaned : cleaned.substring(0, MAX_VALUE_LENGTH);
    }
}
