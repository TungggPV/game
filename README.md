# Element Armor: Hao Quang Giap

2D sci-fi side-scrolling armor hero game built with Phaser 3, TypeScript, and Vite.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Vercel settings:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: `vercel.json`

## Controls

P1:

- `A/D`: move
- `W` or `Space`: jump
- `J`: basic attack
- `K`: Skill 1
- `L`: Skill 2
- `U` or `I`: ultimate
- `Shift` or `F`: dash
- `P` or `Esc`: pause / resume

P2:

- `Arrow Left/Right`: move
- `Arrow Up`: jump
- `Numpad 1`: basic attack
- `Numpad 2`: Skill 1
- `Numpad 3`: Skill 2
- `Numpad 4`: ultimate
- `Right Shift` or `Numpad 0`: dash

Debug:

- `H`: toggle hitbox debug
- `F10`: toggle playtest log

## Heroes And Skills

Nova Blade:

- `J` Basic Slash: quick melee, gains energy on hit
- `K` Plasma Shot: ranged cyan projectile
- `L` Rising Blade: melee AOE launcher
- `U/I` Nova Overdrive: cyan plasma AOE burst

Crimson Flare:

- `J` Flame Strike: quick melee, gains energy on hit
- `K` Fire Burst: ranged fire shot with small explosion
- `L` Inferno Arc: heavy melee AOE, can burn
- `U/I` Crimson Meteor: fire meteor AOE, guaranteed burn

Volt Sentinel:

- `J` Quick Spark: fastest basic melee, gains energy on hit
- `K` Thunder Bolt: fast ranged shot with chain lightning
- `L` Electric Cage: control AOE, tick damage and slow
- `U/I` Storm Breaker: 4 lightning strikes with short stun

Emerald Phantom:

- `J` Phantom Strike: quick melee, gains energy on hit
- `K` Wind Pulse: ranged wind shot with knockback
- `L` Toxic Spiral: AOE poison burst
- `U/I` Emerald Mirage: multi-hit phantom slash AOE

Basic attack and skill data live in `src/config/skills.ts`. Skill icons and card/effect art are loaded from `public/assets/skills/<heroId>/`.

## Status Effects

- Burn: 4 HP every 0.5s for 3s.
- Poison: 3 HP every 0.5s for 5s and enemy speed -15%.
- Stun: enemy cannot move or attack briefly.
- Slow: enemy speed -40% for 2s.

## Enemies And Waves

Stage 1 has 3 waves:

- Wave 1: 2 crawler drones
- Wave 2: 2 crawler drones and 1 sky hunter
- Wave 3: 1 horned mutant boss and 1 crawler drone

Enemy upgrades:

- Later waves increase enemy HP by 10% and damage by 5%.
- Crawler Drone has 70 HP, stronger melee, and a wind-up leap attack.
- Horned Mutant uses the boss sprite set, has 260 HP, Ground Slam, and enrages below 40% HP.
- Sky Hunter has 100 HP, patrols above the platform, and fires stronger energy shots.

Enemy spawns are kept away from players and ground enemies are pushed apart to reduce overlap.

Pause menu buttons support Continue, Replay, and Back to Menu. Game Over and Stage Clear overlays reset cleanly when Replay is selected.
