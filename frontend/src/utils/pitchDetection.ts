export function medianOf(values: number[]) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

export function autoCorrelate(buf: Float32Array, sampleRate: number) {
    const SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
        rms += buf[i] * buf[i];
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    // Normalized square difference function (NSDF). Picking the strongest peak of a
    // plain autocorrelation locks onto sub-harmonics above ~700 Hz (784 -> 196 Hz,
    // which is an octave error and destroys the tone score); the first strong peak is
    // always the fundamental.
    const minLag = Math.max(2, Math.floor(sampleRate / 1100));
    const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(SIZE / 2));
    const lagCount = maxLag - minLag + 1;
    if (lagCount < 3) return -1;

    const nsdf = new Float32Array(lagCount);
    let maxValue = 0;
    for (let idx = 0; idx < lagCount; idx++) {
        const lag = minLag + idx;
        const limit = SIZE - lag;
        let corr = 0;
        let energy = 0;
        for (let i = 0; i < limit; i++) {
            const a = buf[i];
            const b = buf[i + lag];
            corr += a * b;
            energy += a * a + b * b;
        }
        const value = energy > 1e-9 ? (2 * corr) / energy : 0;
        nsdf[idx] = value;
        if (value > maxValue) maxValue = value;
    }
    if (maxValue <= 0.3) return -1;

    const peaks: { index: number; value: number }[] = [];
    for (let idx = 0; idx < lagCount; idx++) {
        const prev = idx > 0 ? nsdf[idx - 1] : -1;
        const next = idx < lagCount - 1 ? nsdf[idx + 1] : -1;
        if (nsdf[idx] > prev && nsdf[idx] >= next && nsdf[idx] > 0) {
            peaks.push({ index: idx, value: nsdf[idx] });
        }
    }
    if (peaks.length === 0) return -1;

    const threshold = maxValue * 0.9;
    let chosen = peaks[0];
    for (const peak of peaks) {
        if (peak.value >= threshold) {
            chosen = peak;
            break;
        }
    }
    // A weak peak is noise rather than a sung note. Reporting it would feed random
    // semitones into the score, which is what noisy phone mics used to do.
    if (chosen.value < 0.6) return -1;

    const i = chosen.index;
    const x1 = nsdf[Math.max(0, i - 1)];
    const x2 = nsdf[i];
    const x3 = nsdf[Math.min(lagCount - 1, i + 1)];
    const denom = x1 + x3 - 2 * x2;
    let offset = 0;
    if (Math.abs(denom) > 1e-9) {
        offset = Math.max(-0.5, Math.min(0.5, (x3 - x1) / (2 * denom)));
    }

    const period = minLag + i + offset;
    if (!Number.isFinite(period) || period <= 0) return -1;
    const hz = sampleRate / period;
    return hz >= 70 && hz <= 1200 ? hz : -1;
}
