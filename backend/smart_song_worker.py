"""
Smart Song Media Worker for Karaoke Admin:
- probe: reads duration of a local media file via ffmpeg/librosa
- youtube: downloads <=720p mp4 + optional manual subtitles via yt_dlp
- analyze: trims listen clip + sing audio via ffmpeg, runs UVR MDX-Net (Kim_Vocal_2.onnx)
  vocal stem separation via onnxruntime (no PyTorch required), and extracts pitch contour
  using the exact librosa.pyin configuration as extract.py.
"""

import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request

import librosa
import numpy as np
import soundfile as sf

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

RESULT_PREFIX = "KARAOKE_JSON:"

MODEL_URLS = [
    "https://huggingface.co/Derur/UVR-models/resolve/main/Kim_Vocal_2.onnx",
    "https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/Kim_Vocal_2.onnx",
]

# Standard UVR MDX-Net parameters for Kim_Vocal_2.onnx
MDX_SR = 44100
MDX_N_FFT = 7680
MDX_HOP = 1024
MDX_DEFAULT_DIM_F = 3072
MDX_DEFAULT_DIM_T = 256
MDX_COMPENSATE = 1.009

MAX_YOUTUBE_DURATION_SEC = 15 * 60
MAX_YOUTUBE_BYTES = 200 * 1024 * 1024


def emit_result(payload: dict) -> None:
    print(f"{RESULT_PREFIX}{json.dumps(payload, ensure_ascii=False)}", flush=True)


def resolve_ffmpeg() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.isfile(exe):
            return exe
    except Exception:
        pass
    raise RuntimeError("Không tìm thấy ffmpeg trên hệ thống hoặc trong imageio-ffmpeg.")


def probe_duration(media_path: str, ffmpeg_exe: str) -> float:
    proc = subprocess.run(
        [ffmpeg_exe, "-hide_banner", "-i", media_path],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    combined = (proc.stderr or "") + "\n" + (proc.stdout or "")
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", combined)
    if match:
        hours = int(match.group(1))
        minutes = int(match.group(2))
        seconds = float(match.group(3))
        total = hours * 3600.0 + minutes * 60.0 + seconds
        if total > 0:
            return round(total, 3)
    duration = float(librosa.get_duration(path=media_path))
    return round(duration, 3)


def ensure_uvr_model(model_path: str) -> str:
    if os.path.isfile(model_path) and os.path.getsize(model_path) > 10 * 1024 * 1024:
        return model_path

    os.makedirs(os.path.dirname(os.path.abspath(model_path)), exist_ok=True)
    part_path = f"{model_path}.part.{os.getpid()}"
    last_err = None
    for url in MODEL_URLS:
        try:
            print(f"Downloading UVR model from {url} ...", flush=True)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=180) as resp, open(part_path, "wb") as out:
                shutil.copyfileobj(resp, out)
            if os.path.getsize(part_path) > 10 * 1024 * 1024:
                os.replace(part_path, model_path)
                return model_path
        except Exception as err:
            last_err = err
            if os.path.exists(part_path):
                try:
                    os.remove(part_path)
                except OSError:
                    pass
    raise RuntimeError(f"Không thể tải model tách giọng Kim_Vocal_2.onnx: {last_err}")


