export const MIN_LISTEN_SEC = 3;
export const MAX_LISTEN_SEC = 120;
export const MIN_SING_SEC = 5;
export const MAX_SING_SEC = 90;
export const MAX_SOURCE_DURATION_SEC = 15 * 60;

export interface SegmentRange {
    listenStart: number;
    listenEnd: number;
    singStart: number;
    singEnd: number;
}

export function round1(val: number): number {
    return Math.round(val * 10) / 10;
}

export function round2(val: number): number {
    return Math.round(val * 100) / 100;
}

/**
 * Formats a number of seconds for compact input display: e.g. 44.5 -> "44.5", 20 -> "20.0", 44.25 -> "44.25".
 */
export function formatSecondsInput(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0.0";
    const r2 = round2(seconds);
    if (Math.abs(r2 - round1(r2)) > 0.001) {
        return r2.toFixed(2);
    }
    return r2.toFixed(1);
}

/**
 * Parses flexible human input into seconds:
 * - "44.5" or "44,5" -> 44.5
 * - "01:14.5" or "1:14,25" -> 74.5 / 74.25
 */
export function parseFlexibleSeconds(raw: string): number | null {
    const cleaned = raw.trim().replace(",", ".");
    if (!cleaned) return null;

    if (cleaned.includes(":")) {
        const parts = cleaned.split(":");
        if (parts.length !== 2) return null;
        const mins = Number(parts[0]);
        const secs = Number(parts[1]);
        if (!Number.isInteger(mins) || mins < 0 || !Number.isFinite(secs) || secs < 0 || secs >= 60) {
            return null;
        }
        return round2(mins * 60 + secs);
    }

    if (!/^\d+(\.\d{0,3})?$/.test(cleaned)) {
        return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? round2(parsed) : null;
}

/**
 * Computes sensible initial Listen & Sing segments for a newly loaded song.
 */
export function computeDefaultSegments(totalDuration: number): SegmentRange {
    const safeTotal = Math.max(0, Number.isFinite(totalDuration) ? totalDuration : 0);
    if (safeTotal <= 0) {
        return { listenStart: 0, listenEnd: 15, singStart: 15, singEnd: 35 };
    }
    const listenStart = safeTotal >= 90 ? 20 : 0;
    const desiredListen = Math.min(15, Math.max(MIN_LISTEN_SEC, safeTotal * 0.35));
    const listenEnd = round1(Math.min(safeTotal, listenStart + desiredListen));
    const singStart = listenEnd;
    const remaining = Math.max(0, safeTotal - singStart);

    if (remaining >= MIN_SING_SEC) {
        const singEnd = round1(Math.min(safeTotal, singStart + Math.min(20, remaining)));
        return { listenStart: round1(listenStart), listenEnd, singStart, singEnd };
    }

    const splitPoint = round1(Math.max(MIN_LISTEN_SEC, Math.min(safeTotal - MIN_SING_SEC, safeTotal * 0.45)));
    const adjustedSplit = Math.max(0, Math.min(safeTotal, splitPoint));
    return {
        listenStart: 0,
        listenEnd: adjustedSplit,
        singStart: adjustedSplit,
        singEnd: round1(safeTotal),
    };
}

/**
 * Updates one boundary while optionally keeping listenEnd === singStart linked seamlessly.
 */
export function applySegmentChange(
    prev: SegmentRange,
    field: keyof SegmentRange,
    rawSeconds: number,
    totalDuration: number,
    linked: boolean,
): SegmentRange {
    const maxSec = totalDuration > 0 ? round2(totalDuration) : 900;
    const clamped = round2(Math.max(0, Math.min(maxSec, rawSeconds)));
    const next: SegmentRange = { ...prev, [field]: clamped };

    if (field === "listenStart" && next.listenStart >= next.listenEnd) {
        next.listenEnd = round2(Math.min(maxSec, next.listenStart + MIN_LISTEN_SEC));
        if (linked) {
            next.singStart = next.listenEnd;
        }
    } else if (field === "listenEnd") {
        if (next.listenEnd <= next.listenStart) {
            next.listenStart = round2(Math.max(0, next.listenEnd - MIN_LISTEN_SEC));
        }
        if (linked) {
            const prevSingLen = Math.max(MIN_SING_SEC, round2(prev.singEnd - prev.singStart));
            next.singStart = next.listenEnd;
            if (next.singEnd <= next.singStart) {
                next.singEnd = round2(Math.min(maxSec, next.singStart + prevSingLen));
            }
        }
    } else if (field === "singStart") {
        if (linked) {
            next.listenEnd = next.singStart;
            if (next.listenStart >= next.listenEnd) {
                next.listenStart = round2(Math.max(0, next.listenEnd - MIN_LISTEN_SEC));
            }
        }
        if (next.singEnd <= next.singStart) {
            next.singEnd = round2(Math.min(maxSec, next.singStart + MIN_SING_SEC));
        }
    } else if (field === "singEnd" && next.singEnd <= next.singStart) {
        next.singStart = round2(Math.max(0, next.singEnd - MIN_SING_SEC));
        if (linked) {
            next.listenEnd = next.singStart;
        }
    }

    return next;
}

export function formatSecondsLabel(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00.0";
    const mins = Math.floor(seconds / 60);
    const secs = seconds - mins * 60;
    const minsStr = String(mins).padStart(2, "0");
    const secsStr = secs.toFixed(1).padStart(4, "0");
    return `${minsStr}:${secsStr}`;
}

export function validateSegments(range: SegmentRange, totalDuration: number): string {
    if (
        !Number.isFinite(range.listenStart) ||
        !Number.isFinite(range.listenEnd) ||
        !Number.isFinite(range.singStart) ||
        !Number.isFinite(range.singEnd)
    ) {
        return "Mốc thời gian không hợp lệ.";
    }
    if (totalDuration <= 0) {
        return "Chưa đọc được thời lượng bài hát.";
    }
    if (totalDuration > MAX_SOURCE_DURATION_SEC) {
        return "Video nguồn dài quá 15 phút. Hãy chọn video ngắn hơn.";
    }
    const listenLen = round2(range.listenEnd - range.listenStart);
    const singLen = round2(range.singEnd - range.singStart);

    if (range.listenStart < 0 || range.singStart < 0) {
        return "Mốc bắt đầu không được nhỏ hơn 0s.";
    }
    if (listenLen < MIN_LISTEN_SEC || listenLen > MAX_LISTEN_SEC) {
        return `Đoạn mồi cần dài ${MIN_LISTEN_SEC}–${MAX_LISTEN_SEC}s (đang chọn ${listenLen.toFixed(1)}s).`;
    }
    if (singLen < MIN_SING_SEC || singLen > MAX_SING_SEC) {
        return `Đoạn hát cần dài ${MIN_SING_SEC}–${MAX_SING_SEC}s (đang chọn ${singLen.toFixed(1)}s).`;
    }
    if (range.listenEnd > totalDuration + 0.5 || range.singEnd > totalDuration + 0.5) {
        return `Mốc kết thúc vượt quá thời lượng video (${totalDuration.toFixed(1)}s).`;
    }
    return "";
}

export function cleanClientFilenameTitle(fileName: string): string {
    if (!fileName) return "";
    let cleaned = fileName.replace(/\.[^.]+$/, "");
    cleaned = cleaned.replace(/^\d{10,}_(?:main_|vocal_)?/, "");
    cleaned = cleaned.replace(/\s*[[(][^\])]*(official|mv|m\/v|lyric|lyrics|audio|4k|hd|karaoke)[^\])]*[\])]/gi, "");
    if (!cleaned.includes(" ") && (cleaned.includes("_") || cleaned.includes("-"))) {
        cleaned = cleaned.replace(/[_-]+/g, " ");
    }
    cleaned = cleaned.replace(/^\s*\d{1,3}[._\-\s]+/, "");
    return cleaned.replace(/\s{2,}/g, " ").trim().slice(0, 120);
}

export function isLikelyYoutubeUrl(raw: string): boolean {
    const trimmed = raw.trim();
    if (!trimmed) return false;
    try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.toLowerCase();
        return (
            host === "youtu.be" ||
            host === "youtube.com" ||
            host === "www.youtube.com" ||
            host === "m.youtube.com" ||
            host === "music.youtube.com"
        );
    } catch {
        return false;
    }
}
