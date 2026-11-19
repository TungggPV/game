"""Extract and clean game-ready sprites from the 5 uncut 1448x1086 master sheets.

Every character pose, dynamic art, and enemy/boss frame is cut directly from the
master sheets (so helmets, horns, weapons, and boots are never sliced off),
flood-filled from borders + bottom floor shadow, scrubbed of enclosed grey
background pockets (e.g. between boots), edge-decontaminated against light grey
matte halos, trimmed with a clean transparent margin, and indexed in
src/config/sprites.json.

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

HERO_SHEETS = {
    "nova_blade": ("sheets/tờ_hướng_dẫn_nhân_vật_game_hiệu_ứng.png", 555, 720, 768, 932),
    "crimson_flare": ("crimson_flare/sheet/source_sheet.png", 544, 718, 754, 918),
    "volt_sentinel": ("volt_sentinel/sheet/source_sheet.png", 544, 720, 764, 928),
    "emerald_phantom": ("emerald_phantom/sheet/source_sheet.png", 512, 680, 724, 888),
}

ROW1_POSES = [
    ("idle", (44, 172)),
    ("walk_1", (195, 326)),
    ("walk_2", (334, 464)),
    ("walk_3", (465, 594)),
    ("walk_4", (598, 732)),
    ("jump", (750, 908)),
]

ROW2_POSES = [
    ("attack_slash", (15, 265)),
    ("attack_blast", (285, 532)),
    ("dash", (560, 762)),
    ("hit_reaction", (765, 955)),
]

HERO_SRC_ICONS = {
    "nova_blade": "nova_blade",
    "crimson_flare": "crimson_flare",
    "volt_sentinel": "volt_sentinel",
    "emerald_phantom": "emerald_phantom",
}

ENEMY_MASTER_SHEET = "sheets/bảng_tài_nguyên_kẻ_địch_nova_strike.png"
ENEMY_BOXES = {
    "crawler": (34, 78, 250, 195),
    "crawler_walk": (302, 122, 405, 186),
    "crawler_leap": (556, 88, 725, 186),
    "crawler_explode": (728, 64, 860, 186),
    "mutant": (10, 268, 250, 447),
    "mutant_idle": (286, 298, 398, 405),
    "mutant_walk1": (414, 298, 522, 405),
    "mutant_walk2": (536, 296, 664, 405),
    "mutant_punch": (670, 296, 868, 405),
    "hunter": (10, 512, 268, 656),
    "hunter_dive": (402, 516, 508, 648),
    "hunter_fire": (526, 516, 682, 648),
    "hunter_sweep": (683, 516, 870, 648),
    "aegis": (10, 718, 210, 864),
    "aegis_walk": (348, 718, 444, 838),
    "aegis_bash": (468, 718, 604, 838),
    "aegis_shot": (606, 718, 741, 838),
    "aegis_break": (742, 718, 866, 838),
    "boss": (888, 56, 1430, 444),
    "boss_idle": (1020, 472, 1235, 603),
    "boss_slam": (885, 616, 1118, 780),
    "boss_whip": (1126, 616, 1412, 780),
    "boss_beam": (840, 825, 1020, 990),
    "boss_summon": (1022, 825, 1218, 990),
    "boss_rage": (1220, 820, 1434, 990),
}

ENEMY_ALIASES = {
    "bomber": "crawler",
    "sniper": "hunter",
    "drone": "hunter",
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


def estimate_sheet_bg(sheet: np.ndarray) -> np.ndarray:
    """Estimate neutral grey matte RGB from clean header-margin pixels."""
    patch = sheet[8:26, 540:700, :3]
    return np.median(patch, axis=(0, 1))


def dilate8(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    out = np.zeros_like(mask)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            ys0, ys1 = max(0, -dy), h - max(0, dy)
            xs0, xs1 = max(0, -dx), w - max(0, dx)
            yd0, yd1 = max(0, dy), h - max(0, -dy)
            xd0, xd1 = max(0, dx), w - max(0, -dx)
            out[yd0:yd1, xd0:xd1] |= mask[ys0:ys1, xs0:xs1]
    return out


def clear_enclosed_pockets(a: np.ndarray, bg: np.ndarray) -> None:
    """Remove neutral-grey sheet background pockets trapped between limbs, shields, or auras."""
    h, w = a.shape[:2]
    rgb = a[..., :3]
    alpha = a[..., 3]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    lum = rgb.mean(axis=2)
    diff = np.abs(rgb - bg).max(axis=2)
    bright_armor = (alpha > 0) & (lum > 236) & (sat <= 18)
    pocket_mask = (alpha > 0) & (sat <= 12) & (diff <= 22)

    vis = np.zeros((h, w), dtype=bool)
    for y in range(h):
        for x in np.nonzero(pocket_mask[y] & ~vis[y])[0]:
            if vis[y, x]:
                continue
            comp: list[tuple[int, int]] = []
            ring: set[tuple[int, int]] = set()
            q = deque([(y, x)])
            vis[y, x] = True
            while q:
                cy, cx = q.popleft()
                comp.append((cy, cx))
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < h and 0 <= nx < w:
                        if pocket_mask[ny, nx] and not vis[ny, nx]:
                            vis[ny, nx] = True
                            q.append((ny, nx))
                        elif not pocket_mask[ny, nx] and alpha[ny, nx] > 0:
                            ring.add((ny, nx))
            if len(comp) < 12:
                continue
            bw_cnt = sum(1 for ry, rx in ring if bright_armor[ry, rx])
            bw_ratio = bw_cnt / max(1, len(ring))
            threshold = 0.45 if len(comp) >= 45 else 0.32
            if bw_ratio < threshold:
                ys = [p[0] for p in comp]
                xs = [p[1] for p in comp]
                a[ys, xs, 3] = 0


def decontaminate_edges(a: np.ndarray, bg: np.ndarray) -> None:
    """Unmix sheet-grey anti-aliased edge halos around ink outlines and glow FX."""
    trans = a[..., 3] < 24
    d1 = dilate8(trans) & (a[..., 3] > 0)
    d2 = (dilate8(trans | d1) & (a[..., 3] > 0)) | d1

    rgb = a[..., :3].astype(np.float32)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    lum = rgb.mean(axis=2)
    diff = np.abs(rgb - bg).max(axis=2)
    bg_lum = float(bg.mean())

    # Case A: neutral grey AA halo pixels clinging to black ink outline
    halo = d2 & (sat < 36) & (lum > 55)
    new_a = np.clip((bg_lum - lum) / max(1.0, bg_lum - 28.0), 0.0, 1.0) * 255.0
    a[halo & (new_a < 28), 3] = 0
    keep_halo = halo & (new_a >= 28)
    a[keep_halo, 3] = np.minimum(a[keep_halo, 3], new_a[keep_halo].astype(np.int16))
    a[keep_halo, :3] = (rgb[keep_halo] * 0.28).astype(np.int16)

    # Case B: translucent cyan/orange/gold/green FX pixels blended onto sheet grey
    glow_edge = d2 & (sat >= 36) & (lum > 140) & (diff < 75)
    if np.any(glow_edge):
        unmixed = np.clip((rgb[glow_edge] - bg * 0.35) / 0.65, 0.0, 255.0)
        a[glow_edge, :3] = unmixed.astype(np.int16)
        soft_a = np.clip(sat[glow_edge] * 2.4, 40.0, 255.0).astype(np.int16)
        a[glow_edge, 3] = np.minimum(a[glow_edge, 3], soft_a)


def defringe(a: np.ndarray) -> None:
    """Clean dirty semi-transparent white/grey edge halos from boundary pixels."""
    alpha = a[..., 3]
    rgb = a[..., :3]
    light = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    fringe = (alpha > 0) & (alpha < 130) & (light > 150) & (sat < 40)
    a[fringe, 3] = 0


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


def keep_main(a: np.ndarray, ratio: float = 0.04) -> None:
    labels, sizes = components(a[..., 3])
    if len(sizes) <= 1:
        return
    biggest = max(sizes[1:])
    keep = {i for i, s in enumerate(sizes) if i and s >= biggest * ratio}
    a[~np.isin(labels, list(keep)), 3] = 0


def trim(a: np.ndarray, pad: int = 2) -> np.ndarray:
    ys, xs = np.nonzero(a[..., 3] > 24)
    if ys.size == 0 or xs.size == 0:
        return a
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, a.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, a.shape[1])
    cropped = a[y0:y1, x0:x1]
    out = np.zeros((cropped.shape[0] + pad * 2, cropped.shape[1] + pad * 2, 4), dtype=cropped.dtype)
    out[pad : pad + cropped.shape[0], pad : pad + cropped.shape[1]] = cropped
    return out


def clean_master_cell(cell: np.ndarray, bg: np.ndarray, shadow_px: int = 16, ratio: float = 0.04) -> np.ndarray:
    """Flood-fill remove sheet matte + bottom shadow, scrub pockets & decontaminate edges."""
    a = cell.copy()
    h, w = a.shape[:2]
    rgb = a[..., :3]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    lum = rgb.mean(axis=2)
    diff = np.abs(rgb - bg).max(axis=2)

    is_bg = (sat <= 13) & (diff <= 24)
    if shadow_px > 0 and shadow_px < h:
        is_shadow = (sat <= 16) & (lum >= 125) & (lum <= 228)
        is_shadow[: h - shadow_px, :] = False
        cand = is_bg | is_shadow
    else:
        cand = is_bg

    vis = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand[y, x] and not vis[y, x]:
                vis[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y, x] and not vis[y, x]:
                vis[y, x] = True
                q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not vis[ny, nx] and cand[ny, nx]:
                vis[ny, nx] = True
                q.append((ny, nx))

    a[vis, 3] = 0
    clear_enclosed_pockets(a, bg)
    keep_main(a, ratio)
    decontaminate_edges(a, bg)
    return a


def foot_anchor(a: np.ndarray) -> float:
    """Normalised x of the opaque mass in the lowest 12% of the sprite."""
    h = a.shape[0]
    band = a[int(h * 0.88) :, :, 3] > 40
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


ICON_CIRCLE = {
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


def save_mirrored_background(name: str) -> tuple[dict, dict]:
    """Save both standard and horizontally mirrored background for seamless infinite horizontal scrolling."""
    a = load(f"backgrounds/{name}.png")
    rgb = a[..., :3].mean(axis=2)
    keep_rows = np.nonzero((rgb.mean(axis=1) < 150) & (rgb.mean(axis=1) > 12))[0]
    keep_cols = np.nonzero((rgb.mean(axis=0) < 150) & (rgb.mean(axis=0) > 12))[0]
    cropped = a[keep_rows.min() : keep_rows.max() + 1, keep_cols.min() + 2 : keep_cols.max() - 1]

    entry_std = save(cropped, f"bg_{name}")
    flipped = np.ascontiguousarray(cropped[:, ::-1, :])
    mirrored = np.concatenate([cropped, flipped], axis=1)
    entry_mirrored = save(mirrored, f"bg_{name}_mirrored")
    return entry_std, entry_mirrored


def recolor_to_obsidian(a: np.ndarray) -> np.ndarray:
    """Recolor armor to dark volcanic slate / obsidian stone with warm amber-gold core energy."""
    res = a.copy().astype(np.float32)
    alpha = res[..., 3]
    rgb = res[..., :3]
    gray = rgb.mean(axis=2)

    is_core = (rgb[..., 0] < 120) & (rgb[..., 2] > 160) & (alpha > 40)
    res[..., 0] = np.clip(gray * 0.72 + 22, 0, 255)
    res[..., 1] = np.clip(gray * 0.62 + 16, 0, 255)
    res[..., 2] = np.clip(gray * 0.58 + 14, 0, 255)

    res[is_core, 0] = 255
    res[is_core, 1] = 185
    res[is_core, 2] = 55
    return res.astype(np.int16)


def main() -> None:
    manifest: dict[str, dict] = {}
    cleaned_heroes: dict[str, dict[str, np.ndarray]] = {}

    # 1. Extract all 4 base heroes directly from uncut 1448x1086 master sheets
    for hero, (rel_sheet, r1y0, r1y1, r2y0, r2y1) in HERO_SHEETS.items():
        sheet = load(rel_sheet)
        bg = estimate_sheet_bg(sheet)
        cleaned_heroes[hero] = {}

        for pose, (x0, x1) in ROW1_POSES:
            y0 = r1y0 if pose == "jump" else (r1y0 + 18 if hero == "emerald_phantom" else r1y0 + 25)
            cell = clean_master_cell(sheet[y0:r1y1, x0:x1], bg, shadow_px=16, ratio=0.04)
            cleaned_heroes[hero][pose] = cell
            trimmed = trim(cell, pad=2)
            entry = save(trimmed, f"{hero}_{pose}")
            entry["ax"] = foot_anchor(trimmed)
            manifest[f"{hero}_{pose}"] = entry

        for pose, (x0, x1) in ROW2_POSES:
            cell = clean_master_cell(sheet[r2y0:r2y1, x0:x1], bg, shadow_px=16, ratio=0.025)
            if pose == "attack_blast":
                for i in range(8):
                    cell[:, -1 - i, 3] = (cell[:, -1 - i, 3] * i) // 8
            elif pose == "dash":
                for i in range(8):
                    cell[:, i, 3] = (cell[:, i, 3] * i) // 8
            cleaned_heroes[hero][pose] = cell
            trimmed = trim(cell, pad=2)
            entry = save(trimmed, f"{hero}_{pose}")
            entry["ax"] = foot_anchor(trimmed)
            manifest[f"{hero}_{pose}"] = entry

        art_cell = clean_master_cell(sheet[56:546, 740:1446], bg, shadow_px=0, ratio=0.02)
        cleaned_heroes[hero]["art"] = art_cell
        manifest[f"{hero}_art"] = save(trim(art_cell, pad=2), f"{hero}_art", 420)

        icon_names = {"basic": "j_basic_attack", "skill1": "k_skill1", "skill2": "l_skill2", "ultimate": "u_ultimate"}
        for slot, file in icon_names.items():
            manifest[f"{hero}_icon_{slot}"] = circle_icon(
                f"skills/{HERO_SRC_ICONS[hero]}/icons/{file}_icon.png", f"{hero}_icon_{slot}"
            )

    # 2. Hero 5: Obsidian Warden (recolored from cleaned Nova Blade master sheet sprites)
    for pose, src_arr in cleaned_heroes["nova_blade"].items():
        if pose == "art":
            art_obs = recolor_to_obsidian(src_arr)
            manifest["obsidian_warden_art"] = save(trim(art_obs, pad=2), "obsidian_warden_art", 420)
        else:
            recolored = recolor_to_obsidian(src_arr)
            trimmed = trim(recolored, pad=2)
            entry = save(trimmed, f"obsidian_warden_{pose}")
            entry["ax"] = foot_anchor(trimmed)
            manifest[f"obsidian_warden_{pose}"] = entry

    for slot, file in {"basic": "j_basic_attack", "skill1": "k_skill1", "skill2": "l_skill2", "ultimate": "u_ultimate"}.items():
        a = load(f"skills/nova_blade/icons/{file}_icon.png")
        a = recolor_to_obsidian(a)
        side = min(a.shape[0], a.shape[1])
        a = a[:side, :side].copy()
        yy, xx = np.mgrid[0:side, 0:side]
        cx, cy, r = side * 0.5, side * 0.42, side * 0.34
        a[((yy - cy) ** 2 + (xx - cx) ** 2) > r * r, 3] = 0
        manifest[f"obsidian_warden_icon_{slot}"] = save(trim(a, 0), f"obsidian_warden_icon_{slot}", 96)

    # 3. Extract all 25 enemy sprites/poses from uncut enemy master sheet + aliases
    enemy_sheet = load(ENEMY_MASTER_SHEET)
    enemy_bg = estimate_sheet_bg(enemy_sheet)
    cleaned_enemies: dict[str, np.ndarray] = {}
    for name, (x0, y0, x1, y1) in ENEMY_BOXES.items():
        shadow_px = 20 if name == "boss" else 14
        ratio = 0.015 if ("explode" in name or "break" in name or "rage" in name or "whip" in name or "summon" in name) else 0.03
        cell = clean_master_cell(enemy_sheet[y0:y1, x0:x1], enemy_bg, shadow_px=shadow_px, ratio=ratio)
        trimmed = trim(cell, pad=2)
        cleaned_enemies[name] = trimmed
        entry = save(trimmed, name)
        entry["ax"] = foot_anchor(trimmed)
        manifest[name] = entry

    for alias, src_name in ENEMY_ALIASES.items():
        trimmed = cleaned_enemies[src_name]
        entry = save(trimmed, alias)
        entry["ax"] = foot_anchor(trimmed)
        manifest[alias] = entry

    # 4. Items & FX
    for name, rel in {**ITEMS, **FX}.items():
        a = load(rel)
        if name == "item_coin":
            a[: int(a.shape[0] * 0.25), :, 3] = 0
        defringe(a)
        keep_main(a, 0.4 if name == "item_coin" else 0.05)
        manifest[name] = save(trim(a, pad=2), name, 64 if name.startswith("item") else None)

    # 5. City Props (Crate, Barrel, Supply Chest)
    city_props = Image.open(ROOT / "props" / "city_props.png").convert("RGBA")
    crate = city_props.crop((0, 0, 72, 72))
    crate.save(OUT / "prop_crate.png", optimize=True)
    manifest["prop_crate"] = {"file": "prop_crate.png", "w": 72, "h": 72, "ax": 0.5}

    barrel = city_props.crop((94, 22, 138, 72))
    barrel.save(OUT / "prop_barrel.png", optimize=True)
    manifest["prop_barrel"] = {"file": "prop_barrel.png", "w": 44, "h": 50, "ax": 0.5}

    chest = city_props.crop((163, 7, 281, 72))
    chest.save(OUT / "prop_chest.png", optimize=True)
    manifest["prop_chest"] = {"file": "prop_chest.png", "w": 118, "h": 65, "ax": 0.5}

    # 6. Seamless Backgrounds
    for bg_name in ["city_neon", "lab_sewer", "lava_fortress"]:
        std, mir = save_mirrored_background(bg_name)
        manifest[f"bg_{bg_name}"] = std
        manifest[f"bg_{bg_name}_mirrored"] = mir

    MANIFEST.write_text(json.dumps(manifest, indent=1))
    print(f"wrote {len(manifest)} entries into sprites.json")


if __name__ == "__main__":
    main()
