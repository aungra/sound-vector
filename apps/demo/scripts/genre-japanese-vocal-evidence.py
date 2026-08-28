#!/usr/bin/env python3
"""Derive transient Japanese-vocal evidence without retaining audio or transcripts.

The input file is supplied by the analysis server.  Demucs writes a vocal stem to
the system temp directory and faster-whisper only returns language confidence;
both the stem and decoded text are discarded before this process exits.
"""

import argparse
import audioop
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path


MODEL_PATH = os.environ.get(
    "MMFR_JAPANESE_VOCAL_MODEL_PATH",
    str(Path(__file__).resolve().parents[3] / "runtime-assets/models/faster-whisper-large-v3-turbo"),
)
DEMUCS_MODEL = os.environ.get("MMFR_JAPANESE_VOCAL_DEMUCS_MODEL", "htdemucs")
MAX_SECONDS = max(12, int(os.environ.get("MMFR_JAPANESE_VOCAL_MAX_SECONDS", "48")))


def wav_rms(path):
    total_square = 0.0
    total_samples = 0
    with wave.open(str(path), "rb") as source:
        width = source.getsampwidth()
        channels = source.getnchannels()
        while True:
            frames = source.readframes(65536)
            if not frames:
                break
            sample_count = len(frames) // max(1, width)
            rms = float(audioop.rms(frames, width))
            total_square += rms * rms * sample_count
            total_samples += sample_count
    return math.sqrt(total_square / max(1, total_samples))


def melodic_vocal_metrics(path):
    """Return aggregate pitch-contour evidence without retaining a contour."""
    empty = {
        "voicedPitchRatio": 0.0,
        "pitchContinuity": 0.0,
        "sustainedVoicedRatio": 0.0,
        "pitchRangeSemitones": 0.0,
        "acousticMelodicLikelihood": 0.0,
    }
    try:
        import librosa
        import numpy as np

        audio, sample_rate = librosa.load(str(path), sr=16000, mono=True, duration=float(MAX_SECONDS))
        if audio.size < sample_rate * 2:
            return empty
        frame_length = 1024
        hop_length = 256
        rms = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length)[0]
        f0, voiced, voiced_probability = librosa.pyin(
            audio,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C6"),
            sr=sample_rate,
            frame_length=frame_length,
            hop_length=hop_length,
        )
        frame_count = min(len(rms), len(f0), len(voiced), len(voiced_probability))
        if frame_count < 8:
            return empty
        rms = rms[:frame_count]
        f0 = f0[:frame_count]
        voiced = voiced[:frame_count]
        voiced_probability = np.nan_to_num(voiced_probability[:frame_count], nan=0.0)
        active_floor = max(0.0025, float(np.percentile(rms, 42)) * 0.7)
        active = rms >= active_floor
        pitched = active & voiced & np.isfinite(f0) & (voiced_probability >= 0.48)
        active_count = int(np.count_nonzero(active))
        pitched_count = int(np.count_nonzero(pitched))
        if active_count < 8 or pitched_count < 5:
            return empty

        voiced_pitch_ratio = pitched_count / active_count
        adjacent = pitched[:-1] & pitched[1:]
        if np.any(adjacent):
            semitone_steps = np.abs(12.0 * np.log2(f0[1:][adjacent] / f0[:-1][adjacent]))
            pitch_continuity = float(np.mean(semitone_steps <= 2.6))
        else:
            pitch_continuity = 0.0

        run_lengths = []
        current = 0
        for is_pitched in pitched:
            if is_pitched:
                current += 1
            elif current:
                run_lengths.append(current)
                current = 0
        if current:
            run_lengths.append(current)
        sustained_frames = sum(length for length in run_lengths if length >= 7)
        sustained_voiced_ratio = sustained_frames / max(1, pitched_count)

        midi = 69.0 + 12.0 * np.log2(f0[pitched] / 440.0)
        pitch_range = float(np.percentile(midi, 90) - np.percentile(midi, 10))
        range_support = min(1.0, max(0.0, (pitch_range - 1.5) / 8.5))
        acoustic_melodic = min(1.0, max(0.0,
            voiced_pitch_ratio * 0.24
            + pitch_continuity * 0.34
            + sustained_voiced_ratio * 0.28
            + range_support * 0.14
        ))
        return {
            "voicedPitchRatio": round(voiced_pitch_ratio, 4),
            "pitchContinuity": round(pitch_continuity, 4),
            "sustainedVoicedRatio": round(sustained_voiced_ratio, 4),
            "pitchRangeSemitones": round(pitch_range, 3),
            "acousticMelodicLikelihood": round(acoustic_melodic, 4),
        }
    except Exception:
        return empty


