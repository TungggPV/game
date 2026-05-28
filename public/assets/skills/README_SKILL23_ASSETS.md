# Hero Skill 2 + Ultimate Assets v1

This folder contains the redesigned, more visually distinct **Skill 2** and **Ultimate** assets for the four heroes:
- Nova Blade
- Crimson Flare
- Volt Sentinel
- Emerald Phantom

Recommended placement in your game project:

```text
public/assets/skills/
├── nova_blade/
│   ├── icons/
│   └── cards/
├── crimson_flare/
├── volt_sentinel/
└── emerald_phantom/
```

Files included per hero:
- `icons/l_skill2_icon.png`
- `icons/u_ultimate_icon.png`
- `cards/l_skill2_card.png`
- `cards/l_skill2_effect_art.png`
- `cards/u_ultimate_card.png`
- `cards/u_ultimate_effect_art.png`

Suggested use:
- Use the `icon` files for your skill bar.
- Use the `effect_art` files for hero selection panels, tooltips, or design reference.
- Use the full `card` images as reference sheets for Codex / further UI work.

Note: The actual in-game VFX should still be created using Phaser particles / tinted effects for animation, while these images serve as clean UI/reference assets.
