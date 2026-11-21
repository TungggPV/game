"""Generate Vietnamese + character-distinct voice clips for Element Armor.

Synthesizes raw speech using Windows WinRT (`Microsoft An` vi-VN) in a single batch
PowerShell invocation, then applies per-character pitch shifting, saturation, EQ,
and radio/helmet spatial reflections via numpy before writing 16 kHz mono WAVs.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import tempfile
import wave
from pathlib import Path
import numpy as np

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "audio" / "voice"
TARGET_SR = 16000

CLIPS: dict[str, tuple[str, str]] = {
    # 7 Hero Selection lines
    "select_nova_blade": ("nova_blade", "Nova Blade sẵn sàng! Thanh kiếm plasma đã nạp năng lượng!"),
    "select_crimson_flare": ("crimson_flare", "Crimson Flare ra trận! Thiêu rụi tất cả!"),
    "select_volt_sentinel": ("volt_sentinel", "Volt Sentinel! Tốc độ sấm sét không thể ngăn cản!"),
    "select_emerald_phantom": ("emerald_phantom", "Emerald Phantom xuất kích! Lưỡi gió vô hình!"),
    "select_obsidian_warden": ("obsidian_warden", "Obsidian Warden! Bức tường bất khả xâm phạm!"),
    "select_cryo_archon": ("cryo_archon", "Cryo Archon giáng lâm! Đóng băng chiến trường!"),
    "select_void_reaper": ("void_reaper", "Void Reaper! Hư không sẽ nuốt chửng tất cả!"),
    # 7 Hero Ultimate shouts
    "ult_nova_blade": ("nova_blade", "Tuyệt kỹ! Nova Overdrive!"),
    "ult_crimson_flare": ("crimson_flare", "Bùng cháy đi! Mưa thiên thạch đỏ!"),
    "ult_volt_sentinel": ("volt_sentinel", "Sấm sét giáng trần! Storm Breaker!"),
    "ult_emerald_phantom": ("emerald_phantom", "Ảo ảnh lục bảo! Trảm liên hoàn!"),
    "ult_obsidian_warden": ("obsidian_warden", "Nộ kích địa chấn! Nghiền nát tất cả!"),
    "ult_cryo_archon": ("cryo_archon", "Băng hà vĩnh cửu! Đóng băng tất cả!"),
    "ult_void_reaper": ("void_reaper", "Nhật thực hư không! Xé toạc không gian!"),
    # 7 Hero Skill callouts
    "skill_nova_blade": ("nova_blade", "Chém xuyên!"),
    "skill_crimson_flare": ("crimson_flare", "Bùng nổ!"),
    "skill_volt_sentinel": ("volt_sentinel", "Tia sét!"),
    "skill_emerald_phantom": ("emerald_phantom", "Cuồng phong!"),
    "skill_obsidian_warden": ("obsidian_warden", "Nứt đất!"),
    "skill_cryo_archon": ("cryo_archon", "Băng thương!"),
    "skill_void_reaper": ("void_reaper", "Hư không!"),
    # Combat Kiai / Efforts
    "kiai_1": ("kiai", "Hây!"),
    "kiai_2": ("kiai", "Haa!"),
    "kiai_3": ("kiai", "Xung kích!"),
    # Arena Announcer Callouts
    "ann_fight": ("ann", "Chiến đấu!"),
    "ann_break": ("ann", "Phá giáp!"),
    "ann_parry": ("ann", "Phản đòn!"),
    "ann_reaction": ("ann", "Cộng hưởng nguyên tố!"),
    "ann_boss": ("ann", "Cảnh báo! Đại trùm xuất hiện!"),
    "ann_victory": ("ann", "Chiến thắng!"),
    "ann_defeat": ("ann", "Thất bại!"),
}


def synthesize_raw_winrt(items: list[tuple[str, str, str]]) -> None:
    """Invoke Windows WinRT SpeechSynthesizer once to render all raw WAV clips."""
    manifest = [{"key": k, "text": txt, "out": out} for k, txt, out in items]
    with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as tf:
        json.dump(manifest, tf, ensure_ascii=False)
        manifest_path = tf.name

    ps_script = f"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
}})[0]

function Await($WinRtTask, $ResultType) {{
  $netTask = $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$viVoice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object {{ $_.Language -like 'vi*' }} | Select-Object -First 1
if ($viVoice) {{
  $synth.Voice = $viVoice
}}
try {{
  $synth.Options.SpeakingRate = 1.12
}} catch {{}}

$items = Get-Content -LiteralPath '{manifest_path.replace("'", "''")}' -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($item in $items) {{
  $stream = Await ($synth.SynthesizeTextToStreamAsync($item.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $size = [uint32]$stream.Size
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  [void](Await ($reader.LoadAsync($size)) ([uint32]))
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes($item.out, $bytes)
  $reader.Dispose()
  $stream.Dispose()
}}
Write-Output ("SYNTH_OK:" + $items.Count + ":" + $synth.Voice.DisplayName)
"""
    try:
        res = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=True,
        )
        print(res.stdout.strip())
    except subprocess.CalledProcessError as exc:
        print("STDOUT:", exc.stdout)
        print("STDERR:", exc.stderr)
        raise
    finally:
        if os.path.exists(manifest_path):
            os.remove(manifest_path)