def separate_vocals_mdx(mix_wav_path: str, output_wav_path: str, model_path: str) -> None:
    import onnxruntime as ort

    resolved_model = ensure_uvr_model(model_path)
    sess_opts = ort.SessionOptions()
    sess_opts.intra_op_num_threads = min(8, max(2, (os.cpu_count() or 4)))
    sess_opts.inter_op_num_threads = 1
    sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    available_providers = ort.get_available_providers()
    preferred_providers = [
        p
        for p in ("CUDAExecutionProvider", "DmlExecutionProvider", "CPUExecutionProvider")
        if p in available_providers
    ]
    session = ort.InferenceSession(
        resolved_model,
        sess_options=sess_opts,
        providers=preferred_providers or ["CPUExecutionProvider"],
    )
    input_meta = session.get_inputs()[0]
    input_name = input_meta.name
    output_name = session.get_outputs()[0].name
    shape = input_meta.shape
    dim_f = int(shape[2]) if len(shape) >= 4 and isinstance(shape[2], int) else MDX_DEFAULT_DIM_F
    dim_t = int(shape[3]) if len(shape) >= 4 and isinstance(shape[3], int) else MDX_DEFAULT_DIM_T

    audio, _ = librosa.load(mix_wav_path, sr=MDX_SR, mono=False)
    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=0)
    elif audio.shape[0] > 2:
        audio = audio[:2, :]

    orig_samples = audio.shape[1]
    chunk_size = MDX_HOP * (dim_t - 1)
    margin = MDX_HOP * 16
    step_size = max(MDX_HOP * 32, chunk_size - 2 * margin)
    n_bins = MDX_N_FFT // 2 + 1

    pad_front = margin
    if orig_samples + pad_front <= chunk_size:
        pad_back = chunk_size - (orig_samples + pad_front)
    else:
        rem = (orig_samples + pad_front - chunk_size) % step_size
        pad_back = (step_size - rem) % step_size
    padded = np.pad(audio, ((0, 0), (pad_front, pad_back)), mode="reflect")

    result = np.zeros_like(padded, dtype=np.float32)
    weight_sum = np.zeros(padded.shape[1], dtype=np.float32)
    fade_window = np.ones(chunk_size, dtype=np.float32)
    if margin * 2 < chunk_size:
        edge = np.hanning(margin * 2).astype(np.float32)
        fade_window[:margin] = np.maximum(edge[:margin], 1e-4)
        fade_window[-margin:] = np.maximum(edge[margin:], 1e-4)

    total_len = padded.shape[1]
    for start in range(0, total_len - chunk_size + 1, step_size):
        segment = padded[:, start : start + chunk_size]

        stft_l = librosa.stft(
            segment[0],
            n_fft=MDX_N_FFT,
            hop_length=MDX_HOP,
            win_length=MDX_N_FFT,
            window="hann",
            center=True,
        )
        stft_r = librosa.stft(
            segment[1],
            n_fft=MDX_N_FFT,
            hop_length=MDX_HOP,
            win_length=MDX_N_FFT,
            window="hann",
            center=True,
        )

        # Ensure exact dim_t frames
        if stft_l.shape[1] > dim_t:
            stft_l = stft_l[:, :dim_t]
            stft_r = stft_r[:, :dim_t]
        elif stft_l.shape[1] < dim_t:
            pad_frames = dim_t - stft_l.shape[1]
            stft_l = np.pad(stft_l, ((0, 0), (0, pad_frames)))
            stft_r = np.pad(stft_r, ((0, 0), (0, pad_frames)))

        # MDX-Net 4-plane layout: [Left_Real, Left_Imag, Right_Real, Right_Imag]
        spec_4ch = np.stack(
            [
                np.real(stft_l[:dim_f, :]),
                np.imag(stft_l[:dim_f, :]),
                np.real(stft_r[:dim_f, :]),
                np.imag(stft_r[:dim_f, :]),
            ],
            axis=0,
        )[np.newaxis, ...].astype(np.float32)

        pred = session.run([output_name], {input_name: spec_4ch})[0][0]

        pad_bins = n_bins - dim_f
        if pad_bins > 0:
            pred = np.pad(pred, ((0, 0), (0, pad_bins), (0, 0)))

        voc_l = pred[0] + 1j * pred[1]
        voc_r = pred[2] + 1j * pred[3]

        wav_l = librosa.istft(
            voc_l,
            hop_length=MDX_HOP,
            win_length=MDX_N_FFT,
            window="hann",
            center=True,
            length=chunk_size,
        )
        wav_r = librosa.istft(
            voc_r,
            hop_length=MDX_HOP,
            win_length=MDX_N_FFT,
            window="hann",
            center=True,
            length=chunk_size,
        )

        result[0, start : start + chunk_size] += wav_l * fade_window
        result[1, start : start + chunk_size] += wav_r * fade_window
        weight_sum[start : start + chunk_size] += fade_window

    valid_mask = weight_sum > 1e-6
    result[:, valid_mask] /= weight_sum[valid_mask]
    vocals = result[:, pad_front : pad_front + orig_samples] * MDX_COMPENSATE
    vocals = np.clip(vocals, -1.0, 1.0)
    sf.write(output_wav_path, vocals.T, MDX_SR, subtype="PCM_16")


