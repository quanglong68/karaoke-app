import React, { useMemo, useRef } from "react";
import { formatSecondsLabel, round1, type SegmentRange } from "./songSegmentUtils";

type HandleKind = "listenStart" | "listenEnd" | "singStart" | "singEnd" | "playhead";

interface DualTimelineTrackProps {
    totalDuration: number;
    currentTime: number;
    segments: SegmentRange;
    linked?: boolean;
    disabled?: boolean;
    onSeek: (seconds: number) => void;
    onChangeField: (field: keyof SegmentRange, seconds: number) => void;
}

const DualTimelineTrack: React.FC<DualTimelineTrackProps> = ({
    totalDuration,
    currentTime,
    segments,
    linked = true,
    disabled = false,
    onSeek,
    onChangeField,
}) => {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const activeHandleRef = useRef<HandleKind | null>(null);

    const ticks = useMemo(() => {
        if (totalDuration <= 0) return [];
        const step =
            totalDuration <= 30
                ? 5
                : totalDuration <= 90
                  ? 15
                  : totalDuration <= 240
                    ? 30
                    : 60;
        const out: number[] = [];
        for (let t = 0; t <= totalDuration; t += step) {
            out.push(t);
        }
        return out;
    }, [totalDuration]);

    const clientXToSeconds = (clientX: number): number => {
        const el = trackRef.current;
        if (!el || totalDuration <= 0) return 0;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0) return 0;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return round1(ratio * totalDuration);
    };

    const startDrag = (kind: HandleKind, e: React.PointerEvent) => {
        if (disabled || totalDuration <= 0) return;
        e.stopPropagation();
        e.preventDefault();
        activeHandleRef.current = kind;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        if (kind === "playhead") {
            onSeek(clientXToSeconds(e.clientX));
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        const active = activeHandleRef.current;
        if (!active || disabled) return;
        const sec = clientXToSeconds(e.clientX);
        if (active === "playhead") {
            onSeek(sec);
        } else {
            onChangeField(active, sec);
        }
    };

    const stopDrag = (e: React.PointerEvent) => {
        if (!activeHandleRef.current) return;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        } catch {
            // Ignore if pointer capture already released
        }
        activeHandleRef.current = null;
    };

    const pct = (sec: number) =>
        totalDuration > 0 ? Math.max(0, Math.min(100, (sec / totalDuration) * 100)) : 0;

    const listenLeft = pct(segments.listenStart);
    const listenRight = pct(segments.listenEnd);
    const singLeft = pct(segments.singStart);
    const singRight = pct(segments.singEnd);
    const playheadLeft = pct(currentTime);

    return (
        <div className="studio-timeline">
            <div
                ref={trackRef}
                className={`studio-track${disabled ? " is-disabled" : ""}`}
                onPointerDown={e => startDrag("playhead", e)}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
            >
                {/* Ruler background marks */}
                {ticks.map(t => (
                    <span
                        key={t}
                        className="studio-tick"
                        style={{ left: `${pct(t)}%` }}
                    >
                        <i />
                        <em>{formatSecondsLabel(t).replace(/\.0$/, "")}</em>
                    </span>
                ))}

                {/* Listen segment block */}
                <div
                    className="studio-region studio-region--listen"
                    style={{
                        left: `${listenLeft}%`,
                        width: `${Math.max(0.4, listenRight - listenLeft)}%`,
                    }}
                >
                    <span className="studio-region-tag">Mồi · {round1(segments.listenEnd - segments.listenStart)}s</span>
                </div>

                {/* Sing segment block */}
                <div
                    className="studio-region studio-region--sing"
                    style={{
                        left: `${singLeft}%`,
                        width: `${Math.max(0.4, singRight - singLeft)}%`,
                    }}
                >
                    <span className="studio-region-tag">Hát · {round1(segments.singEnd - segments.singStart)}s</span>
                </div>

                {/* Draggable handles */}
                <button
                    type="button"
                    className="studio-handle studio-handle--listen"
                    style={{ left: `${listenLeft}%` }}
                    aria-label="Kéo mốc bắt đầu đoạn nghe mồi"
                    title={`Bắt đầu đoạn mồi: ${segments.listenStart.toFixed(1)}s`}
                    disabled={disabled}
                    onPointerDown={e => startDrag("listenStart", e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={stopDrag}
                />
                {linked && Math.abs(segments.listenEnd - segments.singStart) < 0.05 ? (
                    <button
                        type="button"
                        className="studio-handle studio-handle--split"
                        style={{ left: `${listenRight}%` }}
                        aria-label="Kéo mốc chuyển từ đoạn mồi sang đoạn hát"
                        title={`Mốc chuyển mồi → hát: ${segments.listenEnd.toFixed(1)}s`}
                        disabled={disabled}
                        onPointerDown={e => startDrag("listenEnd", e)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={stopDrag}
                    />
                ) : (
                    <>
                        <button
                            type="button"
                            className="studio-handle studio-handle--listen-end"
                            style={{ left: `${listenRight}%` }}
                            aria-label="Kéo mốc kết thúc đoạn nghe mồi"
                            title={`Kết thúc đoạn mồi: ${segments.listenEnd.toFixed(1)}s`}
                            disabled={disabled}
                            onPointerDown={e => startDrag("listenEnd", e)}
                            onPointerMove={handlePointerMove}
                            onPointerUp={stopDrag}
                        />
                        <button
                            type="button"
                            className="studio-handle studio-handle--sing-start"
                            style={{ left: `${singLeft}%` }}
                            aria-label="Kéo mốc bắt đầu đoạn hát"
                            title={`Bắt đầu đoạn hát: ${segments.singStart.toFixed(1)}s`}
                            disabled={disabled}
                            onPointerDown={e => startDrag("singStart", e)}
                            onPointerMove={handlePointerMove}
                            onPointerUp={stopDrag}
                        />
                    </>
                )}
                <button
                    type="button"
                    className="studio-handle studio-handle--sing"
                    style={{ left: `${singRight}%` }}
                    aria-label="Kéo mốc kết thúc đoạn hát"
                    title={`Kết thúc đoạn hát: ${segments.singEnd.toFixed(1)}s`}
                    disabled={disabled}
                    onPointerDown={e => startDrag("singEnd", e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={stopDrag}
                />

                {/* Playhead */}
                <div
                    className="studio-playhead"
                    style={{ left: `${playheadLeft}%` }}
                    aria-hidden="true"
                />
            </div>
        </div>
    );
};

export default DualTimelineTrack;
