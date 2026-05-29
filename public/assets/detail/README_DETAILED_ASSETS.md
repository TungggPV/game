# Detailed Game Graphics Assets

Bộ asset này được cắt từ bảng thiết kế đồ họa sci-fi chi tiết.

Cách copy vào project:

```text
public/assets/detailed/
├── heroes/
├── enemies/
├── environment/
├── ui/
├── effects/
├── items/
└── sheets/
```

Gợi ý dùng:
- `heroes/*/hero_card.png`: menu chọn hero / gallery.
- `enemies/*.png`: enemy preview, boss preview, hoặc reference để tạo sprite.
- `environment/cyber_city_parallax_background.png`: background menu / stage.
- `environment/industrial_platform_tiles.png`: reference platform/tile.
- `ui/*.png`: pause, game over, stage clear, HUD, button reference.
- `effects/*.png`: reference hiệu ứng skill/particle.
- `items/*.png`: pickup icons.

Lưu ý: một số ảnh là panel/reference, không phải sprite nền trong suốt. Dùng tốt nhất cho UI preview, gallery, menu hoặc làm reference cho Codex tạo gameplay effects bằng Phaser.