def result(**values):
    base = {
        "available": False,
        "method": "demucs+faster-whisper-language-id",
        "vocalPresence": 0.0,
        "japaneseVocalLikelihood": 0.0,
        "sampleCount": 0,
        "segmentEvidence": [],
        "reason": "",
    }
    base.update(values)
    print(json.dumps(base, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--start-seconds", type=float, default=0.0)
    args = parser.parse_args()
    source = Path(args.audio)
    if not source.exists():
        result(reason="audio-not-found")
        return
    if os.environ.get("MMFR_JAPANESE_VOCAL_ENABLED", "1") == "0":
        result(reason="disabled")
        return
    if not Path(MODEL_PATH).exists():
        result(reason="model-not-installed")
        return
    try:
        from faster_whisper import WhisperModel
    except Exception:
        result(reason="faster-whisper-not-installed")
        return

    temp_dir = Path(tempfile.mkdtemp(prefix="mmfr-ja-vocal-"))
    try:
        clipped = temp_dir / "analysis-window.wav"
        ffmpeg = os.environ.get("MMFR_FFMPEG_PATH") or shutil.which("ffmpeg")
        if not ffmpeg:
            result(reason="ffmpeg-not-found")
            return
        try:
            subprocess.run([
                ffmpeg, "-hide_banner", "-loglevel", "error", "-ss", str(max(0.0, args.start_seconds)),
                "-t", str(MAX_SECONDS), "-i", str(source), "-vn", "-ac", "2", "-ar", "44100", str(clipped),
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=90)
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
            result(reason="analysis-window-decode-failed")
            return
        output_dir = temp_dir / "demucs"
        command = [
            sys.executable, "-m", "demucs", "-n", DEMUCS_MODEL,
            "--two-stems", "vocals", "-o", str(output_dir), str(clipped),
        ]
        env = dict(os.environ)
        env.setdefault("TORCH_HOME", os.environ.get(
            "MMFR_TORCH_HOME",
            str(Path(__file__).resolve().parents[3] / "runtime-assets/models/torch"),
        ))
        try:
            subprocess.run(command, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=420)
        except FileNotFoundError:
            result(reason="demucs-not-installed")
            return
        except subprocess.TimeoutExpired:
            result(reason="vocal-separation-timeout")
            return
        except subprocess.CalledProcessError:
            result(reason="vocal-separation-failed")
            return
        stems = list(output_dir.rglob("vocals.wav"))
        if not stems:
            result(reason="vocal-stem-not-produced")
            return

        try:
            mixture_rms = wav_rms(clipped)
            vocal_rms = wav_rms(stems[0])
            vocal_energy_ratio = min(1.0, vocal_rms / max(1.0, mixture_rms))
            stem_vocal_presence = min(1.0, max(0.0, (vocal_energy_ratio - 0.08) / 0.42))
        except (wave.Error, OSError, audioop.error):
            vocal_energy_ratio = 0.0
            stem_vocal_presence = 0.0

        pitch_metrics = melodic_vocal_metrics(stems[0])
        model = WhisperModel(MODEL_PATH, device="auto", compute_type="int8")
        segments, info = model.transcribe(
            str(stems[0]), task="transcribe", language=None, beam_size=5,
            vad_filter=True, condition_on_previous_text=False,
            chunk_length=15,
        )
        evidence = []
        voiced_seconds = 0.0
        transcript_token_count = 0
        for segment in segments:
            duration = max(0.0, float(segment.end) - float(segment.start))
            if duration <= 0.15:
                continue
            voiced_seconds += duration
            transcript_token_count += len(str(segment.text or "").strip().split())
            evidence.append({
                "startSeconds": round(float(segment.start), 2),
                "endSeconds": round(float(segment.end), 2),
                "language": str(info.language or ""),
                "languageProbability": round(float(info.language_probability or 0.0), 4),
            })
        duration = max(1.0, min(float(MAX_SECONDS), max((row["endSeconds"] for row in evidence), default=0.0)))
        language = str(info.language or "").lower()
        language_probability = float(info.language_probability or 0.0)
        transcript_token_rate = transcript_token_count / max(1.0, voiced_seconds)
        transcription_vocal_presence = min(1.0, voiced_seconds / max(8.0, duration * 0.42))
        single_span_hallucination = (
            len(evidence) == 1
            and voiced_seconds >= min(float(MAX_SECONDS), duration) * 0.62
            and stem_vocal_presence < 0.25
        )
        if single_span_hallucination:
            transcription_reliability = 0.08
        else:
            fragment_support = min(1.0, len(evidence) / 3.0)
            duration_support = min(1.0, voiced_seconds / max(8.0, float(MAX_SECONDS) * 0.35))
            transcription_reliability = min(1.0, fragment_support * 0.62 + duration_support * 0.38)
        calibrated_transcription_presence = transcription_vocal_presence * transcription_reliability
        vocal_presence = max(calibrated_transcription_presence, stem_vocal_presence)
        language_vocal_support = math.sqrt(
            calibrated_transcription_presence * max(calibrated_transcription_presence, stem_vocal_presence)
        )
        japanese = language_probability * language_vocal_support if language in {"ja", "jpn"} else 0.0
        lexical_melody_support = 1.0 - min(1.0, max(0.0, (transcript_token_rate - 1.35) / 2.15))
        melodic_vocal_likelihood = min(1.0, max(0.0,
            pitch_metrics["acousticMelodicLikelihood"] * 0.82
            + lexical_melody_support * 0.18
        )) * max(stem_vocal_presence, calibrated_transcription_presence)
        speech_rate_support = min(1.0, max(0.0, (transcript_token_rate - 1.75) / 2.25))
        speech_rap_likelihood = min(1.0, max(0.0,
            speech_rate_support * 0.64
            + (1.0 - pitch_metrics["pitchContinuity"]) * 0.2
            + (1.0 - pitch_metrics["sustainedVoicedRatio"]) * 0.16
        )) * language_probability * max(stem_vocal_presence, calibrated_transcription_presence)
        result(
            available=True,
            vocalPresence=round(vocal_presence, 4),
            transcriptionVocalPresence=round(transcription_vocal_presence, 4),
            calibratedTranscriptionVocalPresence=round(calibrated_transcription_presence, 4),
            transcriptionReliability=round(transcription_reliability, 4),
            singleSpanHallucination=single_span_hallucination,
            stemVocalPresence=round(stem_vocal_presence, 4),
            vocalEnergyRatio=round(vocal_energy_ratio, 4),
            japaneseVocalLikelihood=round(japanese, 4),
            detectedLanguage=language,
            languageProbability=round(language_probability, 4),
            transcriptTokenRate=round(transcript_token_rate, 4),
            melodicVocalLikelihood=round(melodic_vocal_likelihood, 4),
            speechRapLikelihood=round(speech_rap_likelihood, 4),
            **pitch_metrics,
            sampleCount=len(evidence),
            segmentEvidence=evidence[:8],
        )
    except Exception as error:
        result(reason=f"unexpected:{type(error).__name__}")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
