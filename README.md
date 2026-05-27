# Element Armor: Hao Quang Giap

2D beat-em-up game built with Phaser 3, TypeScript, and Vite. The art direction is an original blue/white/cyan armored hero style inspired by tokusatsu/mecha games, without copying copyrighted names, characters, images, or story.

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build

```bash
npm run build
```

The production output is generated in `dist/`.

## Deploy On Vercel

This repo is ready for Vercel:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: configured in `vercel.json`

If the GitHub repo is already linked to Vercel, pushing to `main` will trigger a deployment.

## Controls

P1:

- `A/D`: move
- `W` / `Space`: jump
- `J`: attack
- `K`: dash
- `L`: guard
- `F`: special
- `Q/E` or `1-4`: switch armor
- `R`: overdrive

P2:

- Arrow keys: move/jump
- `Numpad 1` or `.`: attack
- `Numpad 2` or `,`: dash
- `Numpad 3` or `/`: guard
- `Numpad 0` or `Enter`: special
- `Numpad 4/6` or `[` / `]`: switch armor
- `Numpad 5` or `Right Shift`: overdrive

Shared:

- `P` or `Esc`: pause
