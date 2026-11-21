"""Generate expressive Microsoft Edge Neural English voice clips for Element Armor.

Uses `edge-tts` with 7 distinct human neural voice actors (Andrew, Guy, Roger,
Ava, Christopher, Sonia, Ryan) and dramatic prosody settings (pitch, rate, volume,
pauses) to produce expressive `.mp3` clips in `public/assets/audio/voice/`.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import edge_tts

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "audio" / "voice"

# key -> (neural_voice, rate, pitch, volume, phrase)
CLIPS: dict[str, tuple[str, str, str, str, str]] = {
    # Nova Blade — Warm, Confident Hero (en-US-AndrewNeural)
    "select_nova_blade": ("en-US-AndrewNeural", "+4%", "+3Hz", "+15%", "Nova Blade... online! Ready to cut through the dark!"),
    "skill_nova_blade": ("en-US-AndrewNeural", "+16%", "+8Hz", "+25%", "Plasma slash!"),
    "ult_nova_blade": ("en-US-AndrewNeural", "+10%", "+9Hz", "+25%", "All systems, MAX POWER! NOVA... OVERDRIVE!"),
    # Crimson Flare — Passionate, Fierce Striker (en-US-GuyNeural)
    "select_crimson_flare": ("en-US-GuyNeural", "+4%", "-4Hz", "+15%", "Hah! Crimson Flare is here! Let's burn it all to ash!"),
    "skill_crimson_flare": ("en-US-GuyNeural", "+16%", "+6Hz", "+25%", "Burn! Fire burst!"),
    "ult_crimson_flare": ("en-US-GuyNeural", "+10%", "+8Hz", "+25%", "Feel the heat! IGNITE! CRIMSON METEOR!"),
    # Volt Sentinel — Lively, Fast-Talking Speedster (en-US-RogerNeural)
    "select_volt_sentinel": ("en-US-RogerNeural", "+12%", "+6Hz", "+15%", "Volt Sentinel! Blink... and you're already fried!"),
    "skill_volt_sentinel": ("en-US-RogerNeural", "+18%", "+10Hz", "+25%", "High voltage!"),
    "ult_volt_sentinel": ("en-US-RogerNeural", "+14%", "+12Hz", "+25%", "Sky's cracking! Thunder descend... STORM BREAKER!"),
    # Emerald Phantom — Expressive Female Assassin (en-US-AvaNeural)
    "select_emerald_phantom": ("en-US-AvaNeural", "+6%", "+4Hz", "+15%", "Emerald Phantom... locked in. Try to keep up!"),
    "skill_emerald_phantom": ("en-US-AvaNeural", "+16%", "+10Hz", "+25%", "Too slow! Wind blade!"),
    "ult_emerald_phantom": ("en-US-AvaNeural", "+14%", "+10Hz", "+25%", "Now you see me... now you're GONE! EMERALD MIRAGE!"),
    # Obsidian Warden — Deep Authoritative Titan (en-US-ChristopherNeural)
    "select_obsidian_warden": ("en-US-ChristopherNeural", "-8%", "-18Hz", "+20%", "Obsidian Warden! Stand behind me... Nothing breaks this wall."),
    "skill_obsidian_warden": ("en-US-ChristopherNeural", "+4%", "-14Hz", "+25%", "CRUSH THEM! Earthquake!"),
    "ult_obsidian_warden": ("en-US-ChristopherNeural", "-4%", "-16Hz", "+25%", "Crumble to dust! TECTONIC... WRATH!"),
    # Cryo Archon — Regal British Ice Queen (en-GB-SoniaNeural)
    "select_cryo_archon": ("en-GB-SoniaNeural", "-4%", "-3Hz", "+15%", "Cryo Archon. Silence... and bow before the frost."),
    "skill_cryo_archon": ("en-GB-SoniaNeural", "+10%", "+5Hz", "+25%", "Freeze! Glacial lance!"),
    "ult_cryo_archon": ("en-GB-SoniaNeural", "+4%", "+6Hz", "+25%", "Winter claims you! Absolute zero... ETERNAL PERMAFROST!"),
    # Void Reaper — Dark Eerie British Stalker (en-GB-RyanNeural)
    "select_void_reaper": ("en-GB-RyanNeural", "-10%", "-18Hz", "+15%", "Void Reaper... Reality is so fragile. Let's break it."),
    "skill_void_reaper": ("en-GB-RyanNeural", "+8%", "-12Hz", "+25%", "Tear it open! Void rift!"),
    "ult_void_reaper": ("en-GB-RyanNeural", "-2%", "-14Hz", "+25%", "Shatter the void! DIMENSION... ECLIPSE!"),
    # Combat Kiai / Efforts
    "kiai_1": ("en-US-GuyNeural", "+20%", "+12Hz", "+25%", "Haah!"),
    "kiai_2": ("en-US-AvaNeural", "+20%", "+14Hz", "+25%", "Hyaa!"),
    "kiai_3": ("en-US-AndrewNeural", "+16%", "+10Hz", "+25%", "Break through!"),
    # Arena Announcer (Booming Stadium Voice)
    "ann_fight": ("en-US-ChristopherNeural", "+12%", "-8Hz", "+25%", "FIGHT!"),
    "ann_break": ("en-US-ChristopherNeural", "+8%", "-10Hz", "+25%", "ARMOR BREAK!"),
    "ann_parry": ("en-US-ChristopherNeural", "+8%", "-6Hz", "+25%", "PERFECT PARRY!"),
    "ann_reaction": ("en-US-ChristopherNeural", "+8%", "-6Hz", "+25%", "ELEMENTAL SURGE!"),
    "ann_boss": ("en-US-ChristopherNeural", "-4%", "-14Hz", "+25%", "Alert! Massive threat inbound! BOSS APPROACHING!"),
    "ann_victory": ("en-US-ChristopherNeural", "+2%", "-8Hz", "+25%", "Target eliminated! Mission... COMPLETE!"),
    "ann_defeat": ("en-US-ChristopherNeural", "-10%", "-16Hz", "+15%", "Armor critical... Mission failed."),
}


async def synth_one(sem: asyncio.Semaphore, key: str, cfg: tuple[str, str, str, str, str]) -> None:
    voice, rate, pitch, volume, phrase = cfg
    out_path = OUT_DIR / f"{key}.mp3"
    async with sem:
        for attempt in range(3):
            try:
                comm = edge_tts.Communicate(phrase, voice, rate=rate, pitch=pitch, volume=volume)
                await comm.save(str(out_path))
                break
            except Exception:
                if attempt == 2:
                    raise
                await asyncio.sleep(0.4 * (attempt + 1))
    size = out_path.stat().st_size
    if size < 1000:
        raise RuntimeError(f"Generated MP3 too small for {key}: {size} bytes")
    print(f"Wrote {out_path.name:28s} ({voice:24s}, {size} bytes)")


async def run() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Remove legacy .wav voice clips so only neural .mp3 assets exist
    for old_wav in OUT_DIR.glob("*.wav"):
        old_wav.unlink()
    sem = asyncio.Semaphore(2)
    await asyncio.gather(*(synth_one(sem, k, v) for k, v in CLIPS.items()))
    print(f"NEURAL_TTS_OK:{len(CLIPS)}")


if __name__ == "__main__":
    asyncio.run(run())
