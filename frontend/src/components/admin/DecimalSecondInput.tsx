import React, { useState } from "react";
import { formatSecondsInput, parseFlexibleSeconds, round2 } from "./songSegmentUtils";

interface DecimalSecondInputProps {
    id: string;
    value: number;
    max: number;
    liveRange?: [number, number];
    disabled?: boolean;
    ariaLabel?: string;
    onChange: (nextSeconds: number) => void;
}

/**
 * Precision time input allowing natural typing of decimals ("44.5", "44,5", "1:14.5")
 * without swallowing trailing dots/commas or clobbering adjacent bounds mid-typing,
 * plus +/-0.1s stepper buttons and ArrowUp/ArrowDown stepping.
 */
const DecimalSecondInput: React.FC<DecimalSecondInputProps> = ({
    id,
    value,
    max,
    liveRange,
    disabled = false,
    ariaLabel,
    onChange,
}) => {
    const [focused, setFocused] = useState(false);
    const [draft, setDraft] = useState(() => formatSecondsInput(value));

    const clampToMax = (val: number) => round2(Math.max(0, Math.min(max > 0 ? max : 900, val)));

    const commitText = (rawText: string) => {
        const parsed = parseFlexibleSeconds(rawText);
        if (parsed === null) {
            setDraft(formatSecondsInput(value));
            return;
        }
        const clamped = clampToMax(parsed);
        onChange(clamped);
        setDraft(formatSecondsInput(clamped));
    };

    const stepBy = (delta: number) => {
        if (disabled) return;
        const base = focused ? (parseFlexibleSeconds(draft) ?? value) : value;
        const next = clampToMax(base + delta);
        onChange(next);
        setDraft(formatSecondsInput(next));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            commitText(draft);
            e.currentTarget.blur();
            return;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const step = e.shiftKey ? 1.0 : 0.1;
            stepBy(e.key === "ArrowUp" ? step : -step);
        }
    };

    return (
        <div className="studio-sec-field">
            <button
                type="button"
                className="studio-sec-step"
                tabIndex={-1}
                disabled={disabled}
                aria-label="Giảm 0.1 giây"
                title="Giảm 0.1s (Giữ Shift giảm 1s)"
                onClick={e => stepBy(e.shiftKey ? -1.0 : -0.1)}
            >
                −
            </button>
            <input
                id={id}
                className="p-input studio-sec-input"
                type="text"
                inputMode="decimal"
                value={focused ? draft : formatSecondsInput(value)}
                disabled={disabled}
                aria-label={ariaLabel}
                onFocus={e => {
                    setFocused(true);
                    setDraft(formatSecondsInput(value));
                    e.currentTarget.select();
                }}
                onChange={e => {
                    const nextText = e.target.value;
                    setDraft(nextText);
                    if (!/[.,:]$/.test(nextText.trim())) {
                        const parsed = parseFlexibleSeconds(nextText);
                        if (parsed !== null) {
                            const clamped = clampToMax(parsed);
                            const withinGentleBounds =
                                !liveRange || (clamped >= liveRange[0] && clamped <= liveRange[1]);
                            if (withinGentleBounds) {
                                onChange(clamped);
                            }
                        }
                    }
                }}
                onBlur={() => {
                    setFocused(false);
                    commitText(draft);
                }}
                onKeyDown={handleKeyDown}
            />
            <span className="studio-sec-unit">s</span>
            <button
                type="button"
                className="studio-sec-step"
                tabIndex={-1}
                disabled={disabled}
                aria-label="Tăng 0.1 giây"
                title="Tăng 0.1s (Giữ Shift tăng 1s)"
                onClick={e => stepBy(e.shiftKey ? 1.0 : 0.1)}
            >
                +
            </button>
        </div>
    );
};

export default DecimalSecondInput;
