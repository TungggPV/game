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
import math
import os
import time
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

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


def clear_true_flat_pockets(a: np.ndarray, bg: np.ndarray, shadow_px: int = 16) -> None:
    """Remove ONLY true flat sheet-background pockets trapped between limbs/weapons/floor."""
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(np.float32)
    alpha = a[..., 3]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    lum = rgb.mean(axis=2)
    bg_lum = float(bg.mean())
    diff = np.abs(rgb - bg).max(axis=2)

    pocket_cand = (alpha > 0) & (sat <= 8) & (diff <= 12)
    pvis = np.zeros((h, w), dtype=bool)
    for y in range(h):
        for x in np.nonzero(pocket_cand[y] & ~pvis[y])[0]:
            if pvis[y, x]:
                continue
            comp: list[tuple[int, int]] = []
            ring: set[tuple[int, int]] = set()
            touches_floor = False
            pq = deque([(y, x)])
            pvis[y, x] = True
            while pq:
                cy, cx = pq.popleft()
                comp.append((cy, cx))
                if shadow_px > 0 and cy >= h - shadow_px - 4:
                    touches_floor = True
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < h and 0 <= nx < w:
                        if pocket_cand[ny, nx] and not pvis[ny, nx]:
                            pvis[ny, nx] = True
                            pq.append((ny, nx))
                        elif not pocket_cand[ny, nx]:
                            ring.add((ny, nx))
            if len(comp) < 18:
                continue
            ys_c = [p[0] for p in comp]
            xs_c = [p[1] for p in comp]
            m_sat = float(sat[ys_c, xs_c].mean())
            d_lum = float(abs(lum[ys_c, xs_c].mean() - bg_lum))
            comp_std = float(lum[ys_c, xs_c].std())
            white_armor_nb = sum(
                1 for ry, rx in ring if alpha[ry, rx] > 0 and lum[ry, rx] > 226 and sat[ry, rx] <= 16
            )
            if len(comp) >= 35 and m_sat <= 2.2 and d_lum <= 2.6 and (len(comp) >= 75 or touches_floor):
                a[ys_c, xs_c, 3] = 0
            elif 18 <= len(comp) <= 450 and white_armor_nb == 0 and m_sat <= 4.5 and comp_std <= 3.6 and min(ys_c) >= int(h * 0.45):
                a[ys_c, xs_c, 3] = 0


def unmatte_exterior_fx_halo(a: np.ndarray, bg: np.ndarray, max_depth: int = 16) -> None:
    """BFS inward from exterior transparency through non-outlined FX glow pixels and unmix sheet grey."""
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(np.float32)
    alpha = a[..., 3].astype(np.float32)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    lum = rgb.mean(axis=2)
    c_min = rgb.min(axis=2)
    bg_lum = float(bg.mean())

    passable = (
        (alpha > 0)
        & (lum >= 115)
        & (c_min >= 100)
        & (sat <= 115)
        & ~((sat <= 18) & (lum > bg_lum + 7))
    )
    ink = (alpha > 0) & ((lum < 118) | ((sat <= 18) & (lum > bg_lum + 7)))
    ink_seal = ink.copy()
    ink_seal[:, 1:-1] |= ink[:, :-2] & ink[:, 2:]
    ink_seal[1:-1, :] |= ink[:-2, :] & ink[2:, :]
    ink_seal[1:-1, 1:-1] |= (ink[:-2, :-2] & ink[2:, 2:]) | (ink[:-2, 2:] & ink[2:, :-2])
    passable = passable & ~ink_seal

    dist = np.full((h, w), -1, dtype=np.int16)
    q: deque[tuple[int, int]] = deque()
    trans = alpha == 0
    d1 = dilate8(trans) & passable
    ys0, xs0 = np.nonzero(d1)
    for y, x in zip(ys0, xs0):
        dist[y, x] = 1
        q.append((y, x))

    while q:
        cy, cx = q.popleft()
        d = dist[cy, cx]
        if d >= max_depth:
            continue
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and dist[ny, nx] == -1 and passable[ny, nx]:
                dist[ny, nx] = d + 1
                q.append((ny, nx))

    halo = dist > 0
    if not np.any(halo):
        return

    h_rgb = rgb[halo]
    h_sat = sat[halo]
    h_min = c_min[halo]
    h_lum = lum[halo]

    neutral_fringe = h_sat < 22
    grey_frac = np.clip((h_min - 70.0) / max(1.0, bg_lum - 70.0), 0.0, 0.92) * np.clip(
        1.0 - (h_sat - 15.0) / 110.0, 0.0, 1.0
    )
    unmixed_rgb = np.clip(
        (h_rgb - grey_frac[:, None] * bg[None, :]) / np.maximum(0.08, 1.0 - grey_frac[:, None]), 0.0, 255.0
    )
    new_alpha = np.clip((1.0 - grey_frac * 0.88) * np.clip(h_sat / 52.0, 0.0, 1.0), 0.0, 1.0) * 255.0
    new_alpha[neutral_fringe & (h_lum > 130)] = 0.0

    a[halo, :3] = unmixed_rgb.astype(np.int16)
    a[halo, 3] = np.minimum(a[halo, 3], new_alpha.astype(np.int16))


