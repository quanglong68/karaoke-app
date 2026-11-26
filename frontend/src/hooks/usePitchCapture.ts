import { useCallback, useEffect, useRef, useState } from "react";
import type { LyricsStatus } from "../types/game";
import { autoCorrelate, medianOf } from "../utils/pitchDetection";
import { createAudioContext } from "../utils/remoteAudioGraph";

const HIGHPASS_HZ = 70;
const LOWPASS_HZ = 1500;
const FILTER_Q = 0.7;
const ANALYSER_FFT_SIZE = 2048;
const MIN_VOICE_HZ = 70;
const MAX_VOICE_HZ = 1200;
const CONCERT_A_HZ = 440;
const SEMITONES_PER_OCTAVE = 12;
const OCTAVE_TOLERANCE_SEMITONES = 1.5;
const MIN_HISTORY_FOR_OCTAVE_CHECK = 3;
const MAX_OCTAVE_REJECT_STREAK = 3;
const PITCH_HISTORY_SIZE = 5;
const SAMPLE_INTERVAL_MS = 200;
const SPEECH_RESTART_DELAY_MS = 600;

type SpeechRecognitionEventLike = {
    results: Array<Array<{ transcript: string }>>;
};

type SpeechRecognitionErrorEventLike = {
    error?: string;
};

type SpeechRecognitionLike = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type WakeLockHandle = { release: () => Promise<void> };

interface UsePitchCaptureOptions {
    /** True while this player is singing (PERFORMANCE phase). */
    enabled: boolean;
    /** True once the server moved to PERFORMANCE_EVALUATION: send what was captured. */
    sendLyricsOnFinish: boolean;
    getStream: () => MediaStream | null;
    ensureStream: () => Promise<MediaStream | null>;
    onSubmit: (lyrics: string, pitchContour: number[]) => void;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
    const speechWindow = window as Window & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
}

async function requestScreenWakeLock(): Promise<WakeLockHandle | null> {
    const wakeLockApi = (navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockHandle> };
    }).wakeLock;
    if (!wakeLockApi) {
        return null;
    }
    try {
        return await wakeLockApi.request("screen");
    } catch {
        return null;
    }
}

function createBandpassAnalyser(stream: MediaStream): { context: AudioContext; analyser: AnalyserNode } | null {
    const context = createAudioContext();
    if (!context) {
        return null;
    }
    if (context.state === "suspended") {
        void context.resume().catch(() => undefined);
    }
    // Trim rumble and hiss so phone mics do not trigger octave-jumped harmonics.
    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = HIGHPASS_HZ;
    highpass.Q.value = FILTER_Q;

    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = LOWPASS_HZ;
    lowpass.Q.value = FILTER_Q;

    const analyser = context.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;

    context.createMediaStreamSource(stream).connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(analyser);
    return { context, analyser };
}

function filterVoicePitchSample(
    hz: number,
    history: number[],
    rejectStreakRef: { current: number },
): number {
    if (hz === -1 || hz < MIN_VOICE_HZ || hz > MAX_VOICE_HZ) {
        return 0.0;
    }
    const semitone = SEMITONES_PER_OCTAVE * Math.log2(hz / CONCERT_A_HZ);
    const reference = history.length >= MIN_HISTORY_FOR_OCTAVE_CHECK
        ? medianOf(history.slice(-MIN_HISTORY_FOR_OCTAVE_CHECK))
        : Number.NaN;
    const offset = semitone - reference;
    // Drop transient one-octave harmonic jumps until they persist across frames.
    const octaveJump = Number.isFinite(offset)
        && Math.abs(Math.abs(offset) - SEMITONES_PER_OCTAVE) < OCTAVE_TOLERANCE_SEMITONES;
    if (octaveJump && rejectStreakRef.current < MAX_OCTAVE_REJECT_STREAK) {
        rejectStreakRef.current += 1;
        return 0.0;
    }
    if (octaveJump) {
        history.length = 0;
    }
    rejectStreakRef.current = 0;
    history.push(semitone);
    if (history.length > PITCH_HISTORY_SIZE) {
        history.shift();
    }
    return Number(hz.toFixed(2));
}

/**
 * Owns the singer-side microphone pipeline: pitch sampling, speech recognition and
 * the screen wake lock. GamePage only decides when a performance starts/ends.
 */
