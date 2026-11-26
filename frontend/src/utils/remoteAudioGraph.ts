export interface PeerAudioGraph {
    source: MediaStreamAudioSourceNode;
    gain: GainNode;
    nodes: AudioNode[];
}

const GAIN_TIME_CONSTANT_SECONDS = 0.03;

type AudioContextWindow = Window & {
    webkitAudioContext?: typeof AudioContext;
};

export function createAudioContext(): AudioContext | null {
    const AudioCtor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
    if (!AudioCtor) {
        return null;
    }
    try {
        return new AudioCtor();
    } catch {
        return null;
    }
}

export function applyRemoteGain(gain: GainNode, value: number): void {
    try {
        gain.gain.setTargetAtTime(value, gain.context.currentTime, GAIN_TIME_CONSTANT_SECONDS);
    } catch {
        try {
            gain.gain.value = value;
        } catch {
            /* ignore gain fallback error */
        }
    }
}

/**
 * Builds the per-peer playback chain: a compressor lifts quiet laptop mics,
 * a gain node drives the volume slider, and a limiter prevents clipping above 100%.
 */
export function createPeerAudioGraph(
    ctx: AudioContext,
    stream: MediaStream,
    initialGain: number,
): PeerAudioGraph | null {
    const nodes: AudioNode[] = [];
    try {
        const source = ctx.createMediaStreamSource(stream);
        nodes.push(source);

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -28;
        compressor.knee.value = 12;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.006;
        compressor.release.value = 0.25;
        nodes.push(compressor);

        const gain = ctx.createGain();
        gain.gain.value = initialGain;
        nodes.push(gain);

        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -2;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.15;
        nodes.push(limiter);

        source.connect(compressor).connect(gain).connect(limiter).connect(ctx.destination);
        return { source, gain, nodes };
    } catch {
        disconnectPeerAudioGraph({ nodes } as PeerAudioGraph);
        return null;
    }
}

export function disconnectPeerAudioGraph(graph: PeerAudioGraph | undefined): void {
    if (!graph) {
        return;
    }
    graph.nodes.forEach(node => {
        try {
            node.disconnect();
        } catch {
            /* ignore already-disconnected node */
        }
    });
}

/**
 * Keeps the <audio> element audible only while the WebAudio context is still suspended
 * (autoplay policy), so a suspended context never silences remote peers.
 */
export function syncAudioElementPlayback(
    audio: HTMLAudioElement,
    graphRunning: boolean,
    mutedAll: boolean,
    gainValue: number,
): void {
    try {
        if (graphRunning) {
            audio.muted = true;
        } else {
            audio.muted = mutedAll;
            audio.volume = Math.min(1, Math.max(0, gainValue));
        }
    } catch {
        /* ignore detached audio element */
    }
}