def decontaminate_edges(a: np.ndarray, bg: np.ndarray) -> None:
    """Unmix sheet-grey anti-aliased edge halos around exterior ink outlines and glow FX."""
    h, w = a.shape[:2]
    trans = a[..., 3] < 24
    ext_trans = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if trans[y, x] and not ext_trans[y, x]:
                ext_trans[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if trans[y, x] and not ext_trans[y, x]:
                ext_trans[y, x] = True
                q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not ext_trans[ny, nx] and trans[ny, nx]:
                ext_trans[ny, nx] = True
                q.append((ny, nx))

    d1 = dilate8(ext_trans) & (a[..., 3] > 0)
    d2 = (dilate8(ext_trans | d1) & (a[..., 3] > 0)) | d1

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
    a[keep_halo, :3] = (rgb[keep_halo] * 0.45).astype(np.int16)

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


def fix_crimson_stray_blue(a: np.ndarray) -> None:
    """Fix master-sheet artist oversight where Crimson Flare walk_1/walk_3 boots had blue paint instead of crimson red."""
    rgb = a[..., :3].astype(np.int16)
    alpha = a[..., 3]
    is_blue = (alpha > 20) & (rgb[..., 2] > rgb[..., 0] + 18) & (rgb[..., 2] > rgb[..., 1] + 8)
    if np.any(is_blue):
        r_old = rgb[is_blue, 0].copy()
        g_old = rgb[is_blue, 1].copy()
        b_old = rgb[is_blue, 2].copy()
        a[is_blue, 0] = np.clip(b_old + 15, 0, 255)
        a[is_blue, 1] = np.clip(g_old * 0.65, 0, 255).astype(np.int16)
        a[is_blue, 2] = np.clip(r_old * 0.7, 0, 255).astype(np.int16)


def clean_master_cell(
    cell: np.ndarray, bg: np.ndarray, shadow_px: int = 16, ratio: float = 0.04, halo_depth: int = 12
) -> np.ndarray:
    """Flood-fill remove sheet matte + bottom shadow, scrub true pockets, unmatte FX halos & decontaminate edges."""
    a = cell.copy()
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(np.float32)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    lum = rgb.mean(axis=2)
    bg_lum = float(bg.mean())
    diff = np.abs(rgb - bg).max(axis=2)

    is_bg = (sat <= 12) & (diff <= 18) & (lum <= bg_lum + 8)
    if shadow_px > 0 and shadow_px < h:
        is_shadow = (sat <= 16) & (lum >= 115) & (lum <= bg_lum + 8)
        is_shadow[: h - shadow_px, :] = False
        cand = is_bg | is_shadow
    else:
        cand = is_bg

    # Seal 1px anti-aliased outline gaps so exterior flood-fill never leaks into white forehead/shin plates
    fg_strong = (lum < bg_lum - 22) | (sat > 15) | (lum > bg_lum + 9)
    if shadow_px > 0 and shadow_px < h:
        fg_strong[h - shadow_px :, :] = (
            (lum[h - shadow_px :, :] < 105)
            | (sat[h - shadow_px :, :] > 18)
            | (lum[h - shadow_px :, :] > bg_lum + 9)
        )
    seal_h = np.zeros_like(fg_strong)
    seal_h[:, 1:-1] = fg_strong[:, :-2] & fg_strong[:, 2:]
    seal_v = np.zeros_like(fg_strong)
    seal_v[1:-1, :] = fg_strong[:-2, :] & fg_strong[2:, :]
    cand = cand & ~(fg_strong | seal_h | seal_v)

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
    clear_true_flat_pockets(a, bg, shadow_px=shadow_px)
    keep_main(a, ratio)
    if halo_depth > 0:
        unmatte_exterior_fx_halo(a, bg, max_depth=halo_depth)
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


def body_anchor(a: np.ndarray, pose: str) -> float:
    """Torso/helmet-locked horizontal anchor so walk/dash/slash/blast stay aligned over shadow and rig."""
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(np.float32)
    lum = rgb.mean(axis=2)
    alpha = a[..., 3]

    if pose == "idle" or pose.startswith("walk_"):
        # Exclude green/purple cape tails extending behind shoulder by focusing on opaque helmet core
        y0, y1 = int(h * 0.08), int(h * 0.34)
        mask = alpha[y0:y1, :] > 180
        xs = np.nonzero(mask)[1]
        if xs.size == 0:
            return foot_anchor(a)
        return float((np.percentile(xs, 10) + np.percentile(xs, 90)) / 2 / w)

    if pose == "attack_slash":
        y0, y1 = int(h * 0.40), int(h * 0.78)
        dark = (alpha[y0:y1, : int(w * 0.62)] > 180) & (lum[y0:y1, : int(w * 0.62)] < 95)
        xs = np.nonzero(dark)[1]
    elif pose == "attack_blast":
        y0, y1 = int(h * 0.25), int(h * 0.68)
        dark = (alpha[y0:y1, : int(w * 0.52)] > 180) & (lum[y0:y1, : int(w * 0.52)] < 95)
        xs = np.nonzero(dark)[1]
    elif pose == "dash":
        y0, y1 = int(h * 0.25), int(h * 0.68)
        x_start = int(w * 0.42)
        dark = (alpha[y0:y1, x_start:] > 180) & (lum[y0:y1, x_start:] < 95)
        xs = np.nonzero(dark)[1] + x_start
    else:
        y0, y1 = int(h * 0.25), int(h * 0.68)
        dark = (alpha[y0:y1, :] > 180) & (lum[y0:y1, :] < 95)
        xs = np.nonzero(dark)[1]

    if xs.size == 0:
        return foot_anchor(a)
    return float(np.median(xs) / w)


def save(a: np.ndarray, name: str, height: int | None = None) -> dict:
    img = Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")
    if height and img.height != height:
        w = round(img.width * height / img.height)
        img = img.resize((w, height), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f"{name}.png"
    tmp = OUT / f".tmp_{name}.png"
    for attempt in range(5):
        try:
            img.save(tmp, optimize=True)
            os.replace(tmp, target)
            return {"file": f"{name}.png", "w": img.width, "h": img.height}
        except OSError:
            if attempt == 4:
                img.save(target, optimize=True)
                return {"file": f"{name}.png", "w": img.width, "h": img.height}
            time.sleep(0.15)
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
    """Recolor armor to dark volcanic slate / obsidian stone with blazing molten-gold core and slash energy."""
    res = a.copy().astype(np.float32)
    alpha = res[..., 3]
    orig_rgb = a[..., :3].astype(np.float32)
    gray = orig_rgb.mean(axis=2)

    is_core = (orig_rgb[..., 0] < 135) & (orig_rgb[..., 2] > 155) & (alpha > 30)
    is_bright_fx = (
        (alpha > 30)
        & (orig_rgb[..., 2] > 235)
        & (orig_rgb[..., 1] > 215)
        & ((orig_rgb[..., 2] - orig_rgb[..., 0]) > 14)
    )
    res[..., 0] = np.clip(gray * 0.72 + 22, 0, 255)
    res[..., 1] = np.clip(gray * 0.62 + 16, 0, 255)
    res[..., 2] = np.clip(gray * 0.58 + 14, 0, 255)

    res[is_core, 0] = 255
    res[is_core, 1] = 175
    res[is_core, 2] = 42
    res[is_bright_fx, 0] = 255
    res[is_bright_fx, 1] = 238
    res[is_bright_fx, 2] = 158
    return res.astype(np.int16)


def recolor_to_cryo_archon(a: np.ndarray) -> np.ndarray:
    """Recolor Volt Sentinel sheets into glacial crystalline ice armor with bright cryo-cyan core/FX."""
    res = a.copy().astype(np.float32)
    alpha = res[..., 3]
    orig_rgb = a[..., :3].astype(np.float32)
    gray = orig_rgb.mean(axis=2)

    dark = gray < 58
    res[..., 0] = np.clip(np.where(dark, gray * 0.72, gray * 0.84 + 18), 0, 255)
    res[..., 1] = np.clip(np.where(dark, gray * 0.86, gray * 0.96 + 24), 0, 255)
    res[..., 2] = np.clip(np.where(dark, gray * 1.12, gray * 1.08 + 34), 0, 255)

    # Gold/yellow armor & slash FX -> deep glacier sapphire / luminous cryo cyan
    is_yellow = (orig_rgb[..., 0] > orig_rgb[..., 2] + 22) & (orig_rgb[..., 1] > orig_rgb[..., 2] + 8) & (alpha > 40)
    bright_fx = is_yellow & (gray > 195)
    mid_plate = is_yellow & ~bright_fx
    res[mid_plate, 0] = np.clip(gray[mid_plate] * 0.22 + 18, 0, 255)
    res[mid_plate, 1] = np.clip(gray[mid_plate] * 0.88 + 42, 0, 255)
    res[mid_plate, 2] = np.clip(gray[mid_plate] * 1.15 + 88, 0, 255)
    res[bright_fx, 0] = 140
    res[bright_fx, 1] = 244
    res[bright_fx, 2] = 255

    # Existing cyan core / visor -> intense arctic neon cyan
    is_cyan = (orig_rgb[..., 2] > 160) & (orig_rgb[..., 0] < 150) & (orig_rgb[..., 1] > orig_rgb[..., 0] + 15) & (alpha > 40)
    res[is_cyan, 0] = 95
    res[is_cyan, 1] = 242
    res[is_cyan, 2] = 255
    return res.astype(np.int16)


def recolor_to_void_reaper(a: np.ndarray) -> np.ndarray:
    """Recolor Emerald Phantom sheets into cosmic eclipse obsidian with neon magenta-violet energy."""
    res = a.copy().astype(np.float32)
    alpha = res[..., 3]
    orig_rgb = a[..., :3].astype(np.float32)
    gray = orig_rgb.mean(axis=2)

    dark = gray < 58
    res[..., 0] = np.clip(np.where(dark, gray * 0.85, gray * 0.88 + 14), 0, 255)
    res[..., 1] = np.clip(np.where(dark, gray * 0.62, gray * 0.72 + 10), 0, 255)
    res[..., 2] = np.clip(np.where(dark, gray * 1.12, gray * 0.98 + 26), 0, 255)

    # Green/teal plates, cape & slash FX -> cosmic amethyst & bright neon magenta
    is_green = (orig_rgb[..., 1] > orig_rgb[..., 0] + 16) & (alpha > 40)
    bright_fx = is_green & (gray > 180)
    mid_plate = is_green & ~bright_fx
    res[mid_plate, 0] = np.clip(gray[mid_plate] * 1.25 + 38, 0, 255)
    res[mid_plate, 1] = np.clip(gray[mid_plate] * 0.24 + 10, 0, 255)
    res[mid_plate, 2] = np.clip(gray[mid_plate] * 1.32 + 64, 0, 255)
    res[bright_fx, 0] = 255
    res[bright_fx, 1] = 140
    res[bright_fx, 2] = 255
    return res.astype(np.int16)


SLASH_HEAD_CFG = {
    "nova_blade": (22, 74, 62, 58, 0.9, 1.1),
    "crimson_flare": (22, 73, 61, 57, 0.9, 1.1),
    "volt_sentinel": (26, 81, 64, 63, 0.95, 1.15),
    "emerald_phantom": (22, 75, 61, 58, 1.05, 1.15),
}


def orient_attack_slash_forward(trimmed: np.ndarray, hero: str = "nova_blade") -> np.ndarray:
    """Flip attack_slash so weapon & arc swing RIGHT, then mirror full helmet+chin to face RIGHT too."""
    af = np.ascontiguousarray(trimmed[:, ::-1, :].copy())
    h, w = af.shape[:2]
    rgb = af[..., :3].astype(np.float32)
    alpha = af[..., 3]
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    dark = (alpha > 80) & (lum < 105)

    y_min, y_max, tap_l_y, tap_r_y, slope_l, slope_r = SLASH_HEAD_CFG.get(hero, SLASH_HEAD_CFG["nova_blade"])
    y_max = min(y_max, h - 1)

    _, hx_all = np.nonzero(dark[32:56, 26:74])
    if hx_all.size == 0:
        return af
    hx_all = hx_all + 26
    head_cx = int(round((np.percentile(hx_all, 5) + np.percentile(hx_all, 95)) / 2))

    head_mask = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for y in range(34, min(56, y_max + 1)):
        for x in range(max(10, head_cx - 20), min(w - 1, head_cx + 20)):
            if dark[y, x] and not head_mask[y, x]:
                head_mask[y, x] = True
                q.append((y, x))

    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if not (y_min <= ny <= y_max):
                continue
            r_xmin = int(round((head_cx - 25) + max(0, ny - tap_l_y) * slope_l))
            r_xmax = int(round((head_cx + 23) - max(0, ny - tap_r_y) * slope_r))
            if r_xmin <= nx <= r_xmax and not head_mask[ny, nx]:
                is_arc_glow = (nx >= head_cx + 21) and (lum[ny, nx] > 140) and (sat[ny, nx] > 30)
                if alpha[ny, nx] > 20 and not is_arc_glow:
                    head_mask[ny, nx] = True
                    q.append((ny, nx))

    neck_xs = np.where(head_mask[48:60].any(axis=0))[0]
    cx_mirror = int(round((neck_xs.min() + neck_xs.max()) / 2)) if neck_xs.size else head_cx

    ys, xs = np.nonzero(head_mask)
    old_pixels = af[ys, xs].copy()
    af[ys, xs] = 0
    new_xs = np.clip(2 * cx_mirror - xs, 0, w - 1)
    af[ys, new_xs] = old_pixels
    keep_main(af, 0.02)
    return trim(af, pad=2)


def _emit_hero_aliases(manifest: dict[str, dict], hid: str) -> None:
    """Register legacy pose aliases pointing to canonical high-density frames without duplicating PNGs."""
    aliases = {
        "jump_rise": "jump_2",
        "jump_apex": "jump_4",
        "jump_fall": "jump_5",
        "attack_slash_1": "attack_c1_3",
        "attack_slash_2": "attack_c2_3",
        "attack_slash_3": "attack_c3_3",
    }
    for alias, target in aliases.items():
        if f"{hid}_{target}" in manifest:
            manifest[f"{hid}_{alias}"] = dict(manifest[f"{hid}_{target}"])


def generate_variant_hero(
    target_id: str,
    src_hero: str,
    src_poses: dict[str, np.ndarray],
    recolor_fn,
    manifest: dict[str, dict],
) -> None:
    """Create a complete expanded-pose + art + 4-icon hero variant via recolor helper."""
    cycle_prefixes = (
        "walk_",
        "idle_",
        "jump_",
        "attack_c1_",
        "attack_c2_",
        "attack_c3_",
        "attack_blast_",
        "cast_ult_",
        "dash_",
        "hit_reaction_",
    )
    for pose, src_arr in src_poses.items():
        recolored = recolor_fn(src_arr)
        if pose == "art":
            manifest[f"{target_id}_art"] = save(trim(recolored, pad=2), f"{target_id}_art", 420)
        elif pose.startswith(cycle_prefixes):
            entry = save(recolored, f"{target_id}_{pose}")
            entry["ax"] = manifest[f"{src_hero}_{pose}"]["ax"]
            manifest[f"{target_id}_{pose}"] = entry
        else:
            trimmed = trim(recolored, pad=2)
            entry = save(trimmed, f"{target_id}_{pose}")
            entry["ax"] = body_anchor(trimmed, pose)
            manifest[f"{target_id}_{pose}"] = entry
    _emit_hero_aliases(manifest, target_id)

    icon_names = {"basic": "j_basic_attack", "skill1": "k_skill1", "skill2": "l_skill2", "ultimate": "u_ultimate"}
    for slot, file in icon_names.items():
        a = load(f"skills/{HERO_SRC_ICONS[src_hero]}/icons/{file}_icon.png")
        a = recolor_fn(a)
        side = min(a.shape[0], a.shape[1])
        a = a[:side, :side].copy()
        yy, xx = np.mgrid[0:side, 0:side]
        fx, fy, fr = ICON_CIRCLE.get(f"{src_hero}_icon_{slot}", (0.5, 0.42, 0.34))
        cx, cy, r = side * fx, side * fy, side * fr
        a[((yy - cy) ** 2 + (xx - cx) ** 2) > r * r, 3] = 0
        manifest[f"{target_id}_icon_{slot}"] = save(trim(a, 0), f"{target_id}_icon_{slot}", 96)


def _smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / max(1e-5, edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _alpha_over(dst: np.ndarray, src: np.ndarray) -> None:
    sa = src[..., 3:4].astype(np.float32) / 255.0
    da = dst[..., 3:4].astype(np.float32) / 255.0
    out_a = sa + da * (1.0 - sa)
    mask = (out_a[..., 0] > 1e-4) & (sa[..., 0] > 1e-4)
    for c in range(3):
        sc = src[..., c].astype(np.float32)
        dc = dst[..., c].astype(np.float32)
        dst[mask, c] = np.clip(
            (sc[mask] * sa[mask, 0] + dc[mask] * da[mask, 0] * (1.0 - sa[mask, 0])) / out_a[mask, 0], 0, 255
        ).astype(dst.dtype)
    dst[..., 3] = np.clip(out_a[..., 0] * 255.0, 0, 255).astype(dst.dtype)


def _warp_continuous_leg(
    full_img: np.ndarray,
    hip_x: float,
    hip_y: float,
    knee_y: float,
    ang_thigh_deg: float,
    ang_shin_deg: float,
    dx_hip: float,
    dy_hip: float,
    body_dy: float,
) -> np.ndarray:
    h, w = full_img.shape[:2]
    out = np.zeros_like(full_img)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    w_hip = _smoothstep(hip_y - 3.0, hip_y + 8.0, yy)
    w_shin = _smoothstep(knee_y - 5.0, knee_y + 5.0, yy)

    th1 = math.radians(ang_thigh_deg) * w_hip
    th2 = math.radians(ang_thigh_deg + ang_shin_deg) * w_hip
    c1, s1 = np.cos(th1), np.sin(th1)
    c2, s2 = np.cos(th2), np.sin(th2)

    l_thigh = knee_y - hip_y
    thx = hip_x + dx_hip * w_hip
    thy = hip_y + dy_hip * w_hip + body_dy
    tkx = thx - l_thigh * np.sin(math.radians(ang_thigh_deg)) * w_hip
    tky = thy + l_thigh * np.cos(math.radians(ang_thigh_deg)) * w_hip

    dx1 = xx - thx
    dy1 = yy - thy
    sx1 = hip_x + (dx1 * c1 + dy1 * s1)
    sy1 = hip_y + (-dx1 * s1 + dy1 * c1)

    dx2 = xx - tkx
    dy2 = yy - tky
    sx2 = hip_x + (dx2 * c2 + dy2 * s2)
    sy2 = knee_y + (-dx2 * s2 + dy2 * c2)

    sx = sx1 * (1.0 - w_shin) + sx2 * w_shin
    sy = sy1 * (1.0 - w_shin) + sy2 * w_shin

    x0 = np.floor(sx).astype(np.int32)
    y0 = np.floor(sy).astype(np.int32)
    x1 = x0 + 1
    y1 = y0 + 1
    valid = (x0 >= 0) & (x1 < w) & (y0 >= 0) & (y1 < h)
    wx = sx - x0
    wy = sy - y0

    for c in range(4):
        ch = full_img[..., c].astype(np.float32)
        v00 = np.where(valid, ch[np.clip(y0, 0, h - 1), np.clip(x0, 0, w - 1)], 0.0)
        v10 = np.where(valid, ch[np.clip(y0, 0, h - 1), np.clip(x1, 0, w - 1)], 0.0)
        v01 = np.where(valid, ch[np.clip(y1, 0, h - 1), np.clip(x0, 0, w - 1)], 0.0)
        v11 = np.where(valid, ch[np.clip(y1, 0, h - 1), np.clip(x1, 0, w - 1)], 0.0)
        val = (v00 * (1 - wx) + v10 * wx) * (1 - wy) + (v01 * (1 - wx) + v11 * wx) * wy
        if c == 3:
            val = np.where(val > 105.0, np.clip((val - 105.0) * 2.4 + 135.0, 0.0, 255.0), 0.0)
        out[..., c] = np.clip(val, 0, 255).astype(full_img.dtype)

    out[: int(hip_y - 2), :, 3] = 0
    slivers = np.zeros(out.shape[:2], dtype=bool)
    slivers[2:-2, :] = (
        (out[2:-2, :, 3] > 0)
        & ((out[1:-3, :, 3] == 0) | (out[:-4, :, 3] == 0))
        & ((out[3:-1, :, 3] == 0) | (out[4:, :, 3] == 0))
    )
    out[slivers, 3] = 0
    keep_main(out, 0.15)
    return out


def _bilinear_warp(
    padded: np.ndarray, sx: np.ndarray, sy: np.ndarray, alpha_thresh: float = 100.0
) -> np.ndarray:
    """Sample padded RGBA array at sub-pixel coords (sx, sy) with optional silhouette alpha sharpening."""
    h, w = padded.shape[:2]
    x0 = np.floor(sx).astype(np.int32)
    y0 = np.floor(sy).astype(np.int32)
    x1 = x0 + 1
    y1 = y0 + 1
    valid = (x0 >= 0) & (x1 < w) & (y0 >= 0) & (y1 < h)
    wx = sx - x0
    wy = sy - y0

    out = np.zeros_like(padded)
    for ch_i in range(4):
        ch = padded[..., ch_i].astype(np.float32)
        v00 = np.where(valid, ch[np.clip(y0, 0, h - 1), np.clip(x0, 0, w - 1)], 0.0)
        v10 = np.where(valid, ch[np.clip(y0, 0, h - 1), np.clip(x1, 0, w - 1)], 0.0)
        v01 = np.where(valid, ch[np.clip(y1, 0, h - 1), np.clip(x0, 0, w - 1)], 0.0)
        v11 = np.where(valid, ch[np.clip(y1, 0, h - 1), np.clip(x1, 0, w - 1)], 0.0)
        val = (v00 * (1.0 - wx) + v10 * wx) * (1.0 - wy) + (v01 * (1.0 - wx) + v11 * wx) * wy
        if ch_i == 3 and alpha_thresh > 0.0:
            val = np.where(
                val > alpha_thresh,
                np.clip((val - alpha_thresh) * 2.3 + alpha_thresh + 30.0, 0.0, 255.0),
                0.0,
            )
        out[..., ch_i] = np.clip(val, 0, 255).astype(padded.dtype)
    return out


def synthesize_16frame_run(base_frames: list[np.ndarray]) -> list[np.ndarray]:
    """Articulate 4 cleaned base walk poses into 16 silky gait phases (8 per half-stride) with bilinear upper warp."""
    max_h = max(f.shape[0] for f in base_frames) + 14
    max_w = max(f.shape[1] for f in base_frames) + 28
    cx_target = max_w // 2
    floor_y = max_h - 4
    aligned = []
    for f in base_frames:
        h, w = f.shape[:2]
        mask = f[int(h * 0.08) : int(h * 0.34), :, 3] > 180
        xs = np.nonzero(mask)[1]
        h_cx = int(round((np.percentile(xs, 10) + np.percentile(xs, 90)) / 2)) if xs.size else w // 2
        can = np.zeros((max_h, max_w, 4), dtype=f.dtype)
        x_off = cx_target - h_cx
        y_off = floor_y - h
        can[y_off : y_off + h, x_off : x_off + w] = f
        aligned.append(can)

    base_gait = [
        # Half-stride A: Contact -> Recoil -> Pass-In -> Pass-Cross -> Drive -> Reach
        (0, +5.0, +4.0, -1.0, 0.0, -5.0, -2.0, +1.0, 0.0, True, +1.0, +4.5, 0.0),
        (0, -4.0, +18.0, +1.5, -2.0, +4.0, +7.0, -0.5, 0.0, True, +2.8, +2.5, 0.0),
        (1, -14.0, +27.0, +4.5, -4.5, +12.0, +5.0, -3.0, 0.0, True, +0.8, 0.0, 0.0),
        (2, -25.0, +28.0, +7.5, -5.5, +18.0, +3.0, -4.8, 0.0, False, -1.2, -2.2, 0.0),
        (3, -34.0, +14.0, +9.5, -4.5, +24.0, +9.0, -6.0, -1.0, False, -2.6, -4.2, 2.0),
        (3, -18.0, +6.0, +4.5, -2.5, +12.0, +6.0, -2.5, -1.5, False, -1.8, -4.8, 3.0),
        # Half-stride B: Contact -> Recoil -> Pass-In -> Pass-Cross -> Drive -> Reach
        (3, +3.0, +7.0, 0.0, -1.0, -3.0, +3.0, +1.0, 0.0, True, +1.0, -3.5, 0.0),
        (0, -6.0, +20.0, +2.0, -2.8, +5.0, +8.0, -1.0, 0.0, True, +2.8, -1.5, 0.0),
        (1, -17.0, +29.0, +5.5, -5.0, +14.0, +4.0, -3.5, 0.0, True, +0.6, +0.5, 0.0),
        (1, -27.0, +30.0, +8.0, -6.0, +19.0, +2.0, -5.5, 0.0, True, -1.2, +2.4, 0.0),
        (2, -22.0, +19.0, +5.5, -3.8, +12.0, -3.0, -3.0, -2.5, True, -2.5, +4.2, 2.0),
        (2, -8.0, +11.0, +2.0, -1.8, +2.0, -4.0, 0.0, -2.0, True, -1.5, +4.8, 3.0),
    ]

    n_base = len(base_gait)
    gait16 = []
    for i in range(16):
        pos = i * (n_base / 16.0)
        k0 = int(math.floor(pos)) % n_base
        k1 = (k0 + 1) % n_base
        frac = pos - math.floor(pos)
        tc = 0.5 - 0.5 * math.cos(frac * math.pi)
        r0 = base_gait[k0]
        r1 = base_gait[k1]
        idx = r0[0] if frac < 0.5 else r1[0]
        front_top = r0[9] if frac < 0.5 else r1[9]
        interp = tuple(r0[j] + (r1[j] - r0[j]) * tc for j in (1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12))
        gait16.append((idx, interp[0], interp[1], interp[2], interp[3], interp[4], interp[5], interp[6], interp[7], front_top, interp[8], interp[9], int(round(interp[10]))))

    out_frames: list[np.ndarray] = []
    for idx, bt, bs_ang, bdx, bdy, ft, fs_ang, fdx, fdy, front_top, body_dy, arm_sw, lift in gait16:
        src = aligned[idx].copy()
        h, w = src.shape[:2]
        hip_y = floor_y - 44
        knee_y = floor_y - 25

        yy, xx = np.mgrid[0:h, 0:w]
        crotch_x = (cx_target - 5) + np.clip((yy - hip_y) * 0.14, -4, 6)
        side_arms = ((yy < hip_y + 14) & (xx < cx_target - 15)) | ((yy < hip_y + 9) & (xx > cx_target + 10))

        src_back = src.copy()
        src_back[side_arms | ((yy >= hip_y - 2) & (xx >= crotch_x)), 3] = 0

        src_front = src.copy()
        src_front[side_arms | ((yy >= hip_y - 2) & (xx < crotch_x)), 3] = 0

        upper = np.zeros_like(src)
        upper_mask = (yy < hip_y + 2) | side_arms
        upper[upper_mask] = src[upper_mask]

        arm_band = np.clip(1.0 - np.abs(yy - (floor_y - 62)) / 22.0, 0.0, 1.0)
        arm_side = np.clip((xx - cx_target) / 22.0, -1.0, 1.0)
        u_sx = (xx - arm_side * arm_band * arm_sw).astype(np.float32)
        u_sy = (yy - body_dy - arm_side * arm_band * (arm_sw * 0.32)).astype(np.float32)
        upper_warped = _bilinear_warp(upper, u_sx, u_sy, alpha_thresh=0.0)

        w_back = _warp_continuous_leg(src_back, cx_target - 9, hip_y, knee_y, bt, bs_ang, bdx, bdy, body_dy)
        w_front = _warp_continuous_leg(src_front, cx_target + 7, hip_y, knee_y, ft, fs_ang, fdx, fdy, body_dy)

        comp = np.zeros_like(src)
        if front_top:
            _alpha_over(comp, w_back)
            _alpha_over(comp, w_front)
        else:
            _alpha_over(comp, w_front)
            _alpha_over(comp, w_back)
        _alpha_over(comp, upper_warped)

        ys_op = np.nonzero(comp[..., 3] > 80)[0]
        if ys_op.size:
            cur_bot = int(ys_op.max())
            target_bot = floor_y - lift
            dy_shift = target_bot - cur_bot
            if dy_shift != 0:
                shifted = np.zeros_like(comp)
                s_y0 = max(0, -dy_shift)
                s_y1 = min(h, h - dy_shift)
                d_y0 = max(0, dy_shift)
                d_y1 = min(h, h + dy_shift)
                shifted[d_y0:d_y1] = comp[s_y0:s_y1]
                comp = shifted

        out_frames.append(comp)
    return out_frames


def synthesize_hero_idle8(base_idle: np.ndarray) -> tuple[list[np.ndarray], float]:
    """Synthesize 8-frame idle breathing/visor/arm combat stance with planted boots and locked torso ax."""
    pivot_x = body_anchor(base_idle, "idle") * base_idle.shape[1] + 8.0
    padded = np.pad(base_idle, ((8, 8), (8, 8), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    w_up = 1.0 - _smoothstep(h * 0.56, h * 0.72, yy)
    w_arm = _smoothstep(w * 0.16, w * 0.30, np.abs(xx - pivot_x)) * w_up

    frames: list[np.ndarray] = []
    for k in range(8):
        ph = k * (math.pi / 4.0)
        s = math.sin(ph)
        c = math.cos(ph)
        dy = -s * 2.4 * w_up + c * 1.7 * w_arm
        dx = c * 0.9 * w_up + s * 1.15 * w_arm
        frames.append(_bilinear_warp(padded, xx - dx, yy - dy, alpha_thresh=0.0))
    return _crop_union_frames(frames, pivot_x, pad=2)


def synthesize_hero_jump6(base_jump: np.ndarray) -> tuple[list[np.ndarray], float]:
    """Synthesize 6 continuous airborne jump phases (takeoff -> rise -> tuck -> apex -> dive -> landing prep)."""
    pivot_x = body_anchor(base_jump, "jump") * base_jump.shape[1] + 14.0
    padded = np.pad(base_jump, ((14, 14), (14, 14), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    pivot_y = h * 0.5
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx0 = xx - pivot_x
    dy0 = yy - pivot_y
    w_leg = _smoothstep(h * 0.55, h * 0.75, yy)
    w_arm = _smoothstep(h * 0.50, h * 0.30, yy)

    specs = [
        (-6.5, 1.05, +3.5, -2.5),
        (-4.5, 1.03, -3.5, -1.0),
        (-2.0, 1.01, -5.0, 0.0),
        (0.0, 1.00, 0.0, 0.0),
        (+5.5, 0.98, +3.5, -2.5),
        (+8.0, 0.96, +5.5, -4.0),
    ]
    frames: list[np.ndarray] = []
    for ang, sy_sc, leg_dy, arm_dy in specs:
        if ang == 0.0 and sy_sc == 1.0 and leg_dy == 0.0:
            frames.append(padded.copy())
            continue
        th = math.radians(ang)
        c, s = math.cos(th), math.sin(th)
        dy_off = leg_dy * w_leg + arm_dy * w_arm
        sx = pivot_x + dx0 * c + (dy0 / sy_sc) * s
        sy = pivot_y - dx0 * s + (dy0 / sy_sc) * c - dy_off
        frames.append(_bilinear_warp(padded, sx, sy, alpha_thresh=0.0))
    return _crop_union_frames(frames, pivot_x, pad=2)


def synthesize_hero_combo12(base_slash: np.ndarray) -> tuple[list[np.ndarray], float]:
    """Synthesize 12 locked-union combo frames (3 hits x 4 phases: windup -> swing -> peak -> follow-through)."""
    pivot_x = body_anchor(base_slash, "attack_slash") * base_slash.shape[1] + 28.0
    padded = np.pad(base_slash, ((28, 28), (28, 28), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    pivot_y = h * 0.56
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx0 = xx - pivot_x
    dy0 = yy - pivot_y
    w_blade = _smoothstep(pivot_x - 16.0, pivot_x + 16.0, xx)
    w_lunge = _smoothstep(pivot_x - 12.0, pivot_x + 30.0, xx)
    w_far_arc = _smoothstep(pivot_x + 42.0, pivot_x + 68.0, xx)

    def make_hit_4(tilt_deg: float, arc_boost: float, lunge_px: float) -> list[np.ndarray]:
        phases = [
            (-9.5 + tilt_deg * 0.35, -4.5, +2.0, 0.96, 0.16),
            (tilt_deg * 0.55 - 2.0, +2.0 * w_lunge, -1.0, 1.01, 0.72),
            (tilt_deg, lunge_px * w_lunge, 0.0, arc_boost, 1.00),
            (tilt_deg + 4.5, lunge_px * 0.65 * w_lunge, +1.5, 0.99, 0.38),
        ]
        out: list[np.ndarray] = []
        for deg, shx, shy, sc_mul, far_alpha in phases:
            th = np.radians(deg * (0.4 + 0.6 * w_blade))
            c, s = np.cos(th), np.sin(th)
            sc = 1.0 + (sc_mul - 1.0) * w_lunge
            lx = (dx0 - shx) / sc
            ly = (dy0 - shy) / sc
            fr = _bilinear_warp(padded, pivot_x + lx * c + ly * s, pivot_y - lx * s + ly * c, alpha_thresh=0.0)
            if far_alpha < 0.99:
                atten = 1.0 - w_far_arc * (1.0 - far_alpha)
                fr[..., 3] = np.clip(fr[..., 3].astype(np.float32) * atten, 0, 255).astype(fr.dtype)
            out.append(fr)
        return out

    c1 = make_hit_4(0.0, 1.02, 3.0)
    c2 = make_hit_4(-10.5, 1.04, 4.0)
    c3 = make_hit_4(+9.0, 1.07, 6.0)
    return _crop_union_frames(c1 + c2 + c3, pivot_x, pad=2)


def synthesize_hero_dash6(base_dash: np.ndarray) -> tuple[list[np.ndarray], float]:
    """Synthesize 6 continuous horizontal jet dash phases (coil -> launch -> thrust -> glide -> brake -> settle)."""
    pivot_x = body_anchor(base_dash, "dash") * base_dash.shape[1] + 16.0
    padded = np.pad(base_dash, ((12, 12), (16, 16), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    pivot_y = h * 0.55
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx0 = xx - pivot_x
    dy0 = yy - pivot_y

    specs = [
        (+3.0, 0.94, 0.97, -3.0),
        (+6.5, 1.03, 0.95, +1.5),
        (+8.5, 1.08, 0.93, +4.0),
        (+7.0, 1.06, 0.94, +3.0),
        (+2.5, 0.99, 0.98, +0.5),
        (-1.0, 0.97, 1.01, -1.0),
    ]
    frames: list[np.ndarray] = []
    for ang, sx_sc, sy_sc, shx in specs:
        th = math.radians(ang)
        c, s = math.cos(th), math.sin(th)
        lx = (dx0 - shx) / sx_sc
        ly = dy0 / sy_sc
        frames.append(_bilinear_warp(padded, pivot_x + lx * c + ly * s, pivot_y - lx * s + ly * c, alpha_thresh=0.0))
    return _crop_union_frames(frames, pivot_x, pad=2)


def synthesize_hero_blast8(base_blast: np.ndarray) -> tuple[list[np.ndarray], float]:
    """Synthesize 8-frame ranged blast sequence (gather -> aim -> charge -> ignition -> peak -> recoil -> settle -> guard)."""
    pivot_x = body_anchor(base_blast, "attack_blast") * base_blast.shape[1] + 20.0
    padded = np.pad(base_blast, ((14, 14), (20, 20), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    pivot_y = h * 0.55
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx0 = xx - pivot_x
    dy0 = yy - pivot_y
    w_muzzle = _smoothstep(pivot_x + 12.0, pivot_x + 42.0, xx)

    def mk_pose(ang_deg: float, shift_x: float, sx_sc: float, muzzle_sc: float) -> np.ndarray:
        th = math.radians(ang_deg)
        c, s = math.cos(th), math.sin(th)
        loc_sc = sx_sc + (muzzle_sc - 1.0) * w_muzzle
        lx = (dx0 - shift_x) / loc_sc
        ly = dy0 / (1.0 + (muzzle_sc - 1.0) * 0.5 * w_muzzle)
        return _bilinear_warp(padded, pivot_x + lx * c + ly * s, pivot_y - lx * s + ly * c, alpha_thresh=0.0)

    frames = [
        mk_pose(-3.5, -2.5, 0.96, 0.94),
        mk_pose(-1.5, -1.0, 0.98, 0.98),
        mk_pose(+1.0, +1.0, 1.00, 1.03),
        mk_pose(+3.5, +3.0, 1.00, 1.06),
        mk_pose(-2.0, +0.5, 1.00, 1.09),
        mk_pose(-6.5, -2.5, 1.00, 1.04),
        mk_pose(-3.5, -1.0, 1.00, 1.01),
        mk_pose(-0.8, 0.0, 1.00, 1.00),
    ]
    return _crop_union_frames(frames, pivot_x, pad=2)


def synthesize_hero_ult8(base_slash: np.ndarray) -> tuple[list[np.ndarray], float]:
    """Synthesize 8-frame dramatic ultimate surge sequence (crouch -> gather -> rise -> surge -> apex -> shockwave -> land -> settle)."""
    pivot_x = body_anchor(base_slash, "attack_slash") * base_slash.shape[1] + 24.0
    padded = np.pad(base_slash, ((24, 24), (24, 24), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    pivot_y = h * 0.56
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx0 = xx - pivot_x
    dy0 = yy - pivot_y
    w_front = _smoothstep(pivot_x - 10.0, pivot_x + 30.0, xx)

    def mk_pose(ang_deg: float, shift_x: float, shift_y: float, sy_sc: float, punch_sc: float) -> np.ndarray:
        th = math.radians(ang_deg)
        c, s = math.cos(th), math.sin(th)
        sc = 1.0 + (punch_sc - 1.0) * w_front
        lx = (dx0 - shift_x) / sc
        ly = (dy0 - shift_y) / (sy_sc * sc)
        return _bilinear_warp(padded, pivot_x + lx * c + ly * s, pivot_y - lx * s + ly * c, alpha_thresh=0.0)

    frames = [
        mk_pose(-4.0, -3.0, +6.0, 0.92, 0.98),
        mk_pose(-6.5, -1.5, +2.0, 0.96, 1.00),
        mk_pose(-9.0, +1.0, -5.0, 1.03, 1.02),
        mk_pose(-4.0, +3.5, -7.0, 1.05, 1.05),
        mk_pose(+6.5, +5.5, -2.0, 1.02, 1.08),
        mk_pose(+8.5, +4.0, +1.0, 0.99, 1.05),
        mk_pose(+3.5, +2.0, +2.0, 0.98, 1.02),
        mk_pose(+0.5, 0.0, 0.0, 1.00, 1.00),
    ]
    return _crop_union_frames(frames, pivot_x, pad=2)


def synthesize_hero_hurt4(base_hurt: np.ndarray) -> tuple[list[np.ndarray], float]:
    """Synthesize 4-frame hit recoil cycle (impact snap -> stagger lean -> knee brace -> recover)."""
    pivot_x = body_anchor(base_hurt, "hit_reaction") * base_hurt.shape[1] + 14.0
    padded = np.pad(base_hurt, ((14, 14), (14, 14), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    pivot_y = h * 0.72
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx0 = xx - pivot_x
    dy0 = yy - pivot_y
    specs = [(-10.0, -4.0, -2.0, 1.03), (-7.0, -2.0, +2.0, 0.97), (-3.5, -1.0, +4.0, 0.95), (-1.0, 0.0, +1.0, 0.99)]
    frames: list[np.ndarray] = []
    for ang, shx, shy, sy_sc in specs:
        th = math.radians(ang)
        c, s = math.cos(th), math.sin(th)
        lx = dx0 - shx
        ly = (dy0 - shy) / sy_sc
        frames.append(_bilinear_warp(padded, pivot_x + lx * c + ly * s, pivot_y - lx * s + ly * c, alpha_thresh=0.0))
    return _crop_union_frames(frames, pivot_x, pad=2)


def synthesize_enemy_run12(base: np.ndarray, kind: str) -> list[np.ndarray]:
    """Synthesize a smooth 12-frame high-res walk cycle from an enemy's main portrait."""
    padded = np.pad(base, ((8, 8), (8, 8), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = w * 0.5
    frames: list[np.ndarray] = []

    for k in range(12):
        ph = k * (math.pi / 6.0)
        s = math.sin(ph)
        c = math.cos(ph)

        if kind == "crawler":
            w_leg = _smoothstep(h * 0.45, h * 0.62, yy)
            w_a = 0.5 + 0.5 * np.cos((xx - cx) / (w * 0.14) * math.pi)
            lift_a = max(0.0, s)
            lift_b = max(0.0, -s)
            dy = -(w_a * lift_a + (1.0 - w_a) * lift_b) * (h * 0.088) * w_leg + abs(s) * (h * 0.022) * (1.0 - w_leg)
            dx = (w_a * c - (1.0 - w_a) * c) * (w * 0.04) * w_leg
        else:
            w_leg = _smoothstep(h * 0.56, h * 0.70, yy)
            w_left = _smoothstep(cx + w * 0.08, cx - w * 0.08, xx)
            w_right = 1.0 - w_left

            in_leg_corridor = np.maximum(
                _smoothstep(w * 0.36, w * 0.25, np.abs(xx - cx)), _smoothstep(h * 0.74, h * 0.82, yy)
            )
            w_leg = w_leg * in_leg_corridor

            lift_l = max(0.0, s) * (h * 0.088)
            lift_r = max(0.0, -s) * (h * 0.088)
            stride_l = c * (w * 0.044)
            stride_r = -c * (w * 0.044)

            leg_dy = -(w_left * lift_l + w_right * lift_r) * w_leg
            leg_dx = (w_left * stride_l + w_right * stride_r) * w_leg

            w_arm = _smoothstep(w * 0.16, w * 0.28, np.abs(xx - cx)) * (1.0 - _smoothstep(h * 0.65, h * 0.80, yy))
            arm_sign = np.where(xx < cx, -1.0, 1.0)
            arm_dy = arm_sign * s * (h * 0.04) * w_arm
            arm_dx = -arm_sign * c * (w * 0.026) * w_arm

            body_bob = -abs(s) * (h * 0.024) * (1.0 - w_leg)
            dy = leg_dy + arm_dy + body_bob
            dx = leg_dx + arm_dx

        frames.append(_bilinear_warp(padded, xx - dx, yy - dy, alpha_thresh=100.0))
    return frames


def synthesize_enemy_idle6(base: np.ndarray, kind: str) -> list[np.ndarray]:
    """Synthesize 6 smooth breathing or hover-float idle frames for enemies & bosses."""
    padded = np.pad(base, ((8, 8), (8, 8), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = w * 0.5
    frames: list[np.ndarray] = []
    w_up = 1.0 - _smoothstep(h * 0.52, h * 0.72, yy)
    w_arm = _smoothstep(w * 0.16, w * 0.30, np.abs(xx - cx)) * w_up

    for k in range(6):
        ph = k * (math.pi / 3.0)
        s = math.sin(ph)
        c = math.cos(ph)
        if kind == "hunter":
            dy = s * (h * 0.032) + c * (h * 0.014) * _smoothstep(w * 0.18, w * 0.36, np.abs(xx - cx))
            dx = c * (w * 0.012)
        else:
            dy = -s * (h * 0.018) * w_up + c * (h * 0.012) * w_arm
            dx = c * (w * 0.008) * w_up + s * (w * 0.008) * w_arm
        frames.append(_bilinear_warp(padded, xx - dx, yy - dy, alpha_thresh=0.0))
    return frames


def synthesize_enemy_attack4(base: np.ndarray, face_dir: int = 1) -> tuple[list[np.ndarray], float]:
    """Synthesize 4-frame enemy/boss strike cycle (windup -> lunge -> impact -> recover) in union bbox."""
    pivot_x = foot_anchor(base) * base.shape[1] + 16.0
    padded = np.pad(base, ((14, 14), (16, 16), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    pivot_y = h * 0.65
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx0 = xx - pivot_x
    dy0 = yy - pivot_y
    f = float(face_dir)
    specs = [
        (-8.0 * f, -5.0 * f, +3.0, 0.96, 0.96),
        (+4.5 * f, +3.0 * f, -2.0, 1.02, 1.02),
        (+9.5 * f, +7.0 * f, 0.0, 1.05, 1.06),
        (+3.0 * f, +2.0 * f, +1.5, 0.99, 1.01),
    ]
    frames: list[np.ndarray] = []
    for ang, shx, shy, sx_sc, sy_sc in specs:
        th = math.radians(ang)
        c, s = math.cos(th), math.sin(th)
        lx = (dx0 - shx) / sx_sc
        ly = (dy0 - shy) / sy_sc
        frames.append(_bilinear_warp(padded, pivot_x + lx * c + ly * s, pivot_y - lx * s + ly * c, alpha_thresh=0.0))
    return _crop_union_frames(frames, pivot_x, pad=2)


def _crop_union_frames(frames: list[np.ndarray], pivot_x: float, pad: int = 2) -> tuple[list[np.ndarray], float]:
    """Crop all frames in a cycle to their shared union bbox so w, h, ground line, and torso ax never jitter."""
    h, w = frames[0].shape[:2]
    union = np.zeros((h, w), dtype=bool)
    for fr in frames:
        union |= fr[..., 3] > 8
    ys, xs = np.nonzero(union)
    if ys.size == 0:
        return frames, 0.5
    uy0 = max(0, int(ys.min()) - pad)
    uy1 = min(h, int(ys.max()) + 1 + pad)
    ux0 = max(0, int(xs.min()) - pad)
    ux1 = min(w, int(xs.max()) + 1 + pad)
    cropped = [fr[uy0:uy1, ux0:ux1].copy() for fr in frames]
    ax = float((pivot_x - ux0) / max(1, ux1 - ux0))
    return cropped, ax


def _to_luminous_tintable(rgba: np.ndarray) -> np.ndarray:
    """Desaturate colored energy FX into high-luminance white/silver so setTint() recolors any element cleanly."""
    out = rgba.copy().astype(np.float32)
    rgb = out[..., :3]
    mx = rgb.max(axis=2)
    lum = rgb.mean(axis=2)
    tone = np.clip(mx * 0.72 + lum * 0.42, 0.0, 255.0)
    mask = out[..., 3] > 0
    for c in range(3):
        out[..., c] = np.where(mask, tone, 0.0)
    return out.astype(rgba.dtype)


def _dark_bg_to_alpha(
    rgb_patch: np.ndarray, bg_rgb: np.ndarray | None = None, scale_h: int = 180, tintable: bool = False
) -> np.ndarray:
    """Convert dark-panel additive VFX artwork into crisp unpremultiplied RGBA."""
    rgb = rgb_patch[..., :3].astype(np.float32)
    if bg_rgb is None:
        bg_rgb = np.median(np.vstack([rgb[:3, :].reshape(-1, 3), rgb[-3:, :].reshape(-1, 3)]), axis=0)
    delta = np.maximum(rgb - bg_rgb[None, None, :], 0.0)
    dmax = delta.max(axis=2)
    alpha = np.where(dmax <= 11.0, 0.0, np.clip((dmax - 11.0) / 135.0, 0.0, 1.0) ** 0.84 * 255.0)
    # Feather 2px outer patch edges so adjacent icons on strips never bleed
    alpha[:2, :] *= 0.25
    alpha[-2:, :] *= 0.25
    alpha[:, :2] *= 0.25
    alpha[:, -2:] *= 0.25
    gain = np.where(dmax > 11.0, np.clip(220.0 / np.maximum(dmax, 36.0), 1.0, 2.2), 0.0)
    rgb_clean = np.clip(delta * gain[..., None], 0.0, 255.0)
    rgba = np.dstack([rgb_clean, alpha]).clip(0, 255).astype(np.uint8)
    trimmed = trim(rgba.astype(np.int16), pad=2).clip(0, 255).astype(np.uint8)
    if scale_h and trimmed.shape[0] > 0:
        im = Image.fromarray(trimmed, "RGBA")
        nw = max(4, round(im.width * scale_h / im.height))
        im = im.resize((nw, scale_h), Image.Resampling.LANCZOS)
        out = np.array(im, dtype=np.int16)
    else:
        out = trimmed.astype(np.int16)
    return _to_luminous_tintable(out) if tintable else out


def _fit_union_canvas(cells: list[np.ndarray], target_w: int, target_h: int) -> list[np.ndarray]:
    """Center variable-sized cleaned VFX sprites on one shared transparent canvas."""
    out: list[np.ndarray] = []
    for c in cells:
        im = Image.fromarray(c.clip(0, 255).astype(np.uint8), "RGBA")
        scale = min((target_w - 8) / max(1, im.width), (target_h - 8) / max(1, im.height))
        nw, nh = max(4, round(im.width * scale)), max(4, round(im.height * scale))
        im = im.resize((nw, nh), Image.Resampling.LANCZOS)
        can = np.zeros((target_h, target_w, 4), dtype=np.int16)
        x0 = (target_w - nw) // 2
        y0 = (target_h - nh) // 2
        can[y0 : y0 + nh, x0 : x0 + nw] = np.array(im, dtype=np.int16)
        out.append(can)
    return out


def _anim_variants_8(base: np.ndarray, mode: str) -> list[np.ndarray]:
    """Synthesize 8 smooth looping progression frames from one high-res VFX artwork."""
    padded = np.pad(base, ((16, 16), (16, 16), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    cx, cy = w * 0.5, h * 0.5
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx0, dy0 = xx - cx, yy - cy
    r_norm = np.hypot(dx0, dy0) / max(1.0, min(w, h) * 0.45)

    frames: list[np.ndarray] = []
    for k in range(8):
        ph = k * (math.pi / 4.0)
        s = math.sin(ph)
        c = math.cos(ph)
        if mode == "surge":
            wave_y = s * 4.5 + np.sin(yy * 0.08 - k * 0.72) * 3.5 * np.clip(r_norm, 0.2, 1.0)
            wave_x = np.cos(yy * 0.09 + ph) * 3.6 * _smoothstep(0.15, 0.85, r_norm)
            sc = 1.0 + c * 0.035
            sx = cx + dx0 / sc - wave_x
            sy = cy + dy0 / (sc + 0.02 * s) - wave_y
        elif mode == "spin":
            ang = 0.16 * s + 0.28 * c * np.clip(1.0 - r_norm * 0.5, 0.2, 1.0)
            ca, sa = np.cos(ang), np.sin(ang)
            sc = 1.0 + 0.045 * s
            sx = cx + (dx0 * ca + dy0 * sa) / sc
            sy = cy + (-dx0 * sa + dy0 * ca) / sc
        elif mode == "burst":
            sc = 0.84 + k * 0.045
            swirl = (k - 3.5) * 0.055 * _smoothstep(0.2, 1.0, r_norm)
            ca, sa = np.cos(swirl), np.sin(swirl)
            sx = cx + (dx0 * ca + dy0 * sa) / sc
            sy = cy + (-dx0 * sa + dy0 * ca) / sc
        else:  # crackle
            wig = np.sin(yy * 0.14 + ph * 1.3) * 4.0 + np.cos(xx * 0.12 - ph) * 2.4
            sc = 1.0 + 0.04 * s
            sx = cx + dx0 / sc - wig * 0.65
            sy = cy + dy0 / sc - np.cos(yy * 0.11 + ph) * 3.0
        frames.append(_bilinear_warp(padded, sx, sy, alpha_thresh=0.0))
    cropped, _ = _crop_union_frames(frames, cx, pad=2)
    return cropped


def _save_fx_cycle(manifest: dict[str, dict], name_prefix: str, frames: list[np.ndarray]) -> None:
    for idx, fr in enumerate(frames, 1):
        key = f"{name_prefix}_{idx}"
        entry = save(fr, key)
        entry["ax"] = 0.5
        manifest[key] = entry


def _paint_earth_spires() -> list[np.ndarray]:
    """Paint 8 multi-faceted volcanic basalt spire monolith frames with branching magma cracks & debris."""
    sz = 208
    frames: list[np.ndarray] = []
    rise_curve = [0.46, 0.72, 0.92, 1.0, 0.97, 0.90, 0.76, 0.56]
    spires = [
        (sz * 0.25, 96, -18, 26, -1),
        (sz * 0.50, 152, 2, 34, 0),
        (sz * 0.75, 108, 18, 28, +1),
    ]
    for k in range(8):
        rise = rise_curve[k]
        base_y = sz - 18
        glow = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse((24, base_y - 36, sz - 24, base_y + 14), fill=(255, 120, 22, 145))
        gd.ellipse((sz * 0.30, base_y - int(130 * rise), sz * 0.70, base_y), fill=(255, 170, 50, 95))
        im = glow.filter(ImageFilter.GaussianBlur(10))

        vein_glow = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
        vd = ImageDraw.Draw(vein_glow)
        d = ImageDraw.Draw(im)

        for sx_c, h_max, lean, hw, side_idx in spires:
            h_sp = h_max * rise
            tip_x = sx_c + lean
            tip_y = base_y - h_sp
            # Jagged craggy rock silhouette (8 vertices, never flat single triangles)
            poly_full = [
                (sx_c - hw * 1.05, base_y),
                (sx_c - hw * 0.88, base_y - h_sp * 0.34),
                (sx_c - hw * 0.52, base_y - h_sp * 0.58),
                (tip_x - hw * 0.24, tip_y + h_sp * 0.22),
                (tip_x, tip_y),
                (tip_x + hw * 0.28, tip_y + h_sp * 0.26),
                (sx_c + hw * 0.62, base_y - h_sp * 0.48),
                (sx_c + hw * 0.96, base_y),
            ]
            d.polygon(poly_full, fill=(32, 24, 22, 252))
            # Mid basalt chisel plane
            poly_mid = [
                (sx_c - hw * 0.22, base_y),
                (sx_c - hw * 0.34, base_y - h_sp * 0.50),
                (tip_x, tip_y),
                (tip_x + hw * 0.28, tip_y + h_sp * 0.26),
                (sx_c + hw * 0.56, base_y - h_sp * 0.44),
                (sx_c + hw * 0.84, base_y),
            ]
            d.polygon(poly_mid, fill=(68, 50, 38, 250))
            # Lit ochre right bevel facet + specular edge
            poly_lit = [
                (sx_c + hw * 0.08, base_y),
                (sx_c + hw * 0.02, base_y - h_sp * 0.48),
                (tip_x, tip_y),
                (tip_x + hw * 0.26, tip_y + h_sp * 0.28),
                (sx_c + hw * 0.62, base_y - h_sp * 0.44),
                (sx_c + hw * 0.88, base_y),
            ]
            d.polygon(poly_lit, fill=(128, 92, 54, 248))
            d.line([(tip_x, tip_y), (tip_x + hw * 0.26, tip_y + h_sp * 0.28), (sx_c + hw * 0.86, base_y)], fill=(204, 152, 86, 225), width=2)

            # Branching molten magma cracks recorded into both glow overlay & sharp gold core
            cracks = [
                [(sx_c - hw * 0.14, base_y - 3), (sx_c - hw * 0.24, base_y - h_sp * 0.34), (tip_x + 2, base_y - h_sp * 0.64), (tip_x - 2, tip_y + h_sp * 0.16)],
                [(sx_c - hw * 0.24, base_y - h_sp * 0.34), (sx_c + hw * 0.32, base_y - h_sp * 0.20), (sx_c + hw * 0.48, base_y - 5)],
                [(tip_x + 2, base_y - h_sp * 0.64), (sx_c + hw * 0.36, base_y - h_sp * 0.42)],
            ]
            for path_pts in cracks:
                vd.line(path_pts, fill=(255, 138, 25, 225), width=7)
                d.line(path_pts, fill=(255, 198, 65, 255), width=3)
                d.line(path_pts, fill=(255, 246, 185, 245), width=1)

        im = Image.alpha_composite(im, vein_glow.filter(ImageFilter.GaussianBlur(3)))
        d = ImageDraw.Draw(im)
        # Re-stroke bright molten center filaments & floating volcanic chips
        for sx_c, h_max, lean, hw, _ in spires:
            h_sp = h_max * rise
            tip_x, tip_y = sx_c + lean, base_y - h_sp
            d.line([(sx_c - hw * 0.14, base_y - 3), (sx_c - hw * 0.24, base_y - h_sp * 0.34), (tip_x + 2, base_y - h_sp * 0.64)], fill=(255, 242, 165, 240), width=2)

        for m in range(7):
            ph = k * 0.78 + m * 1.15
            px = sz * (0.18 + 0.105 * m) + math.sin(ph) * 11
            py = base_y - (32 + ((m * 31 + k * 21) % 128))
            if m % 2 == 0:
                d.polygon([(px - 4, py), (px - 1, py - 5), (px + 4, py - 2), (px + 2, py + 4)], fill=(58, 44, 36, 240), outline=(255, 185, 65, 220))
            else:
                d.polygon([(px, py - 5), (px + 3.5, py), (px, py + 5), (px - 3.5, py)], fill=(255, 224, 110, 240))
        frames.append(np.array(im, dtype=np.int16))
    return frames


def _paint_ice_monoliths() -> list[np.ndarray]:
    """Paint 8 multi-shaft beveled glacier crystal monolith frames with refracted sapphire/cyan facets."""
    sz = 208
    frames: list[np.ndarray] = []
    for k in range(8):
        base_y = sz - 16
        pulse = 0.78 + 0.22 * math.sin((k / 7.0) * math.pi * 0.85 + 0.25)
        glow = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse((32, base_y - 44, sz - 32, base_y + 12), fill=(56, 189, 248, 135))
        gd.polygon([(sz * 0.34, base_y), (sz * 0.50, 18), (sz * 0.66, base_y)], fill=(125, 211, 252, 105))
        im = glow.filter(ImageFilter.GaussianBlur(10))
        d = ImageDraw.Draw(im)

        sh = int(156 * pulse)
        # 5 beveled prism crystal shafts (outer L/R flanking shards, mid L/R crystals, tall center spear)
        prisms = [
            (sz * 0.20, int(sh * 0.42), -14, 15),
            (sz * 0.80, int(sh * 0.46), +14, 15),
            (sz * 0.34, int(sh * 0.68), -8, 20),
            (sz * 0.66, int(sh * 0.72), +9, 20),
            (sz * 0.50, sh, 0, 28),
        ]
        for cx_p, hp, tilt, hw in prisms:
            tx = cx_p + tilt
            ty = base_y - hp
            sh_y = ty + hp * 0.32
            # Left shadow sapphire facet
            d.polygon([(cx_p - hw, base_y), (cx_p - hw * 0.82, sh_y), (tx, ty), (cx_p, base_y)], fill=(14, 96, 174, 228))
            # Center azure bevel
            d.polygon([(cx_p - hw * 0.30, base_y), (cx_p - hw * 0.35, sh_y + 6), (tx, ty), (cx_p + hw * 0.16, base_y)], fill=(56, 189, 248, 238))
            # Right icy cyan-white specular facet
            d.polygon([(cx_p + hw * 0.08, base_y), (tx, ty), (cx_p + hw * 0.82, sh_y + 4), (cx_p + hw, base_y)], fill=(214, 248, 255, 245))
            # Specular crystal ridge highlights & internal ice fracture
            d.line([(cx_p - hw * 0.82, sh_y), (tx, ty), (cx_p + hw * 0.82, sh_y + 4)], fill=(255, 255, 255, 248), width=2)
            d.line([(tx, ty), (cx_p + hw * 0.08, base_y - 3)], fill=(255, 255, 255, 250), width=2)
            d.line([(cx_p - hw * 0.42, base_y - hp * 0.36), (cx_p + hw * 0.35, base_y - hp * 0.24)], fill=(255, 255, 255, 190), width=1)

        for m in range(8):
            a = k * 0.52 + m * 0.785
            sx = sz * 0.5 + math.cos(a) * (42 + (m % 3) * 14)
            sy = sz * 0.50 + math.sin(a) * 52
            d.polygon([(sx, sy - 6), (sx + 3.5, sy), (sx, sy + 6), (sx - 3.5, sy)], fill=(240, 253, 255, 235))
        frames.append(np.array(im, dtype=np.int16))
    return frames


def _paint_cryo_blizzard() -> list[np.ndarray]:
    """Paint 8 swirling curved frost-ribbon & beveled snowflake mandala frames."""
    sz = 208
    frames: list[np.ndarray] = []
    cx = cy = sz * 0.5
    for k in range(8):
        rot = k * (math.pi / 24.0)
        glow = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse((20, 20, sz - 20, sz - 20), outline=(56, 189, 248, 145), width=14)
        gd.ellipse((48, 48, sz - 48, sz - 48), fill=(186, 230, 253, 95))
        im = glow.filter(ImageFilter.GaussianBlur(9))
        d = ImageDraw.Draw(im)

        # 4 swirling tapered logarithmic wind ribbons curving cleanly around the vortex
        for arm in range(4):
            a0 = rot * 2.0 + arm * (math.pi * 0.5)
            pts_out, pts_in = [], []
            for st in range(13):
                t = st / 12.0
                th = a0 + t * 1.95
                r_mid = 34.0 + t * 58.0
                thick = math.sin(t * math.pi) * 6.5 + 1.5
                pts_out.append((cx + math.cos(th) * (r_mid + thick), cy + math.sin(th) * (r_mid + thick)))
                pts_in.append((cx + math.cos(th) * (r_mid - thick), cy + math.sin(th) * (r_mid - thick)))
            d.polygon(pts_out + list(reversed(pts_in)), fill=(125, 211, 252, 205))

        d.ellipse((18, 18, sz - 18, sz - 18), outline=(186, 230, 253, 210), width=2)
        for i in range(6):
            a = rot + (i * math.pi) / 3.0
            ca, sa = math.cos(a), math.sin(a)
            px_perp, py_perp = -sa, ca
            x2, y2 = cx + ca * 84, cy + sa * 84
            # Beveled kite crystal arm
            d.polygon(
                [
                    (cx + ca * 14, cy + sa * 14),
                    (cx + ca * 48 + px_perp * 6, cy + sa * 48 + py_perp * 6),
                    (x2, y2),
                    (cx + ca * 48 - px_perp * 6, cy + sa * 48 - py_perp * 6),
                ],
                fill=(224, 248, 255, 235),
                outline=(125, 211, 252, 245),
            )
            for frac, arm_len in ((0.50, 17), (0.74, 12)):
                bx, by = cx + ca * (84 * frac), cy + sa * (84 * frac)
                for side in (-0.62, 0.62):
                    d.line([(bx, by), (bx + math.cos(a + side) * arm_len, by + math.sin(a + side) * arm_len)], fill=(255, 255, 255, 235), width=2)
        for m in range(8):
            ma = k * 0.4 + m * 0.785
            mx = cx + math.cos(ma) * (66 + (m % 2) * 16)
            my = cy + math.sin(ma) * (66 + (m % 2) * 16)
            d.ellipse((mx - 3, my - 3, mx + 3, my + 3), fill=(255, 255, 255, 230))
        frames.append(np.array(im, dtype=np.int16))
    return frames


def _paint_void_orbs() -> list[np.ndarray]:
    """Paint 8 black-hole singularity core frames with spiral accretion arms, lensing rim & wisps."""
    sz = 196
    frames: list[np.ndarray] = []
    cx = cy = sz * 0.5
    for k in range(8):
        ph = k * (math.pi / 4.0)
        glow = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse((12, sz * 0.32, sz - 12, sz * 0.68), fill=(192, 38, 211, 155))
        gd.ellipse((38, 38, sz - 38, sz - 38), fill=(147, 51, 234, 140))
        im = glow.filter(ImageFilter.GaussianBlur(10))
        d = ImageDraw.Draw(im)

        # Twin spiral accretion arms curling into the event horizon
        for arm in range(2):
            a0 = ph + arm * math.pi
            outer, inner = [], []
            for st in range(15):
                t = st / 14.0
                th = a0 + t * 2.5
                rx = 84.0 * (1.0 - t * 0.62)
                ry = rx * 0.34
                w_arm = math.sin(t * math.pi) * 5.0 + 1.2
                ox = cx + math.cos(th) * rx
                oy = cy + math.sin(th) * ry
                outer.append((ox, oy - w_arm))
                inner.append((ox, oy + w_arm))
            d.polygon(outer + list(reversed(inner)), fill=(217, 70, 239, 195))

        tilt = math.sin(ph) * 2.5
        d.ellipse((16, sz * 0.36 + tilt, sz - 16, sz * 0.64 + tilt), outline=(232, 121, 249, 235), width=3)
        d.ellipse((28, sz * 0.40 - tilt, sz - 28, sz * 0.60 - tilt), outline=(253, 244, 255, 220), width=2)
        # Pitch-black event horizon + double photon ring
        d.ellipse((cx - 32, cy - 32, cx + 32, cy + 32), fill=(5, 1, 15, 255), outline=(255, 255, 255, 255), width=3)
        d.ellipse((cx - 37, cy - 37, cx + 37, cy + 37), outline=(217, 70, 239, 235), width=2)
        for i in range(6):
            a = ph + i * (math.pi / 3.0)
            r_x = 64 + (i % 2) * 12
            ox = cx + math.cos(a) * r_x
            oy = cy + math.sin(a) * (r_x * 0.34)
            rr = 3.5 + (i % 2) * 1.5
            d.ellipse((ox - rr, oy - rr, ox + rr, oy + rr), fill=(255, 255, 255, 245), outline=(217, 70, 239, 250), width=1)
        frames.append(np.array(im, dtype=np.int16))
    return frames


def _paint_void_rifts() -> list[np.ndarray]:
    """Paint 8 jagged curved dimensional fracture tear frames with starlit inner slit & shattered shards."""
    sz = 216
    frames: list[np.ndarray] = []
    cx = cy = sz * 0.5

    def curved_tear_poly(ang: float, sc: float, jag_seed: float) -> list[tuple[float, float]]:
        ca, sa = math.cos(ang), math.sin(ang)
        nx, ny = -sa, ca
        top_pts, bot_pts = [], []
        half_len = 94.0 * sc
        for st in range(13):
            u = (st / 12.0) * 2.0 - 1.0  # -1 .. +1
            along = u * half_len
            bend = math.sin(u * math.pi * 0.85) * 9.0 + math.sin(u * 6.5 + jag_seed) * 3.5
            hw = max(0.8, (1.0 - u * u) ** 0.75 * 14.0 + math.cos(u * 9.0 + jag_seed) * 1.8)
            mx = cx + ca * along + nx * bend
            my = cy + sa * along + ny * bend
            top_pts.append((mx + nx * hw, my + ny * hw))
            bot_pts.append((mx - nx * hw, my - ny * hw))
        return top_pts + list(reversed(bot_pts))

    for k in range(8):
        ph = k * (math.pi / 4.0)
        sc = 0.80 + 0.20 * math.sin(k * math.pi / 7.0 + 0.35)
        p_a = curved_tear_poly(math.pi * 0.24, sc, ph)
        p_b = curved_tear_poly(-math.pi * 0.24, sc, ph + 1.7)

        glow = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.polygon(p_a, fill=(217, 70, 239, 175))
        gd.polygon(p_b, fill=(192, 38, 211, 175))
        im = glow.filter(ImageFilter.GaussianBlur(10))
        d = ImageDraw.Draw(im)

        # Luminous magenta-white energy tear hulls + dark cosmic interior void
        for poly in (p_a, p_b):
            d.polygon(poly, fill=(232, 121, 249, 240), outline=(255, 255, 255, 250))
        # Inner black void diamond slit studded with starlight specks
        slit = [
            (cx - 24 * sc, cy),
            (cx - 8, cy - 12),
            (cx, cy - 36 * sc),
            (cx + 8, cy - 12),
            (cx + 24 * sc, cy),
            (cx + 8, cy + 12),
            (cx, cy + 36 * sc),
            (cx - 8, cy + 12),
        ]
        d.polygon(slit, fill=(7, 2, 18, 252), outline=(253, 244, 255, 255))
        for st_i in range(6):
            sa = st_i * 1.05 + k * 0.3
            sx = cx + math.cos(sa) * (6 + (st_i % 3) * 4)
            sy = cy + math.sin(sa) * (10 + (st_i % 2) * 8)
            d.ellipse((sx - 1.2, sy - 1.2, sx + 1.2, sy + 1.2), fill=(255, 255, 255, 240))

        # Jagged amethyst crackle arcs & floating space-mirror shards
        for j in range(6):
            a = ph * 0.5 + j * (math.pi / 3.0)
            r1 = 22.0
            r2 = 46.0 + (j % 2) * 14.0
            r3 = 68.0 + (j % 3) * 10.0
            d.line(
                [
                    (cx + math.cos(a) * r1, cy + math.sin(a) * r1),
                    (cx + math.cos(a + 0.18) * r2, cy + math.sin(a + 0.18) * r2),
                    (cx + math.cos(a - 0.08) * r3, cy + math.sin(a - 0.08) * r3),
                ],
                fill=(245, 208, 254, 235),
                width=2,
            )
            sx = cx + math.cos(a + 0.3) * (54 + (j % 2) * 18)
            sy = cy + math.sin(a + 0.3) * (54 + (j % 2) * 18)
            d.polygon([(sx, sy - 5), (sx + 4, sy), (sx - 1, sy + 6), (sx - 4, sy - 1)], fill=(36, 10, 66, 235), outline=(240, 171, 252, 245))
        frames.append(np.array(im, dtype=np.int16))
    return frames


def build_skill_vfx(manifest: dict[str, dict]) -> None:
    """Extract & synthesize 8-frame animated skill VFX sets into sprites.json."""
    # 1. Animated Slash Sequence (fx_slash_anim_1..8)
    slash_sheet = load("effects/slash_effects_sheet.png")
    s1 = _to_luminous_tintable(trim(slash_sheet[0:124, 6:175, :], pad=2)[:, ::-1, :])
    s2 = _to_luminous_tintable(trim(slash_sheet[0:124, 160:332, :], pad=2))
    s3 = _to_luminous_tintable(trim(slash_sheet[0:152, 356:450, :], pad=2))
    s4 = _to_luminous_tintable(trim(slash_sheet[124:165, 6:248, :], pad=2))
    for s in (s1, s2, s3, s4):
        defringe(s)
    slash_base = _fit_union_canvas([s1, s2, s3, s4], 184, 164)
    s0_v = _anim_variants_8(slash_base[0], "surge")
    s1_v = _anim_variants_8(slash_base[1], "surge")
    s2_v = _anim_variants_8(slash_base[2], "surge")
    s3_v = _anim_variants_8(slash_base[3], "surge")
    _save_fx_cycle(manifest, "fx_slash_anim", _fit_union_canvas([s0_v[0], s0_v[2], s1_v[0], s1_v[2], s2_v[0], s2_v[2], s3_v[0], s3_v[2]], 184, 164))

    # 2. Animated Energy Blast Sequence (fx_blast_anim_1..8, facing RIGHT +1)
    blast_sheet = load("effects/energy_blasts_sheet.png")
    b_raw = [
        trim(blast_sheet[8:145, 0:60, :], pad=2)[:, ::-1, :],
        trim(blast_sheet[8:145, 74:146, :], pad=2)[:, ::-1, :],
        trim(blast_sheet[8:145, 160:264, :], pad=2)[:, ::-1, :],
        trim(blast_sheet[8:145, 272:500, :], pad=2)[:, ::-1, :],
    ]
    b_norm = [_to_luminous_tintable(b) for b in b_raw]
    for b in b_norm:
        defringe(b)
    b_fitted = _fit_union_canvas(b_norm, 220, 148)
    b_s1 = _anim_variants_8(b_fitted[1], "surge")
    b_s2 = _anim_variants_8(b_fitted[2], "surge")
    b_s3 = _anim_variants_8(b_fitted[3], "surge")
    _save_fx_cycle(manifest, "fx_blast_anim", _fit_union_canvas([b_fitted[0], b_s1[0], b_s1[2], b_s2[0], b_s2[2], b_s3[0], b_s3[2], b_s3[5]], 220, 148))

    # 3. Animated Explosions (fx_boom_fire_1..8 & fx_boom_energy_1..8)
    exp_sheet = load("effects/explosions_sheet.png")
    ex_fire_1 = trim(exp_sheet[22:155, 94:188, :], pad=2)
    ex_fire_2 = trim(exp_sheet[20:155, 194:324, :], pad=2)
    fire_fit = _fit_union_canvas([ex_fire_1, ex_fire_2], 196, 176)
    fb_a = _anim_variants_8(fire_fit[0], "burst")
    fb_b = _anim_variants_8(fire_fit[1], "burst")
    _save_fx_cycle(manifest, "fx_boom_fire", _fit_union_canvas([fb_a[0], fb_a[2], fb_a[4], fb_b[1], fb_b[3], fb_b[5], fb_b[6], fb_b[7]], 196, 176))

    ex_ice_1 = _to_luminous_tintable(trim(exp_sheet[22:155, 6:80, :], pad=2))
    ex_ice_2 = _to_luminous_tintable(trim(exp_sheet[20:155, 329:485, :], pad=2))
    ice_fit = _fit_union_canvas([ex_ice_1, ex_ice_2], 196, 176)
    ib_a = _anim_variants_8(ice_fit[0], "burst")
    ib_b = _anim_variants_8(ice_fit[1], "burst")
    _save_fx_cycle(manifest, "fx_boom_energy", _fit_union_canvas([ib_a[0], ib_a[2], ib_a[4], ib_b[1], ib_b[3], ib_b[5], ib_b[6], ib_b[7]], 196, 176))

    # 4. Hit Spark Bursts (fx_hit_1..8, tintable)
    hit_sheet = load("effects/hit_sparks_sheet.png")
    h_raw = [
        _to_luminous_tintable(trim(hit_sheet[22:145, 0:64, :], pad=2)),
        _to_luminous_tintable(trim(hit_sheet[22:145, 72:154, :], pad=2)),
        _to_luminous_tintable(trim(hit_sheet[22:145, 158:228, :], pad=2)),
        _to_luminous_tintable(trim(hit_sheet[22:145, 234:352, :], pad=2)),
    ]
    for hc in h_raw:
        defringe(hc)
    h_fit = _fit_union_canvas(h_raw, 136, 136)
    _save_fx_cycle(
        manifest,
        "fx_hit",
        _fit_union_canvas(
            [
                h_fit[0],
                _anim_variants_8(h_fit[0], "burst")[3],
                h_fit[1],
                _anim_variants_8(h_fit[1], "burst")[3],
                h_fit[2],
                _anim_variants_8(h_fit[2], "burst")[3],
                h_fit[3],
                _anim_variants_8(h_fit[3], "burst")[5],
            ],
            136,
            136,
        ),
    )

    # 5. Per-Hero Painted Signature Effects (8 frames each)
    nb = load("detail/effects/nova_blade_effects.png")
    nb_bg = np.median(nb[:4, :4, :3], axis=(0, 1))
    _save_fx_cycle(manifest, "fx_nova_pillar", _anim_variants_8(_dark_bg_to_alpha(nb[0:84, 132:196, :], nb_bg, scale_h=200), "surge"))
    _save_fx_cycle(manifest, "fx_nova_vortex", _anim_variants_8(_dark_bg_to_alpha(nb[0:84, 196:272, :], nb_bg, scale_h=180), "spin"))

    cf = load("detail/effects/crimson_flare_effects.png")
    cf_bg = np.median(cf[:4, :4, :3], axis=(0, 1))
    _save_fx_cycle(manifest, "fx_meteor", _anim_variants_8(_dark_bg_to_alpha(cf[0:84, 4:74, :], cf_bg, scale_h=168), "surge"))
    _save_fx_cycle(manifest, "fx_fire_vortex", _anim_variants_8(_dark_bg_to_alpha(cf[0:84, 74:154, :], cf_bg, scale_h=180), "spin"))

    vs = load("detail/effects/volt_sentinel_effects.png")
    vs_bg = np.median(vs[:4, :4, :3], axis=(0, 1))
    vb1 = _dark_bg_to_alpha(vs[0:84, 0:65, :], vs_bg, scale_h=208)
    vb2 = _dark_bg_to_alpha(vs[0:84, 182:274, :], vs_bg, scale_h=208)
    vb_pair = _fit_union_canvas([vb1, vb2], 140, 208)
    vb_a = _anim_variants_8(vb_pair[0], "crackle")
    vb_b = _anim_variants_8(vb_pair[1], "crackle")
    _save_fx_cycle(manifest, "fx_volt_bolt", _fit_union_canvas([vb_a[0], vb_a[1], vb_a[2], vb_a[3], vb_b[0], vb_b[1], vb_b[2], vb_b[3]], 140, 208))
    _save_fx_cycle(manifest, "fx_volt_dome", _anim_variants_8(_dark_bg_to_alpha(vs[0:84, 68:180, :], vs_bg, scale_h=180), "crackle"))

    ep = load("detail/effects/emerald_phantom_effects.png")
    ep_bg = np.median(ep[:4, :4, :3], axis=(0, 1))
    tw1 = _dark_bg_to_alpha(ep[0:84, 4:88, :], ep_bg, scale_h=190)
    tw2 = _dark_bg_to_alpha(ep[0:84, 90:166, :], ep_bg, scale_h=190)
    tw_pair = _fit_union_canvas([tw1, tw2], 180, 190)
    tw_a = _anim_variants_8(tw_pair[0], "spin")
    tw_b = _anim_variants_8(tw_pair[1], "spin")
    _save_fx_cycle(manifest, "fx_wind_tornado", _fit_union_canvas([tw_a[0], tw_a[1], tw_a[2], tw_a[3], tw_b[0], tw_b[1], tw_b[2], tw_b[3]], 180, 190))

    ce = load("detail/effects/common_effects.png")
    ce_bg = np.median(ce[12:18, 2:8, :3], axis=(0, 1))
    gcrack = _dark_bg_to_alpha(ce[4:64, 728:846, :], ce_bg, scale_h=96, tintable=True)
    ce_entry = save(gcrack, "fx_ground_crack")
    ce_entry["ax"] = 0.5
    manifest["fx_ground_crack"] = ce_entry

    # 6. High-Res Procedural Element Signature Sets (8 frames each)
    _save_fx_cycle(manifest, "fx_earth_spire", _paint_earth_spires())
    _save_fx_cycle(manifest, "fx_ice_monolith", _paint_ice_monoliths())
    _save_fx_cycle(manifest, "fx_cryo_blizzard", _paint_cryo_blizzard())
    _save_fx_cycle(manifest, "fx_void_orb", _paint_void_orbs())
    _save_fx_cycle(manifest, "fx_void_rift", _paint_void_rifts())


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
            cell = clean_master_cell(sheet[y0:r1y1, x0:x1], bg, shadow_px=16, ratio=0.04, halo_depth=6)
            if hero == "crimson_flare":
                fix_crimson_stray_blue(cell)
            trimmed = trim(cell, pad=2)
            cleaned_heroes[hero][pose] = trimmed
            entry = save(trimmed, f"{hero}_{pose}")
            entry["ax"] = body_anchor(trimmed, pose)
            manifest[f"{hero}_{pose}"] = entry

        # Synthesize articulated 16-frame run cycle (walk_1..walk_16) with bilinear upper warp
        run16 = synthesize_16frame_run([cleaned_heroes[hero][f"walk_{k}"] for k in range(1, 5)])
        run16_cropped, run16_ax = _crop_union_frames(run16, float(run16[0].shape[1] // 2), pad=2)
        for k, fr in enumerate(run16_cropped, 1):
            pose_name = f"walk_{k}"
            cleaned_heroes[hero][pose_name] = fr
            entry = save(fr, f"{hero}_{pose_name}")
            entry["ax"] = run16_ax
            manifest[f"{hero}_{pose_name}"] = entry

        # Synthesize 8-frame breathing idle & 6-phase continuous jump arc
        idle8, idle_ax = synthesize_hero_idle8(cleaned_heroes[hero]["idle"])
        for k, fr in enumerate(idle8, 1):
            iname = f"idle_{k}"
            cleaned_heroes[hero][iname] = fr
            entry = save(fr, f"{hero}_{iname}")
            entry["ax"] = idle_ax
            manifest[f"{hero}_{iname}"] = entry

        jump6, jump_ax = synthesize_hero_jump6(cleaned_heroes[hero]["jump"])
        for k, fr in enumerate(jump6, 1):
            jname = f"jump_{k}"
            cleaned_heroes[hero][jname] = fr
            entry = save(fr, f"{hero}_{jname}")
            entry["ax"] = jump_ax
            manifest[f"{hero}_{jname}"] = entry

        for pose, (x0, x1) in ROW2_POSES:
            x1_eff = 948 if (hero == "emerald_phantom" and pose == "hit_reaction") else x1
            cell = clean_master_cell(sheet[r2y0:r2y1, x0:x1_eff], bg, shadow_px=16, ratio=0.025, halo_depth=14)
            if hero == "crimson_flare":
                fix_crimson_stray_blue(cell)
            if pose == "attack_blast":
                for i in range(8):
                    cell[:, -1 - i, 3] = (cell[:, -1 - i, 3] * i) // 8
            elif pose == "dash":
                for i in range(8):
                    cell[:, i, 3] = (cell[:, i, 3] * i) // 8
            trimmed = trim(cell, pad=2)
            if pose == "attack_slash":
                trimmed = orient_attack_slash_forward(trimmed, hero)
            cleaned_heroes[hero][pose] = trimmed
            entry = save(trimmed, f"{hero}_{pose}")
            entry["ax"] = body_anchor(trimmed, pose)
            manifest[f"{hero}_{pose}"] = entry

        # Synthesize 3x4 = 12-frame combo swings, 6-phase dash, 8-frame blast/ult & 4-frame hurt
        combo12, combo_ax = synthesize_hero_combo12(cleaned_heroes[hero]["attack_slash"])
        for c_idx in range(3):
            for f_idx in range(4):
                cname = f"attack_c{c_idx + 1}_{f_idx + 1}"
                fr = combo12[c_idx * 4 + f_idx]
                cleaned_heroes[hero][cname] = fr
                entry = save(fr, f"{hero}_{cname}")
                entry["ax"] = combo_ax
                manifest[f"{hero}_{cname}"] = entry

        dash6, dash_ax = synthesize_hero_dash6(cleaned_heroes[hero]["dash"])
        for k, fr in enumerate(dash6, 1):
            dname = f"dash_{k}"
            cleaned_heroes[hero][dname] = fr
            entry = save(fr, f"{hero}_{dname}")
            entry["ax"] = dash_ax
            manifest[f"{hero}_{dname}"] = entry

        blast8, blast_ax = synthesize_hero_blast8(cleaned_heroes[hero]["attack_blast"])
        for k, fr in enumerate(blast8, 1):
            bname = f"attack_blast_{k}"
            cleaned_heroes[hero][bname] = fr
            entry = save(fr, f"{hero}_{bname}")
            entry["ax"] = blast_ax
            manifest[f"{hero}_{bname}"] = entry

        ult8, ult_ax = synthesize_hero_ult8(cleaned_heroes[hero]["attack_slash"])
        for k, fr in enumerate(ult8, 1):
            uname = f"cast_ult_{k}"
            cleaned_heroes[hero][uname] = fr
            entry = save(fr, f"{hero}_{uname}")
            entry["ax"] = ult_ax
            manifest[f"{hero}_{uname}"] = entry

        hurt4, hurt_ax = synthesize_hero_hurt4(cleaned_heroes[hero]["hit_reaction"])
        for k, fr in enumerate(hurt4, 1):
            hname = f"hit_reaction_{k}"
            cleaned_heroes[hero][hname] = fr
            entry = save(fr, f"{hero}_{hname}")
            entry["ax"] = hurt_ax
            manifest[f"{hero}_{hname}"] = entry

        _emit_hero_aliases(manifest, hero)

        art_cell = clean_master_cell(sheet[56:546, 740:1446], bg, shadow_px=0, ratio=0.02, halo_depth=18)
        cleaned_heroes[hero]["art"] = art_cell
        manifest[f"{hero}_art"] = save(trim(art_cell, pad=2), f"{hero}_art", 420)

        icon_names = {"basic": "j_basic_attack", "skill1": "k_skill1", "skill2": "l_skill2", "ultimate": "u_ultimate"}
        for slot, file in icon_names.items():
            manifest[f"{hero}_icon_{slot}"] = circle_icon(
                f"skills/{HERO_SRC_ICONS[hero]}/icons/{file}_icon.png", f"{hero}_icon_{slot}"
            )

    # 2. Heroes 5, 6, 7: Obsidian Warden, Cryo Archon & Void Reaper
    generate_variant_hero("obsidian_warden", "nova_blade", cleaned_heroes["nova_blade"], recolor_to_obsidian, manifest)
    generate_variant_hero("cryo_archon", "volt_sentinel", cleaned_heroes["volt_sentinel"], recolor_to_cryo_archon, manifest)
    generate_variant_hero("void_reaper", "emerald_phantom", cleaned_heroes["emerald_phantom"], recolor_to_void_reaper, manifest)

    # 3. Extract all 25 enemy sprites/poses from uncut enemy master sheet + multi-frame run, idle & attack cycles
    enemy_sheet = load(ENEMY_MASTER_SHEET)
    enemy_bg = estimate_sheet_bg(enemy_sheet)
    cleaned_enemies: dict[str, np.ndarray] = {}
    for name, (x0, y0, x1, y1) in ENEMY_BOXES.items():
        shadow_px = 20 if name == "boss" else 14
        ratio = 0.015 if ("explode" in name or "break" in name or "rage" in name or "whip" in name or "summon" in name) else 0.03
        cell = clean_master_cell(enemy_sheet[y0:y1, x0:x1], enemy_bg, shadow_px=shadow_px, ratio=ratio, halo_depth=0)
        trimmed = trim(cell, pad=2)
        cleaned_enemies[name] = trimmed
        entry = save(trimmed, name)
        entry["ax"] = foot_anchor(trimmed)
        manifest[name] = entry

    for old_b in OUT.glob("bomber_run_*.png"):
        old_b.unlink()

    def _cap_boss(arr: np.ndarray, ename: str) -> np.ndarray:
        if ename.startswith("boss") and arr.shape[0] > 320:
            nw = round(arr.shape[1] * 320 / arr.shape[0])
            return np.array(
                Image.fromarray(arr.clip(0, 255).astype(np.uint8), "RGBA").resize((nw, 320), Image.Resampling.LANCZOS),
                dtype=arr.dtype,
            )
        return arr

    for ename in ("crawler", "mutant", "aegis", "boss"):
        base_e = _cap_boss(cleaned_enemies[ename], ename)
        base_ax_px = foot_anchor(base_e) * base_e.shape[1] + 8.0
        eruns = synthesize_enemy_run12(base_e, ename)
        eruns_cropped, erun_ax = _crop_union_frames(eruns, base_ax_px, pad=2)
        for k, fr in enumerate(eruns_cropped, 1):
            rname = f"{ename}_run_{k}"
            entry = save(fr, rname)
            entry["ax"] = erun_ax
            manifest[rname] = entry
            if ename == "crawler":
                manifest[f"bomber_run_{k}"] = dict(entry)

    for ename in ("crawler", "mutant", "aegis", "boss", "hunter"):
        base_e = _cap_boss(cleaned_enemies[ename], ename)
        base_ax_px = foot_anchor(base_e) * base_e.shape[1] + 8.0
        eidles = synthesize_enemy_idle6(base_e, ename)
        eidles_cropped, eidle_ax = _crop_union_frames(eidles, base_ax_px, pad=2)
        for k, fr in enumerate(eidles_cropped, 1):
            iname = f"{ename}_idle_{k}"
            entry = save(fr, iname)
            entry["ax"] = eidle_ax
            manifest[iname] = entry
            if ename == "crawler":
                manifest[f"bomber_idle_{k}"] = dict(entry)

    for aname, face_dir in (
        ("crawler_leap", -1),
        ("mutant_punch", 1),
        ("aegis_bash", 1),
        ("boss_slam", -1),
        ("boss_whip", -1),
        ("boss_beam", -1),
    ):
        base_a = _cap_boss(cleaned_enemies[aname], aname)
        a_frames, a_ax = synthesize_enemy_attack4(base_a, face_dir=face_dir)
        for k, fr in enumerate(a_frames, 1):
            key = f"{aname}_{k}"
            entry = save(fr, key)
            entry["ax"] = a_ax
            manifest[key] = entry

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
    build_skill_vfx(manifest)

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