export function usePitchCapture({
    enabled,
    sendLyricsOnFinish,
    getStream,
    ensureStream,
    onSubmit,
}: UsePitchCaptureOptions) {
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const pitchContourRef = useRef<number[]>([]);
    const pitchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pitchHistoryRef = useRef<number[]>([]);
    const pitchRejectStreakRef = useRef(0);
    const committedTranscriptRef = useRef("");
    const sessionTranscriptRef = useRef("");
    const fullTranscriptRef = useRef("");
    const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const speechRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const speechShouldRunRef = useRef(false);
    const [lyricsStatus, setLyricsStatus] = useState<LyricsStatus>("idle");

    const getStreamRef = useRef(getStream);
    const ensureStreamRef = useRef(ensureStream);
    const onSubmitRef = useRef(onSubmit);

    useEffect(() => {
        getStreamRef.current = getStream;
        ensureStreamRef.current = ensureStream;
        onSubmitRef.current = onSubmit;
    });

    const stopCapture = useCallback(() => {
        speechShouldRunRef.current = false;
        if (pitchIntervalRef.current) {
            clearInterval(pitchIntervalRef.current);
            pitchIntervalRef.current = null;
        }
        if (speechRestartTimerRef.current) {
            clearTimeout(speechRestartTimerRef.current);
            speechRestartTimerRef.current = null;
        }
        if (speechRecognitionRef.current) {
            try {
                speechRecognitionRef.current.stop();
            } catch {
                /* already stopped */
            }
            speechRecognitionRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => undefined);
            audioContextRef.current = null;
            analyserRef.current = null;
        }
        setLyricsStatus("idle");
    }, []);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let wakeLock: WakeLockHandle | null = null;

        committedTranscriptRef.current = "";
        sessionTranscriptRef.current = "";
        fullTranscriptRef.current = "";
        pitchContourRef.current = [];
        pitchHistoryRef.current = [];
        pitchRejectStreakRef.current = 0;

        const resumePitchContext = () => {
            void audioContextRef.current?.resume().catch(() => undefined);
        };

        const acquireWakeLock = () => {
            if (wakeLock) return;
            void requestScreenWakeLock().then(lock => {
                if (cancelled) {
                    void lock?.release().catch(() => undefined);
                    return;
                }
                wakeLock = lock;
            });
        };

        const reacquireWakeLock = () => {
            if (document.visibilityState !== "visible") return;
            wakeLock = null;
            acquireWakeLock();
        };

        const startPitchSampling = (stream: MediaStream) => {
            if (cancelled) return;
            const setup = createBandpassAnalyser(stream);
            if (!setup) return;
            audioContextRef.current = setup.context;
            analyserRef.current = setup.analyser;

            const sampleBuffer = new Float32Array(setup.analyser.fftSize);
            pitchIntervalRef.current = setInterval(() => {
                if (!analyserRef.current || !audioContextRef.current) return;
                if (audioContextRef.current.state === "suspended") {
                    void audioContextRef.current.resume().catch(() => undefined);
                }
                analyserRef.current.getFloatTimeDomainData(sampleBuffer);
                const hz = autoCorrelate(sampleBuffer, audioContextRef.current.sampleRate);
                const validHz = filterVoicePitchSample(hz, pitchHistoryRef.current, pitchRejectStreakRef);
                pitchContourRef.current.push(validHz);
            }, SAMPLE_INTERVAL_MS);
        };

        const startSpeechRecognition = () => {
            const SpeechRecognition = getSpeechRecognitionConstructor();
            if (!SpeechRecognition) {
                queueMicrotask(() => {
                    if (!cancelled) setLyricsStatus("unsupported");
                });
                return;
            }
            const recognition = new SpeechRecognition();
            speechRecognitionRef.current = recognition;
            speechShouldRunRef.current = true;
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = "vi-VN";

            recognition.onresult = (event) => {
                let textBlock = "";
                for (let i = 0; i < event.results.length; i++) {
                    textBlock += event.results[i][0].transcript + " ";
                }
                sessionTranscriptRef.current = textBlock.trim();
                fullTranscriptRef.current = [committedTranscriptRef.current, sessionTranscriptRef.current]
                    .filter(Boolean)
                    .join(" ");
                setLyricsStatus("listening");
            };

            recognition.onerror = (event) => {
                console.error("Lỗi nhận diện lời:", event.error);
                if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                    speechShouldRunRef.current = false;
                    setLyricsStatus("error");
                } else if (event.error === "network") {
                    setLyricsStatus("error");
                }
            };

            recognition.onend = () => {
                if (sessionTranscriptRef.current) {
                    // Each recognition.start() resets event.results; preserve what was captured
                    // before Chrome stopped the session so earlier lyrics are never wiped.
                    committedTranscriptRef.current = [committedTranscriptRef.current, sessionTranscriptRef.current]
                        .filter(Boolean)
                        .join(" ");
                    sessionTranscriptRef.current = "";
                    fullTranscriptRef.current = committedTranscriptRef.current;
                }
                if (!speechShouldRunRef.current || speechRecognitionRef.current !== recognition) return;
                if (speechRestartTimerRef.current) clearTimeout(speechRestartTimerRef.current);
                speechRestartTimerRef.current = setTimeout(() => {
                    if (!speechShouldRunRef.current || speechRecognitionRef.current !== recognition) return;
                    try {
                        recognition.start();
                        setLyricsStatus("listening");
                    } catch {
                        setLyricsStatus("error");
                    }
                }, SPEECH_RESTART_DELAY_MS);
            };

            queueMicrotask(() => {
                if (cancelled || speechRecognitionRef.current !== recognition) return;
                try {
                    recognition.start();
                    setLyricsStatus("listening");
                } catch {
                    setLyricsStatus("error");
                }
            });
        };

        document.addEventListener("pointerdown", resumePitchContext);
        document.addEventListener("visibilitychange", reacquireWakeLock);
        acquireWakeLock();

        const existingStream = getStreamRef.current();
        if (existingStream) {
            startPitchSampling(existingStream);
        } else {
            ensureStreamRef.current()
                .then(stream => {
                    if (stream) startPitchSampling(stream);
                })
                .catch(() => undefined);
        }
        startSpeechRecognition();

        return () => {
            cancelled = true;
            document.removeEventListener("pointerdown", resumePitchContext);
            document.removeEventListener("visibilitychange", reacquireWakeLock);
            if (wakeLock) {
                void wakeLock.release().catch(() => undefined);
                wakeLock = null;
            }
            stopCapture();
        };
    }, [enabled, stopCapture]);

    const finishSentRef = useRef(false);
    useEffect(() => {
        if (!sendLyricsOnFinish) {
            finishSentRef.current = false;
            return;
        }
        if (finishSentRef.current) return;
        finishSentRef.current = true;
        onSubmitRef.current(fullTranscriptRef.current.trim() || " ", [...pitchContourRef.current]);
    }, [sendLyricsOnFinish]);

    return { lyricsStatus, stopCapture };
}
