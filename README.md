# Element Armor: Hào Quang Giáp

Game hành động màn hình ngang (beat 'em up) sci‑fi viết bằng Phaser 3, TypeScript và Vite.
Chọn một trong bốn bộ giáp nguyên tố, vượt 3 màn với các đợt quái và hạ trùm Abyssal Colossus,
chơi co-op 2 người trên cùng bàn phím hoặc đấu đối kháng PK.

## Chạy

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build vào dist/
```

Deploy Vercel: framework Vite, build `npm run build`, output `dist` (đã cấu hình trong `vercel.json`).

## Chế độ

- **1 Người** — 3 màn (Thành Phố Neon → Phòng Thí Nghiệm Ngầm → Pháo Đài Dung Nham), mỗi màn 3 đợt.
  Hết đợt thì "TIẾN LÊN" sang khu kế tiếp. Hết màn được chọn 1 trong 3 nâng cấp giáp. Màn cuối là trùm.
- **Co-op 2P** — như trên, hai người cùng đánh. Người gục ngã tự hồi sinh sau 8 giây nếu đồng đội còn sống.
- **Đối kháng** — P1 đấu P2, 99 giây mỗi hiệp, thắng 2/3 hiệp.

Điểm có hệ số combo; kỷ lục lưu trong trình duyệt.

## Điều khiển

| | P1 | P2 |
|---|---|---|
| Di chuyển | A / D | ← / → |
| Nhảy (nhảy kép) | W / Space | ↑ |
| Lướt né (bất tử ngắn) | Shift / F | ↓ / Numpad 0 |
| Đánh thường (combo 3) | J | Numpad 1 / `,` |
| Kỹ năng 1 / 2 | K / L | Numpad 2, 3 / `.` `/` |
| Tuyệt kỹ (100 năng lượng) | U / I | Numpad 4 / `'` |
| Tạm dừng | P / Esc | |

Trên điện thoại có nút cảm ứng cho P1.

## Anh hùng

| | Vai trò | J | K | L | U |
|---|---|---|---|---|---|
| Nova Blade | Cân bằng · Plasma | Chém Plasma | Plasma Shot (xuyên) | Rising Blade (hất tung) | Nova Overdrive (toàn màn hình) |
| Crimson Flare | Sát thương · Lửa | Quyền Lửa (bỏng) | Fire Burst (nổ lan) | Inferno Arc | Crimson Meteor |
| Volt Sentinel | Tốc độ · Sét | Tia Lửa Điện | Thunder Bolt (lan sét) | Electric Cage (làm chậm) | Storm Breaker (choáng) |
| Emerald Phantom | Cơ động · Độc, nhảy 3 lần | Ảnh Trảm (độc) | Wind Pulse (đẩy lùi) | Toxic Spiral | Emerald Mirage |

## Kẻ địch

- **Crawler** — lao vồ. **Horned Mutant** — đấm/húc, khó bị ngắt đòn. **Sky Hunter** — bay và bắn.
- **Aegis Elite** — khiên chặn đòn thường từ phía trước; đánh sau lưng hoặc dùng kỹ năng.
- **Abyssal Colossus** — dậm đất tạo sóng xung kích (nhảy qua), tia laser (nhảy kép/lướt), quật xúc tu, gọi Crawler; nổi giận dưới 50% máu.

Mọi đòn của kẻ địch đều có báo hiệu (nháy đỏ, dấu `!`, vạch cảnh báo).

## Cấu trúc

```
src/
  config/      constants, heroes (chỉ số + kỹ năng), content (quái, màn, nâng cấp)
  entities/    Actor (vật lý, trạng thái), Hero, Enemy (AI từng loại)
  systems/     controls (bàn phím + cảm ứng), skills, Fx (hiệu ứng), sfx (âm thanh WebAudio), assets
  scenes/      Boot, Menu, Game, UI (HUD + overlay)
  ui/          widgets (nút, nhóm nút điều hướng bằng phím)
scripts/build_sprites.py   làm sạch ảnh gốc → public/assets/game/
```

Ảnh gốc nằm trong `public/assets/`. Game chỉ dùng bản đã làm sạch trong `public/assets/game/`
(bỏ bóng sàn, chữ, mảnh thừa; cắt viền; tính điểm neo chân). Khi đổi ảnh gốc, chạy lại:

```bash
pip install pillow numpy
python scripts/build_sprites.py
```
