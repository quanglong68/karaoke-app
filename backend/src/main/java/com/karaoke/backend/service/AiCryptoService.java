package com.karaoke.backend.service;

import com.karaoke.backend.exception.AppException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;

/**
 * AES-256-GCM encryption for Gemini API keys persisted in PostgreSQL; master key from AI_CRYPTO_KEY.
 */
@Service
public class AiCryptoService {

    private static final int GCM_TAG_BITS = 128;
    private static final int IV_BYTES = 12;

    private final String cryptoKeyRaw;
    private final SecureRandom random = new SecureRandom();

    public AiCryptoService(@Value("${ai.crypto-key:}") String cryptoKeyRaw) {
        this.cryptoKeyRaw = cryptoKeyRaw == null ? "" : cryptoKeyRaw.trim();
    }

    public boolean isConfigured() {
        return !cryptoKeyRaw.isBlank();
    }

    private SecretKeySpec secretKey() {
        if (!isConfigured()) {
            throw AppException.unavailable("AI_CRYPTO_NOT_CONFIGURED");
        }
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            byte[] keyBytes = sha.digest(cryptoKeyRaw.getBytes(StandardCharsets.UTF_8));
            return new SecretKeySpec(keyBytes, "AES");
        } catch (Exception exception) {
            throw new IllegalStateException("Không thể khởi tạo khóa mã hóa AI", exception);
        }
    }

    public String encrypt(String rawKey) {
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] cipherText = cipher.doFinal(rawKey.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[IV_BYTES + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, IV_BYTES);
            System.arraycopy(cipherText, 0, combined, IV_BYTES, cipherText.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (AppException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Mã hóa API key thất bại", exception);
        }
    }

    public String decrypt(String encrypted) {
        try {
            byte[] combined = Base64.getDecoder().decode(encrypted);
            if (combined.length <= IV_BYTES) {
                throw new IllegalArgumentException("Dữ liệu mã hóa không hợp lệ");
            }
            byte[] iv = Arrays.copyOfRange(combined, 0, IV_BYTES);
            byte[] cipherText = Arrays.copyOfRange(combined, IV_BYTES, combined.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (AppException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Không thể giải mã API key (kiểm tra lại AI_CRYPTO_KEY)", exception);
        }
    }

    public static String fingerprint(String rawKey) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            byte[] digest = sha.digest(rawKey.trim().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception exception) {
            throw new IllegalStateException("Fingerprint thất bại", exception);
        }
    }

    public static String mask(String rawKey) {
        if (rawKey == null || rawKey.isBlank()) {
            return "••••";
        }
        String trimmed = rawKey.trim();
        if (trimmed.length() <= 8) {
            return "••••" + trimmed.substring(Math.max(0, trimmed.length() - 4));
        }
        return trimmed.substring(0, 4) + "••••" + trimmed.substring(trimmed.length() - 4);
    }
}
