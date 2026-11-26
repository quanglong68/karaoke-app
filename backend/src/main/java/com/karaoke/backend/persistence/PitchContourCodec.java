package com.karaoke.backend.persistence;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

@Component
public class PitchContourCodec {

    public static final String ENCODING = "GZIP_JSON_DOUBLE";

    private static final TypeReference<List<Double>> CONTOUR_TYPE = new TypeReference<>() {
    };

    // A 200k-sample contour is a few MB of JSON. Refusing anything larger keeps a
    // corrupted or tampered blob from expanding without bound during decode.
    private static final int MAX_DECOMPRESSED_BYTES = 8 * 1024 * 1024;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public PitchContourEntity encode(String songId, List<Double> contour) {
        List<Double> values = contour == null ? List.of() : new ArrayList<>(contour);
        byte[] json;
        try {
            json = objectMapper.writeValueAsBytes(values);
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot serialize pitch contour for " + songId, exception);
        }
        ByteArrayOutputStream compressed = new ByteArrayOutputStream(json.length);
        try (GZIPOutputStream gzip = new GZIPOutputStream(compressed)) {
            gzip.write(json);
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot compress pitch contour for " + songId, exception);
        }
        PitchContourEntity entity = new PitchContourEntity();
        entity.setSongId(songId);
        entity.setEncoding(ENCODING);
        entity.setSampleCount(values.size());
        entity.setData(compressed.toByteArray());
        return entity;
    }

    public List<Double> decode(PitchContourEntity entity) {
        if (entity == null) {
            return List.of();
        }
        if (!ENCODING.equals(entity.getEncoding())) {
            throw new IllegalStateException("Unsupported pitch contour encoding: " + entity.getEncoding());
        }
        try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(entity.getData()))) {
            byte[] json = readLimited(gzip, entity.getSongId());
            List<Double> values = objectMapper.readValue(json, CONTOUR_TYPE);
            if (values == null) {
                return List.of();
            }
            if (values.size() != entity.getSampleCount()) {
                throw new IllegalStateException("Pitch contour sample count mismatch for song " + entity.getSongId());
            }
            return Collections.unmodifiableList(new ArrayList<>(values));
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot decode pitch contour for song " + entity.getSongId(), exception);
        }
    }

    private byte[] readLimited(GZIPInputStream gzip, String songId) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = gzip.read(buffer)) != -1) {
            total += read;
            if (total > MAX_DECOMPRESSED_BYTES) {
                throw new IllegalStateException("Pitch contour too large for song " + songId);
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }
}
