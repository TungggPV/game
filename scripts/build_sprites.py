"""Clean the hand-cut source art into game-ready sprites.

Source PNGs under public/assets contain matte shadows, stray labels and slivers of
neighbouring cells. This script keeps the main silhouette, strips the grey floor
shadow, trims, scales to a common height and writes public/assets/game/ plus a
manifest with foot anchors used by the runtime.

Run: python scripts/build_sprites.py   (needs pillow + numpy)
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "assets"
OUT = ROOT / "game"
MANIFEST = Path(__file__).resolve().parents[1] / "src" / "config" / "sprites.json"

HERO_SRC = {
    "nova_blade": "hero",
    "crimson_flare": "processed/crimson_flare",
    "volt_sentinel": "processed/volt_sentinel",
    "emerald_phantom": "processed/emerald_phantom",
}
WALK_HEROES = {"nova_blade"}  # other heroes' walk cells are mis-cut in the source sheets
HERO_POSES = ["idle", "jump", "attack_slash", "attack_blast", "dash", "hit_reaction"]

ENEMIES = {
    "crawler": "enemies/crawler/crawler_main.png",
    "hunter": "enemies/sky_hunter/sky_hunter_main.png",
    "mutant": "enemies/horned_mutant/mutant_main.png",
    "mutant_walk1": "enemies/horned_mutant/walk_1.png",
    "mutant_punch": "enemies/horned_mutant/walk_2.png",
    "aegis": "enemies/aegis_elite/aegis_main.png",
    "boss": "enemies/boss/abyssal_colossus_main.png",
    "boss_idle": "enemies/boss/idle.png",
    "boss_slam": "enemies/boss/slam.png",
    "boss_whip": "enemies/boss/tentacle_whip.png",
    "boss_rage": "enemies/boss/rage.png",
}

ITEMS = {
    "item_health": "items/health_pickup.png",
    "item_energy": "items/energy_crystal.png",
    "item_coin": "items/credit_coin.png",
    "item_chip": "items/upgrade_chip.png",
}

FX = {
    "fx_slash1": "effects/slash_crescent_1.png",
    "fx_slash2": "effects/slash_crescent_2.png",
}


def load(rel: str) -> np.ndarray:
    return np.array(Image.open(ROOT / rel).convert("RGBA"), dtype=np.int16)


def strip_floor_shadow(a: np.ndarray, band: float = 0.35) -> None:
    """Remove the flat grey floor matte: grey pixels in the lower band that touch
    transparency, flood-filled through neighbouring grey. Pixel-art outlines keep
    white armour from touching transparency, so it survives."""
    h, w = a.shape[:2]
    start = int(h * (1 - band))
    rgb = a[..., :3]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    light = rgb.mean(axis=2)
    cand = (sat < 18) & (light > 135) & (light < 240) & (a[..., 3] > 0)
    cand[:start] = False
    clear = a[..., 3] < 20
    border = np.zeros_like(clear)
    border[1:] |= clear[:-1]
    border[:-1] |= clear[1:]
    border[:, 1:] |= clear[:, :-1]
    border[:, :-1] |= clear[:, 1:]
    seen = cand & border
    q = deque(zip(*np.nonzero(seen)))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    a[seen, 3] = 0


def components(alpha: np.ndarray) -> tuple[np.ndarray, list[int]]:
    h, w = alpha.shape
    solid = alpha > 24
    labels = np.zeros((h, w), dtype=np.int32)
    sizes = [0]
    current = 0
    for y in range(h):
        row = solid[y]
        for x in np.nonzero(row & (labels[y] == 0))[0]:
            if labels[y, x]:
                continue
            current += 1
            size = 0
            q = deque([(y, x)])
            labels[y, x] = current
            while q:
                cy, cx = q.popleft()
                size += 1
                for ny in range(max(cy - 2, 0), min(cy + 3, h)):
                    for nx in range(max(cx - 2, 0), min(cx + 3, w)):
                        if solid[ny, nx] and not labels[ny, nx]:
                            labels[ny, nx] = current
                            q.append((ny, nx))
            sizes.append(size)
    return labels, sizes


def keep_main(a: np.ndarray, ratio: float = 0.12) -> None:
    labels, sizes = components(a[..., 3])
    if len(sizes) <= 1:
        return
    biggest = max(sizes[1:])
    keep = {i for i, s in enumerate(sizes) if i and s >= biggest * ratio}
    a[~np.isin(labels, list(keep)), 3] = 0


def trim(a: np.ndarray, pad: int = 2) -> np.ndarray:
    ys, xs = np.nonzero(a[..., 3] > 24)
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, a.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, a.shape[1])
    return a[y0:y1, x0:x1]


def foot_anchor(a: np.ndarray) -> float:
    """Normalised x of the opaque mass in the lowest 12% of the sprite."""
    h = a.shape[0]
    band = a[int(h * 0.88):, :, 3] > 40
    xs = np.nonzero(band.any(axis=0))[0]
    if xs.size == 0:
        return 0.5
    return float((xs.min() + xs.max()) / 2 / a.shape[1])


def save(a: np.ndarray, name: str, height: int | None = None) -> dict:
    img = Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")
    if height and img.height != height:
        w = round(img.width * height / img.height)
        img = img.resize((w, height), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / f"{name}.png", optimize=True)
    return {"file": f"{name}.png", "w": img.width, "h": img.height}


ICON_CIRCLE = {  # (cx, cy, r) as fractions of the source height, for icons whose circle is off-centre
    "emerald_phantom_icon_skill2": (0.34, 0.52, 0.3),
    "emerald_phantom_icon_ultimate": (0.34, 0.52, 0.3),
    "volt_sentinel_icon_skill2": (0.36, 0.5, 0.32),
    "volt_sentinel_icon_ultimate": (0.36, 0.5, 0.32),
}


def circle_icon(rel: str, name: str, size: int = 96) -> dict:
    a = load(rel)
    side = min(a.shape[0], a.shape[1])
    a = a[:side, :side].copy()
    yy, xx = np.mgrid[0:side, 0:side]
    fx, fy, fr = ICON_CIRCLE.get(name, (0.5, 0.42, 0.34))
    cx, cy, r = side * fx, side * fy, side * fr
    a[((yy - cy) ** 2 + (xx - cx) ** 2) > r * r, 3] = 0
    a = trim(a, 0)
    return save(a, name, size)


def save_background(name: str) -> dict:
    """Crop the light/dark frame lines the source panels carry; they show as seams when tiled."""
    a = load(f"backgrounds/{name}.png")
    rgb = a[..., :3].mean(axis=2)
    keep_rows = np.nonzero((rgb.mean(axis=1) < 150) & (rgb.mean(axis=1) > 12))[0]
    keep_cols = np.nonzero((rgb.mean(axis=0) < 150) & (rgb.mean(axis=0) > 12))[0]
    a = a[keep_rows.min() : keep_rows.max() + 1, keep_cols.min() + 2 : keep_cols.max() - 1]
    return save(a, f"bg_{name}")


def main() -> None:
    manifest: dict[str, dict] = {}

    for hero, src in HERO_SRC.items():
        poses = HERO_POSES + ([f"walk_{i}" for i in range(1, 5)] if hero in WALK_HEROES else [])
        for pose in poses:
            a = load(f"{src}/sprites/{pose}.png")
            strip_floor_shadow(a)
            keep_main(a, 0.08)
            a = trim(a)
            entry = save(a, f"{hero}_{pose}")
            entry["ax"] = foot_anchor(a)
            manifest[f"{hero}_{pose}"] = entry
        art = load(f"processed/{hero}/dynamic/{'action_clean' if hero == 'nova_blade' else 'action'}.png")
        strip_floor_shadow(art, 0.2)
        keep_main(art, 0.02)
        manifest[f"{hero}_art"] = save(trim(art), f"{hero}_art", 420)

        icon_names = {"basic": "j_basic_attack", "skill1": "k_skill1", "skill2": "l_skill2", "ultimate": "u_ultimate"}
        for slot, file in icon_names.items():
            manifest[f"{hero}_icon_{slot}"] = circle_icon(f"skills/{hero}/icons/{file}_icon.png", f"{hero}_icon_{slot}")

    for name, rel in ENEMIES.items():
        a = load(rel)
        strip_floor_shadow(a, 0.4)
        keep_main(a, 0.15)
        a = trim(a)
        entry = save(a, name)
        entry["ax"] = foot_anchor(a)
        manifest[name] = entry

    for name, rel in {**ITEMS, **FX}.items():
        a = load(rel)
        keep_main(a, 0.2)
        manifest[name] = save(trim(a), name, 64 if name.startswith("item") else None)

    for bg in ["city_neon", "lab_sewer", "lava_fortress"]:
        manifest[f"bg_{bg}"] = save_background(bg)

    MANIFEST.write_text(json.dumps(manifest, indent=1))
    print(f"wrote {len(manifest)} entries")


if __name__ == "__main__":
    main()
