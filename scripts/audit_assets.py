import os
import json
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path("public/assets")
SPRITES_JSON = Path("src/config/sprites.json")

print("=== STEP 1: ASSET & SPRITES.JSON AUDIT ===\n")

# 1. Audit all image files under public/assets
all_images = []
for root, _, files in os.walk(ROOT):
    for f in files:
        if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            all_images.append(Path(root) / f)

print(f"Total image files found under public/assets: {len(all_images)}")

flagged_files = []

for p in sorted(all_images):
    rel = p.relative_to(ROOT)
    try:
        with Image.open(p) as img:
            w, h = img.size
            mode = img.mode
            bbox = img.getbbox()
            has_alpha = 'A' in mode or img.info.get('transparency') is not None
            
            if mode != 'RGBA':
                img_rgba = img.convert('RGBA')
            else:
                img_rgba = img
            
            arr = np.array(img_rgba)
            alpha = arr[:, :, 3]
            total_px = w * h
            opaque_px = int(np.count_nonzero(alpha > 10))
            transparent_px = total_px - opaque_px
            trans_ratio = transparent_px / total_px if total_px > 0 else 0
            
            # Check edge clipping: non-zero alpha touching image borders
            touch_left = bool(np.any(alpha[:, 0] > 10))
            touch_right = bool(np.any(alpha[:, -1] > 10))
            touch_top = bool(np.any(alpha[0, :] > 10))
            touch_bottom = bool(np.any(alpha[-1, :] > 10))
            
            info = {
                "path": str(rel),
                "size": (w, h),
                "mode": mode,
                "trans_ratio": round(trans_ratio, 3),
                "bbox": bbox,
                "touches": {"L": touch_left, "R": touch_right, "T": touch_top, "B": touch_bottom}
            }
            
            # Detect unkeyed card images or platform sheets in game
            issues = []
            if trans_ratio < 0.05 and 'background' not in str(rel).lower() and 'bg_' not in str(rel).lower():
                issues.append("Zero/minimal transparency in non-background sprite (likely unkeyed card image)")
            if bbox and (bbox[2] - bbox[0] < w * 0.5 or bbox[3] - bbox[1] < h * 0.5):
                issues.append(f"Excessive empty padding (content bbox {bbox} in {w}x{h})")
            if touch_left and touch_right and 'bg_' not in str(rel) and 'background' not in str(rel):
                # could be cut sprite
                pass
                
            if issues:
                info["issues"] = issues
                flagged_files.append(info)
    except Exception as e:
        flagged_files.append({"path": str(rel), "error": str(e)})

print(f"\n--- Flagged Image Files ({len(flagged_files)} items) ---")
for f in flagged_files:
    print(f"[{f.get('path')}] size={f.get('size')} mode={f.get('mode')} trans_ratio={f.get('trans_ratio')} issues={f.get('issues')}")

# 2. Audit src/config/sprites.json
print("\n--- Auditing src/config/sprites.json ---")
with open(SPRITES_JSON, "r", encoding="utf-8") as f:
    sprites_data = json.load(f)

json_issues = []
for key, entry in sprites_data.items():
    fn = entry.get("file")
    if not fn:
        json_issues.append(f"Key '{key}' has no 'file' attribute.")
        continue
    game_file = ROOT / "game" / fn
    if not game_file.exists():
        json_issues.append(f"Key '{key}' references missing file '{fn}' in public/assets/game/")
        continue
    
    with Image.open(game_file) as gimg:
        gw, gh = gimg.size
        ew = entry.get("w")
        eh = entry.get("h")
        if ew is not None and ew != gw:
            json_issues.append(f"Key '{key}' dimension mismatch W: json={ew} vs file={gw}")
        if eh is not None and eh != gh:
            json_issues.append(f"Key '{key}' dimension mismatch H: json={eh} vs file={gh}")
        
        # Check if crop rects exist
        if "sx" in entry or "sy" in entry or "sw" in entry or "sh" in entry:
            sx = entry.get("sx", 0)
            sy = entry.get("sy", 0)
            sw = entry.get("sw", gw)
            sh = entry.get("sh", gh)
            if sx + sw > gw or sy + sh > gh:
                json_issues.append(f"Key '{key}' crop rectangle ({sx},{sy},{sw},{sh}) exceeds file bounds ({gw},{gh})")

print(f"Total entries in sprites.json: {len(sprites_data)}")
if json_issues:
    print(f"Found {len(json_issues)} issues in sprites.json:")
    for iss in json_issues:
        print("  -", iss)
else:
    print("No mismatches found between sprites.json and public/assets/game/*.png!")