def extract_pitch_contour(vocal_path: str) -> list[float]:
    # Exact pitch extraction formula preserved 1:1 from extract.py for PerformanceScorer
    y, sr = librosa.load(vocal_path, sr=22050)
    f0, _, _ = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
    )
    pitch_contour = np.nan_to_num(f0).tolist()
    hop_length = int(0.2 * sr / 512)
    reduced_contour = pitch_contour[::hop_length]
    return [round(float(hz), 2) for hz in reduced_contour]


def run_ffmpeg(args: list[str]) -> None:
    proc = subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "")[-600:]
        raise RuntimeError(f"FFmpeg thất bại (code={proc.returncode}): {tail}")


def cmd_probe(args: argparse.Namespace) -> None:
    ffmpeg_exe = resolve_ffmpeg()
    duration = probe_duration(args.input, ffmpeg_exe)
    emit_result({"duration": duration})


def pick_best_subtitle(out_dir: str) -> str | None:
    candidates = sorted(glob.glob(os.path.join(out_dir, "source.*.vtt")) + glob.glob(os.path.join(out_dir, "source.*.srt")))
    if not candidates:
        return None
    # Prefer Vietnamese first, then English, then any creator-uploaded subtitle
    for pref in (".vi", ".en"):
        for path in candidates:
            if pref in os.path.basename(path).lower():
                return path
    return candidates[0]


