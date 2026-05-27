# Nova Strike Cut Assets

Thư mục này chứa các file PNG đã được cắt từ 4 asset sheet lớn.

## Cấu trúc chính

```text
nova-strike-cut-assets/
├── backgrounds/       # 3 background màn chơi
├── hero/              # nhân vật chính: turnaround, sprite, portrait
├── enemies/           # crawler, mutant, sky hunter, aegis, boss
├── ui/                # HUD, menu, dialog, buttons
├── items/             # coin, health, crystal, keycard, chip, chest
├── skills/            # icon skill
├── effects/           # slash, blast, hit spark, explosion
├── tiles/             # tile/platform theo từng màn
├── props/             # props/hazard theo từng màn
└── sheets/            # 4 ảnh gốc để cắt lại nếu cần
```

## Lưu ý

- Một số sprite đã được tách nền bằng cách xóa nền xám ở mép ảnh. Nếu thấy viền hoặc chữ còn sót, bạn có thể dùng ảnh trong `sheets/` để cắt lại chính xác hơn.
- Với game Phaser/Vite, đặt toàn bộ thư mục này vào `public/assets/`. Ví dụ: `public/assets/hero/sprites/idle.png`.
- File `asset-manifest.json` ghi crop box từng file để Codex có thể hiểu asset được cắt từ vùng nào.