def read_wav_mono(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as wf:
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        sr = wf.getframerate()
        n = wf.getnframes()
        raw = wf.readframes(n)
    if sw == 2:
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sw == 1:
        data = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:
        data = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    if ch > 1:
        data = data.reshape(-1, ch).mean(axis=1)
    return data, sr


def resample_linear(sig: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    if len(sig) == 0 or src_sr == dst_sr:
        return sig
    new_len = max(1, int(round(len(sig) * (dst_sr / float(src_sr)))))
    x_old = np.linspace(0.0, 1.0, len(sig), endpoint=False)
    x_new = np.linspace(0.0, 1.0, new_len, endpoint=False)
    return np.interp(x_new, x_old, sig).astype(np.float32)


def shift_pitch_speed(sig: np.ndarray, factor: float) -> np.ndarray:
    """Resample curve by `factor` (>1 = higher/faster energetic voice, <1 = deeper heavy voice)."""
    if len(sig) < 4 or abs(factor - 1.0) < 1e-4:
        return sig
    new_len = max(1, int(round(len(sig) / factor)))
    x_old = np.linspace(0.0, 1.0, len(sig), endpoint=False)
    x_new = np.linspace(0.0, 1.0, new_len, endpoint=False)
    return np.interp(x_new, x_old, sig).astype(np.float32)


def trim_silence(sig: np.ndarray, sr: int, thresh_db: float = -36.0) -> np.ndarray:
    if len(sig) == 0:
        return sig
    amp = np.abs(sig)
    peak = float(np.max(amp))
    if peak < 1e-6:
        return sig
    thresh = peak * (10.0 ** (thresh_db / 20.0))
    idx = np.where(amp > thresh)[0]
    if len(idx) == 0:
        return sig
    pad = int(0.025 * sr)
    start = max(0, int(idx[0]) - pad)
    end = min(len(sig), int(idx[-1]) + pad)
    return sig[start:end]


def add_delay(sig: np.ndarray, sr: int, delay_ms: float, wet: float, feedback: float = 0.0) -> np.ndarray:
    d = max(1, int(round(sr * delay_ms / 1000.0)))
    out = np.pad(sig, (0, d)).astype(np.float32)
    dry = out.copy()
    buf = np.zeros_like(out)
    buf[d:] = dry[:-d]
    if feedback > 0 and d * 2 < len(out):
        buf[d * 2 :] += dry[: -(d * 2)] * feedback
    return out + buf * wet


def simple_high_presence(sig: np.ndarray, amount: float = 0.28) -> np.ndarray:
    """Gentle 1st-order high-frequency presence boost for helmet clarity."""
    if len(sig) < 2:
        return sig
    diff = np.empty_like(sig)
    diff[0] = sig[0]
    diff[1:] = sig[1:] - 0.85 * sig[:-1]
    return sig + diff * amount


def process_profile(sig: np.ndarray, sr: int, profile: str) -> np.ndarray:
    sig = trim_silence(sig, sr)
    sig = resample_linear(sig, sr, TARGET_SR)
    sr = TARGET_SR

    if profile == "nova_blade":
        x = shift_pitch_speed(sig, 1.05)
        x = simple_high_presence(x, 0.28)
        x = add_delay(x, sr, 18.0, 0.16)
    elif profile == "crimson_flare":
        x = shift_pitch_speed(sig, 0.94)
        x = np.tanh(x * 1.45) / np.tanh(1.45)
        x = simple_high_presence(x, 0.22)
        x = add_delay(x, sr, 24.0, 0.14)
    elif profile == "volt_sentinel":
        x = shift_pitch_speed(sig, 1.13)
        x = simple_high_presence(x, 0.34)
        x = add_delay(x, sr, 11.0, 0.22)
    elif profile == "emerald_phantom":
        x = shift_pitch_speed(sig, 1.16)
        x = simple_high_presence(x, 0.38)
        x = add_delay(x, sr, 22.0, 0.15)
    elif profile == "obsidian_warden":
        x = shift_pitch_speed(sig, 0.80)
        x = np.tanh(x * 1.25) / np.tanh(1.25)
        x = add_delay(x, sr, 34.0, 0.22, feedback=0.35)
    elif profile == "cryo_archon":
        x = shift_pitch_speed(sig, 1.09)
        x = simple_high_presence(x, 0.32)
        x = add_delay(x, sr, 42.0, 0.20, feedback=0.4)
        x = add_delay(x, sr, 88.0, 0.12)
    elif profile == "void_reaper":
        main = shift_pitch_speed(sig, 0.86)
        shadow = shift_pitch_speed(sig, 0.68)
        m_len = max(len(main), len(shadow))
        m_pad = np.pad(main, (0, m_len - len(main)))
        s_pad = np.pad(shadow, (0, m_len - len(shadow)))
        x = m_pad * 0.78 + s_pad * 0.34
        x = add_delay(x, sr, 65.0, 0.24, feedback=0.42)
    elif profile == "ann":
        x = shift_pitch_speed(sig, 0.97)
        x = np.tanh(x * 1.3) / np.tanh(1.3)
        x = simple_high_presence(x, 0.26)
        x = add_delay(x, sr, 55.0, 0.22, feedback=0.38)
        x = add_delay(x, sr, 115.0, 0.10)
    else:  # kiai
        x = shift_pitch_speed(sig, 1.14)
        x = np.tanh(x * 1.35) / np.tanh(1.35)
        x = simple_high_presence(x, 0.30)
        x = add_delay(x, sr, 16.0, 0.14)

    # Smooth 15ms fade-in/out & peak normalize to 0.92
    x = trim_silence(x, sr, -42.0)
    fade = min(len(x) // 4, int(0.015 * sr))
    if fade > 1:
        x[:fade] *= np.linspace(0.0, 1.0, fade, dtype=np.float32)
        x[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)
    peak = float(np.max(np.abs(x))) if len(x) else 1.0
    if peak > 1e-6:
        x = (x / peak) * 0.92
    return np.clip(x, -1.0, 1.0)


def write_wav_mono(path: Path, sig: np.ndarray, sr: int = TARGET_SR) -> None:
    pcm = (np.clip(sig, -1.0, 1.0) * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        raw_items: list[tuple[str, str, str]] = []
        for key, (_profile, phrase) in CLIPS.items():
            raw_items.append((key, phrase, os.path.join(tmp, f"{key}.wav")))

        synthesize_raw_winrt(raw_items)

        for key, (profile, _phrase) in CLIPS.items():
            raw_path = Path(tmp) / f"{key}.wav"
            sig, sr = read_wav_mono(raw_path)
            processed = process_profile(sig, sr, profile)
            out_path = OUT_DIR / f"{key}.wav"
            write_wav_mono(out_path, processed, TARGET_SR)
            dur = len(processed) / float(TARGET_SR)
            print(f"Wrote {out_path.name:28s} ({dur:0.2f}s, {out_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
