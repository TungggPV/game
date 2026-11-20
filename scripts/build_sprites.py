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
    orig_rgb = a[..., :3].astype(np.float32)
    gray = orig_rgb.mean(axis=2)

    is_core = (orig_rgb[..., 0] < 120) & (orig_rgb[..., 2] > 160) & (alpha > 40)
    res[..., 0] = np.clip(gray * 0.72 + 22, 0, 255)
    res[..., 1] = np.clip(gray * 0.62 + 16, 0, 255)
    res[..., 2] = np.clip(gray * 0.58 + 14, 0, 255)

    res[is_core, 0] = 255
    res[is_core, 1] = 185
    res[is_core, 2] = 55
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


def generate_variant_hero(
    target_id: str,
    src_hero: str,
    src_poses: dict[str, np.ndarray],
    recolor_fn,
    manifest: dict[str, dict],
) -> None:
    """Create a complete expanded-pose + art + 4-icon hero variant via recolor helper."""
    cycle_prefixes = ("walk_", "idle_", "jump_", "attack_slash_", "dash_")
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


def synthesize_12frame_run(base_frames: list[np.ndarray]) -> list[np.ndarray]:
    """Articulate 4 cleaned base walk poses into 12 smooth gait phases (6 per half-stride)."""
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

    gait = [
        # Half-stride A: Contact -> Recoil -> Pass-In -> Pass-Cross -> Drive -> Reach
        (0, +5.0, +4.0, -1.0, 0.0, -5.0, -2.0, +1.0, 0.0, True, +1.0, +4.5, 0),
        (0, -4.0, +18.0, +1.5, -2.0, +4.0, +7.0, -0.5, 0.0, True, +2.8, +2.5, 0),
        (1, -14.0, +27.0, +4.5, -4.5, +12.0, +5.0, -3.0, 0.0, True, +0.8, 0.0, 0),
        (2, -25.0, +28.0, +7.5, -5.5, +18.0, +3.0, -4.8, 0.0, False, -1.2, -2.2, 0),
        (3, -34.0, +14.0, +9.5, -4.5, +24.0, +9.0, -6.0, -1.0, False, -2.6, -4.2, 2),
        (3, -18.0, +6.0, +4.5, -2.5, +12.0, +6.0, -2.5, -1.5, False, -1.8, -4.8, 3),
        # Half-stride B: Contact -> Recoil -> Pass-In -> Pass-Cross -> Drive -> Reach
        (3, +3.0, +7.0, 0.0, -1.0, -3.0, +3.0, +1.0, 0.0, True, +1.0, -3.5, 0),
        (0, -6.0, +20.0, +2.0, -2.8, +5.0, +8.0, -1.0, 0.0, True, +2.8, -1.5, 0),
        (1, -17.0, +29.0, +5.5, -5.0, +14.0, +4.0, -3.5, 0.0, True, +0.6, +0.5, 0),
        (1, -27.0, +30.0, +8.0, -6.0, +19.0, +2.0, -5.5, 0.0, True, -1.2, +2.4, 0),
        (2, -22.0, +19.0, +5.5, -3.8, +12.0, -3.0, -3.0, -2.5, True, -2.5, +4.2, 2),
        (2, -8.0, +11.0, +2.0, -1.8, +2.0, -4.0, 0.0, -2.0, True, -1.5, +4.8, 3),
    ]

    out_frames: list[np.ndarray] = []
    for idx, bt, bs_ang, bdx, bdy, ft, fs_ang, fdx, fdy, front_top, body_dy, arm_sw, lift in gait:
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
        u_sx = xx - arm_side * arm_band * arm_sw
        u_sy = yy - body_dy - arm_side * arm_band * (arm_sw * 0.32)
        ux0 = np.clip(np.round(u_sx).astype(np.int32), 0, w - 1)
        uy0 = np.clip(np.round(u_sy).astype(np.int32), 0, h - 1)
        upper_warped = upper[uy0, ux0]

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