def cmd_youtube(args: argparse.Namespace) -> None:
    import yt_dlp

    ffmpeg_exe = resolve_ffmpeg()
    os.makedirs(args.out_dir, exist_ok=True)
    outtmpl = os.path.join(args.out_dir, "source.%(ext)s")

    ydl_opts = {
        "format": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
        "merge_output_format": "mp4",
        "outtmpl": outtmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "ffmpeg_location": ffmpeg_exe,
        "max_filesize": MAX_YOUTUBE_BYTES,
        "writesubtitles": True,
        "writeautomaticsub": False,
        "subtitleslangs": ["vi.*", "vi", "en.*", "en"],
        "subtitlesformat": "vtt/srt/best",
        "socket_timeout": 20,
        "allowed_extractors": ["youtube", "youtube:tab"],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(args.url, download=False)
        duration = float(info.get("duration") or 0)
        if duration <= 0 or duration > MAX_YOUTUBE_DURATION_SEC:
            raise RuntimeError(f"VIDEO_DURATION_OUT_OF_RANGE:{duration}")
        info = ydl.extract_info(args.url, download=True)

    video_candidates = [
        p
        for p in glob.glob(os.path.join(args.out_dir, "source.*"))
        if os.path.splitext(p)[1].lower() in (".mp4", ".webm", ".mkv", ".mov", ".m4v")
    ]
    if not video_candidates:
        raise RuntimeError("Không tìm thấy file video sau khi tải YouTube.")

    downloaded_video = video_candidates[0]
    target_mp4 = os.path.join(args.out_dir, "source.mp4")
    if os.path.abspath(downloaded_video) != os.path.abspath(target_mp4):
        run_ffmpeg(
            [
                ffmpeg_exe,
                "-y",
                "-i",
                downloaded_video,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                target_mp4,
            ]
        )
        try:
            os.remove(downloaded_video)
        except OSError:
            pass

    if os.path.getsize(target_mp4) > MAX_YOUTUBE_BYTES:
        raise RuntimeError("FILE_TOO_LARGE")

    actual_duration = probe_duration(target_mp4, ffmpeg_exe)
    sub_path = pick_best_subtitle(args.out_dir)
    emit_result(
        {
            "title": str(info.get("title") or "").strip(),
            "duration": actual_duration,
            "videoPath": target_mp4,
            "subtitlePath": sub_path,
        }
    )


def cmd_analyze(args: argparse.Namespace) -> None:
    ffmpeg_exe = resolve_ffmpeg()
    os.makedirs(args.out_dir, exist_ok=True)

    listen_duration = round(args.listen_end - args.listen_start, 3)
    sing_duration = round(args.sing_end - args.sing_start, 3)
    if listen_duration <= 0 or sing_duration <= 0:
        raise RuntimeError("Khoảng thời gian cắt không hợp lệ.")

    listen_clip = os.path.join(args.out_dir, "listen_clip.mp4")
    sing_mix_wav = os.path.join(args.out_dir, "sing_mix.wav")
    gemini_mp3 = os.path.join(args.out_dir, "sing_gemini.mp3")
    vocal_clean_wav = os.path.join(args.out_dir, "vocal_clean.wav")
    pitch_json = os.path.join(args.out_dir, "pitch.json")

    # 1. Trim Khung 1 (listen segment) into universal browser-ready H.264 + AAC mp4
    run_ffmpeg(
        [
            ffmpeg_exe,
            "-y",
            "-ss",
            f"{args.listen_start:.3f}",
            "-t",
            f"{listen_duration:.3f}",
            "-i",
            args.source,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            listen_clip,
        ]
    )

    # 2. Trim Khung 2 (sing segment) into stereo WAV (for UVR) + lightweight MP3 (for Gemini)
    run_ffmpeg(
        [
            ffmpeg_exe,
            "-y",
            "-ss",
            f"{args.sing_start:.3f}",
            "-t",
            f"{sing_duration:.3f}",
            "-i",
            args.source,
            "-vn",
            "-ar",
            str(MDX_SR),
            "-ac",
            "2",
            sing_mix_wav,
        ]
    )
    run_ffmpeg(
        [
            ffmpeg_exe,
            "-y",
            "-i",
            sing_mix_wav,
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "64k",
            gemini_mp3,
        ]
    )

    # 3. Vocal separation (UVR Kim_Vocal_2 ONNX) unless Admin supplied an explicit vocal file
    if args.vocal_override and os.path.isfile(args.vocal_override):
        run_ffmpeg(
            [
                ffmpeg_exe,
                "-y",
                "-i",
                args.vocal_override,
                "-vn",
                "-ar",
                str(MDX_SR),
                "-ac",
                "2",
                vocal_clean_wav,
            ]
        )
    else:
        separate_vocals_mdx(sing_mix_wav, vocal_clean_wav, args.uvr_model)

    # 4. Pitch extraction (exact 1:1 algorithm with extract.py)
    contour = extract_pitch_contour(vocal_clean_wav)
    with open(pitch_json, "w", encoding="utf-8") as f:
        json.dump(contour, f)

    actual_listen_dur = probe_duration(listen_clip, ffmpeg_exe)
    emit_result(
        {
            "listenClipPath": listen_clip,
            "listenDuration": actual_listen_dur,
            "singDuration": sing_duration,
            "vocalCleanPath": vocal_clean_wav,
            "geminiAudioPath": gemini_mp3,
            "pitchPath": pitch_json,
            "sampleCount": len(contour),
        }
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Smart Karaoke Song Media Worker")
    sub = parser.add_subparsers(dest="command", required=True)

    p_probe = sub.add_parser("probe")
    p_probe.add_argument("--input", required=True)

    p_yt = sub.add_parser("youtube")
    p_yt.add_argument("--url", required=True)
    p_yt.add_argument("--out-dir", required=True)

    p_an = sub.add_parser("analyze")
    p_an.add_argument("--source", required=True)
    p_an.add_argument("--out-dir", required=True)
    p_an.add_argument("--listen-start", type=float, required=True)
    p_an.add_argument("--listen-end", type=float, required=True)
    p_an.add_argument("--sing-start", type=float, required=True)
    p_an.add_argument("--sing-end", type=float, required=True)
    p_an.add_argument("--uvr-model", required=True)
    p_an.add_argument("--vocal-override", default="")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.command == "probe":
            cmd_probe(args)
        elif args.command == "youtube":
            cmd_youtube(args)
        elif args.command == "analyze":
            cmd_analyze(args)
    except Exception as exc:
        print(f"WORKER_ERROR: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