def synthesize_hero_idle4(base_idle: np.ndarray) -> tuple[list[np.ndarray], float]:
    """Synthesize 4-frame idle breathing/visor/arm combat stance with planted boots and locked torso ax."""
    pivot_x = body_anchor(base_idle, "idle") * base_idle.shape[1] + 8.0
    padded = np.pad(base_idle, ((8, 8), (8, 8), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    w_up = 1.0 - _smoothstep(h * 0.56, h * 0.72, yy)
    w_arm = _smoothstep(w * 0.16, w * 0.30, np.abs(xx - pivot_x)) * w_up

    frames: list[np.ndarray] = []
    for k in range(4):
        ph = k * (math.pi / 2.0)
        s = math.sin(ph)
        c = math.cos(ph)
        dy = -s * 2.3 * w_up + c * 1.6 * w_arm
        dx = c * 0.9 * w_up + s * 1.1 * w_arm
        frames.append(_bilinear_warp(padded, xx - dx, yy - dy, alpha_thresh=0.0))
    return _crop_union_frames(frames, pivot_x, pad=2)


def synthesize_hero_jump3(base_jump: np.ndarray) -> tuple[list[np.ndarray], float]:
    """Synthesize 3-phase jump arc (rise, apex, fall) with locked union bounds."""
    pivot_x = body_anchor(base_jump, "jump") * base_jump.shape[1] + 14.0
    padded = np.pad(base_jump, ((14, 14), (14, 14), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    pivot_y = h * 0.5
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx0 = xx - pivot_x
    dy0 = yy - pivot_y
    w_leg = _smoothstep(h * 0.55, h * 0.75, yy)
    w_arm = _smoothstep(h * 0.50, h * 0.30, yy)

    # Rise: -5.5 deg tilt, 1.04 vertical stretch, leg tuck
    th_r = math.radians(-5.5)
    c_r, s_r = math.cos(th_r), math.sin(th_r)
    sx_r = pivot_x + dx0 * c_r + (dy0 / 1.04) * s_r
    sy_r = pivot_y - dx0 * s_r + (dy0 / 1.04) * c_r - (-4.5 * w_leg)
    rise = _bilinear_warp(padded, sx_r, sy_r, alpha_thresh=0.0)

    # Apex: neutral hover
    apex = padded.copy()

    # Fall: +7.0 deg pitch forward, braced descending legs, raised balance arms
    th_f = math.radians(7.0)
    c_f, s_f = math.cos(th_f), math.sin(th_f)
    dy_off = 4.5 * w_leg - 3.0 * w_arm
    sx_f = pivot_x + dx0 * c_f + dy0 * s_f
    sy_f = pivot_y - dx0 * s_f + dy0 * c_f - dy_off
    fall = _bilinear_warp(padded, sx_f, sy_f, alpha_thresh=0.0)

    return _crop_union_frames([rise, apex, fall], pivot_x, pad=2)


def synthesize_hero_combo3(base_slash: np.ndarray) -> tuple[list[np.ndarray], float]:
    """Synthesize 3-hit melee combo variants (cut, uppercut, heavy finisher) preserving translucent arcs."""
    pivot_x = body_anchor(base_slash, "attack_slash") * base_slash.shape[1] + 26.0
    padded = np.pad(base_slash, ((26, 26), (26, 26), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    pivot_y = h * 0.56
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx0 = xx - pivot_x
    dy0 = yy - pivot_y

    # Combo 1: horizontal cut
    s1 = padded.copy()

    # Combo 2: rising uppercut (-10.5 deg weapon tilt + -3 deg body tilt + upward blade lift)
    w_blade = _smoothstep(pivot_x - 16.0, pivot_x + 12.0, xx)
    th_2 = np.radians(-3.0 - 10.5 * w_blade)
    c2, s2_sin = np.cos(th_2), np.sin(th_2)
    sx2 = pivot_x + dx0 * c2 + dy0 * s2_sin
    sy2 = pivot_y - dx0 * s2_sin + dy0 * c2 - (-4.0 * w_blade)
    s2 = _bilinear_warp(padded, sx2, sy2, alpha_thresh=0.0)

    # Combo 3: heavy overhead finisher (+8.5 deg downward smash + forward lunge + 1.04x arc punch)
    w_lunge = _smoothstep(pivot_x - 12.0, pivot_x + 28.0, xx)
    arc_scale = 1.0 + 0.04 * w_lunge
    th_3 = math.radians(8.5)
    c3, s3_sin = math.cos(th_3), math.sin(th_3)
    dx3 = (dx0 - 5.5 * w_lunge) / arc_scale
    dy3 = dy0 / arc_scale
    sx3 = pivot_x + dx3 * c3 + dy3 * s3_sin
    sy3 = pivot_y - dx3 * s3_sin + dy3 * c3
    s3 = _bilinear_warp(padded, sx3, sy3, alpha_thresh=0.0)

    return _crop_union_frames([s1, s2, s3], pivot_x, pad=2)


def synthesize_hero_dash2(base_dash: np.ndarray) -> tuple[list[np.ndarray], float]:
    """Synthesize 2-phase dash (coiled launch -> stretched horizontal glide)."""
    pivot_x = body_anchor(base_dash, "dash") * base_dash.shape[1] + 14.0
    padded = np.pad(base_dash, ((10, 10), (14, 14), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    pivot_y = h * 0.55
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx0 = xx - pivot_x
    dy0 = yy - pivot_y

    th_1 = math.radians(4.0)
    c1, s1 = math.cos(th_1), math.sin(th_1)
    d1 = _bilinear_warp(padded, pivot_x + (dx0 / 0.96) * c1 + dy0 * s1, pivot_y - (dx0 / 0.96) * s1 + dy0 * c1, alpha_thresh=0.0)

    d2 = _bilinear_warp(padded, pivot_x + dx0 / 1.05, pivot_y + dy0 / 0.96, alpha_thresh=0.0)
    return _crop_union_frames([d1, d2], pivot_x, pad=2)


def synthesize_enemy_run8(base: np.ndarray, kind: str) -> list[np.ndarray]:
    """Synthesize a smooth 8-frame high-res walk cycle from an enemy's main portrait."""
    padded = np.pad(base, ((8, 8), (8, 8), (0, 0)), mode="constant", constant_values=0)
    h, w = padded.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = w * 0.5
    frames: list[np.ndarray] = []

    for k in range(8):
        ph = k * (math.pi / 4.0)
        s = math.sin(ph)
        c = math.cos(ph)

        if kind == "crawler":
            w_leg = _smoothstep(h * 0.45, h * 0.62, yy)
            w_a = 0.5 + 0.5 * np.cos((xx - cx) / (w * 0.14) * math.pi)
            lift_a = max(0.0, s)
            lift_b = max(0.0, -s)
            dy = -(w_a * lift_a + (1.0 - w_a) * lift_b) * (h * 0.085) * w_leg + abs(s) * (h * 0.02) * (1.0 - w_leg)
            dx = (w_a * c - (1.0 - w_a) * c) * (w * 0.038) * w_leg
        else:
            w_leg = _smoothstep(h * 0.56, h * 0.70, yy)
            w_left = _smoothstep(cx + w * 0.08, cx - w * 0.08, xx)
            w_right = 1.0 - w_left

            in_leg_corridor = np.maximum(
                _smoothstep(w * 0.36, w * 0.25, np.abs(xx - cx)), _smoothstep(h * 0.74, h * 0.82, yy)
            )
            w_leg = w_leg * in_leg_corridor

            lift_l = max(0.0, s) * (h * 0.085)
            lift_r = max(0.0, -s) * (h * 0.085)
            stride_l = c * (w * 0.042)
            stride_r = -c * (w * 0.042)

            leg_dy = -(w_left * lift_l + w_right * lift_r) * w_leg
            leg_dx = (w_left * stride_l + w_right * stride_r) * w_leg

            w_arm = _smoothstep(w * 0.16, w * 0.28, np.abs(xx - cx)) * (1.0 - _smoothstep(h * 0.65, h * 0.80, yy))
            arm_sign = np.where(xx < cx, -1.0, 1.0)
            arm_dy = arm_sign * s * (h * 0.038) * w_arm
            arm_dx = -arm_sign * c * (w * 0.025) * w_arm

            body_bob = -abs(s) * (h * 0.022) * (1.0 - w_leg)
            dy = leg_dy + arm_dy + body_bob
            dx = leg_dx + arm_dx

        frames.append(_bilinear_warp(padded, xx - dx, yy - dy, alpha_thresh=100.0))
    return frames


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

        # Synthesize articulated 12-frame run cycle (walk_1..walk_12) with leg-passing crossovers
        run12 = synthesize_12frame_run([cleaned_heroes[hero][f"walk_{k}"] for k in range(1, 5)])
        run12_cropped, run12_ax = _crop_union_frames(run12, float(run12[0].shape[1] // 2), pad=2)
        for k, fr in enumerate(run12_cropped, 1):
            pose_name = f"walk_{k}"
            cleaned_heroes[hero][pose_name] = fr
            entry = save(fr, f"{hero}_{pose_name}")
            entry["ax"] = run12_ax
            manifest[f"{hero}_{pose_name}"] = entry

        # Synthesize 4-frame breathing idle & 3-phase jump arc
        idle4, idle_ax = synthesize_hero_idle4(cleaned_heroes[hero]["idle"])
        for k, fr in enumerate(idle4, 1):
            iname = f"idle_{k}"
            cleaned_heroes[hero][iname] = fr
            entry = save(fr, f"{hero}_{iname}")
            entry["ax"] = idle_ax
            manifest[f"{hero}_{iname}"] = entry

        jump3, jump_ax = synthesize_hero_jump3(cleaned_heroes[hero]["jump"])
        for jname, fr in zip(("jump_rise", "jump_apex", "jump_fall"), jump3):
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

        # Synthesize 3-hit melee combo variants & 2-phase dash
        combo3, combo_ax = synthesize_hero_combo3(cleaned_heroes[hero]["attack_slash"])
        for k, fr in enumerate(combo3, 1):
            cname = f"attack_slash_{k}"
            cleaned_heroes[hero][cname] = fr
            entry = save(fr, f"{hero}_{cname}")
            entry["ax"] = combo_ax
            manifest[f"{hero}_{cname}"] = entry

        dash2, dash_ax = synthesize_hero_dash2(cleaned_heroes[hero]["dash"])
        for k, fr in enumerate(dash2, 1):
            dname = f"dash_{k}"
            cleaned_heroes[hero][dname] = fr
            entry = save(fr, f"{hero}_{dname}")
            entry["ax"] = dash_ax
            manifest[f"{hero}_{dname}"] = entry

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

    # 3. Extract all 25 enemy sprites/poses from uncut enemy master sheet + aliases + high-res 4-frame runs
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

    for ename in ("crawler", "mutant", "aegis", "boss"):
        base_e = cleaned_enemies[ename]
        if ename == "boss" and base_e.shape[0] > 320:
            nw = round(base_e.shape[1] * 320 / base_e.shape[0])
            base_e = np.array(
                Image.fromarray(base_e.clip(0, 255).astype(np.uint8), "RGBA").resize((nw, 320), Image.Resampling.LANCZOS),
                dtype=base_e.dtype,
            )
        base_ax_px = foot_anchor(base_e) * base_e.shape[1] + 8.0
        eruns = synthesize_enemy_run8(base_e, ename)
        eruns_cropped, erun_ax = _crop_union_frames(eruns, base_ax_px, pad=2)
        for k, fr in enumerate(eruns_cropped, 1):
            rname = f"{ename}_run_{k}"
            entry = save(fr, rname)
            entry["ax"] = erun_ax
            manifest[rname] = entry
            if ename == "crawler":
                manifest[f"bomber_run_{k}"] = dict(entry)

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
