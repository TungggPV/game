import Phaser from "phaser";
import { ARENA_WIDTH, DEPTH, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, type GameMode } from "../config/constants";
import { STAGES, UPGRADES, type EnemyType, type StageDef, type Upgrade } from "../config/content";
import { heroById, type SkillDef } from "../config/heroes";
import type { Actor, Hit } from "../entities/Actor";
import { Enemy } from "../entities/Enemy";
import { Hero } from "../entities/Hero";
import { consumeTouch, PlayerControls, setSceneFlag } from "../systems/controls";
import { Fx } from "../systems/Fx";
import { sfx } from "../systems/sfx";

export type GameData = { mode: GameMode; heroes: string[] };

type Projectile = {
  owner: Actor;
  img: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  pierce: number;
  hitSet: Set<Actor>;
  explodeRadius?: number;
  chain?: number;
  hit: Hit;
  color: number;
};

type Field = {
  owner: Hero;
  offset: number;
  x: number;
  y: number;
  radius: number;
  time: number;
  tick: number;
  acc: number;
  hit: Hit;
  ring: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
};

type Hazard = {
  owner: Enemy;
  rect: Phaser.Geom.Rectangle;
  vx: number;
  life: number;
  hitSet: Set<Actor>;
  damage: number;
  view: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  core?: Phaser.GameObjects.Rectangle;
  kind: "shock" | "beam";
};

type Pickup = { kind: "health" | "energy" | "coin"; img: Phaser.GameObjects.Image; x: number; y: number; vy: number; life: number };

export type Phase = "intro" | "fight" | "advance" | "stageClear" | "upgrade" | "pkIntro" | "pkFight" | "roundEnd" | "over";

export type ResultData = { win: boolean; title: string; detail: string; score: number; best: number; mode: GameMode };

export class GameScene extends Phaser.Scene {
  mode: GameMode = "solo";
  heroIds: string[] = [];
  heroes: Hero[] = [];
  enemies: Enemy[] = [];
  fx!: Fx;
  dt = 0;
  phase: Phase = "intro";
  stageIndex = 0;
  waveIndex = 0;
  score = 0;
  combo = 0;
  comboTimer = 0;
  pkTimer = 99;
  pkRound = 1;
  pkWins = [0, 0];
  boss?: Enemy;

  private projectiles: Projectile[] = [];
  private fields: Field[] = [];
  private hazards: Hazard[] = [];
  private pickups: Pickup[] = [];
  private spawnQueue: EnemyType[] = [];
  private spawnTimer = 0;
  private spawnSide = 1;
  private arenaMin = 0;
  private arenaMax = ARENA_WIDTH;
  private hitstop = 0;
  private phaseTimer = 0;
  private bg!: Phaser.GameObjects.TileSprite;
  private bgScale = 1;
  private floor!: Phaser.GameObjects.TileSprite;
  private floorGlow!: Phaser.GameObjects.Rectangle;
  private pauseKeys: Phaser.Input.Keyboard.Key[] = [];

  constructor() {
    super("game");
  }

  init(data: GameData) {
    this.mode = data.mode;
    this.heroIds = data.heroes;
    this.heroes = [];
    this.enemies = [];
    this.projectiles = [];
    this.fields = [];
    this.hazards = [];
    this.pickups = [];
    this.spawnQueue = [];
    this.stageIndex = 0;
    this.waveIndex = 0;
    this.score = 0;
    this.combo = 0;
    this.pkRound = 1;
    this.pkWins = [0, 0];
    this.boss = undefined;
    this.hitstop = 0;
  }

  get stage(): StageDef {
    return STAGES[this.mode === "pk" ? 0 : this.stageIndex];
  }

  get worldWidth() {
    return this.mode === "pk" ? ARENA_WIDTH : ARENA_WIDTH * this.stage.waves.length;
  }

  create() {
    setSceneFlag("game");
    this.fx = new Fx(this);
    this.buildWorld();

    const count = this.mode === "solo" ? 1 : 2;
    for (let i = 0; i < count; i += 1) {
      const def = heroById(this.heroIds[i] ?? this.heroIds[0]);
      const x = this.mode === "pk" ? (i === 0 ? 300 : GAME_WIDTH - 300) : 220 + i * 110;
      const hero = new Hero(this, x, def, i as 0 | 1, new PlayerControls(this, i as 0 | 1), this.mode === "pk" ? 360 : undefined);
      if (this.mode === "pk") hero.energy = 20;
      this.heroes.push(hero);
    }

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.pauseKeys = [K.P, K.ESC].map((k) => this.input.keyboard!.addKey(k));
    this.scene.launch("ui");
    this.scene.bringToTop("ui");

    if (this.mode === "pk") this.startPkRound();
    else this.startStage();
  }

  // ---------- world ----------

  private buildWorld() {
    const stage = this.stage;
    const tex = this.textures.get(stage.background).getSourceImage();
    this.bgScale = (GROUND_Y + 30) / tex.height;
    this.bg?.destroy();
    this.bg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GROUND_Y + 30, stage.background)
      .setOrigin(0)
      .setScrollFactor(0)
      .setTileScale(this.bgScale)
      .setDepth(DEPTH.bg);
    this.floor?.destroy();
    this.floor = this.add
      .tileSprite(0, GROUND_Y, ARENA_WIDTH * 3 + GAME_WIDTH, GAME_HEIGHT - GROUND_Y, "floor")
      .setOrigin(0)
      .setTint(Phaser.Display.Color.ValueToColor(stage.floor).brighten(60).color)
      .setDepth(DEPTH.floor);
    this.floorGlow?.destroy();
    this.floorGlow = this.add.rectangle(0, GROUND_Y, ARENA_WIDTH * 3 + GAME_WIDTH, 3, stage.accent, 0.9).setOrigin(0, 0.5).setDepth(DEPTH.floor + 1);
    this.cameras.main.setBounds(0, 0, this.worldWidth, GAME_HEIGHT);
    this.cameras.main.setBackgroundColor(stage.floor);
  }

  arenaBounds(): [number, number] {
    return [this.arenaMin, this.arenaMax];
  }

  /** Drop key presses latched while paused so resuming doesn't re-pause or attack. */
  resumeFromPause() {
    this.pauseKeys.forEach((k) => k.reset());
    this.input.keyboard?.resetKeys();
  }

  // ---------- stage flow ----------

  private startStage() {
    this.waveIndex = 0;
    this.arenaMin = 0;
    this.arenaMax = ARENA_WIDTH;
    this.buildWorld();
    this.cameras.main.setScroll(0, 0);
    this.heroes.forEach((h, i) => {
      h.x = 200 + i * 110;
      h.y = GROUND_Y;
      h.vx = h.vy = 0;
      h.facing = 1;
      if (h.dead) h.revive(0.6);
    });
    this.setPhase("intro", 2.2);
    this.events.emit("banner", this.stage.subtitle.toUpperCase(), this.stage.name, this.stage.accent);
    this.lockHeroes(true);
  }

  private startWave() {
    const waves = this.stage.waves;
    this.spawnQueue = [...waves[this.waveIndex]];
    this.spawnTimer = 0.3;
    this.setPhase("fight", 0);
    this.lockHeroes(false);
    const last = this.stageIndex === STAGES.length - 1 && this.waveIndex === waves.length - 1;
    if (last) {
      this.events.emit("banner", "CẢNH BÁO", "Abyssal Colossus xuất hiện!", 0xff3355);
      sfx.warn();
    } else {
      this.events.emit("toast", `Đợt ${this.waveIndex + 1}/${waves.length}`);
    }
  }

  private setPhase(phase: Phase, timer: number) {
    this.phase = phase;
    this.phaseTimer = timer;
  }

  private lockHeroes(locked: boolean) {
    this.heroes.forEach((h) => (h.locked = locked));
  }

  private onWaveCleared() {
    this.heroes.forEach((h) => {
      if (h.dead && this.anyHeroAlive()) h.revive(0.4);
    });
    if (this.waveIndex < this.stage.waves.length - 1) {
      this.setPhase("advance", 0);
      this.arenaMax = this.arenaMin + ARENA_WIDTH * 2;
      this.events.emit("go", true);
      sfx.confirm();
    } else {
      this.setPhase("stageClear", 2.6);
      this.events.emit("banner", "HOÀN THÀNH", this.stage.name, 0x7dffb0);
      sfx.win();
      this.lockHeroes(true);
    }
  }

  private afterStageClear() {
    if (this.stageIndex >= STAGES.length - 1) {
      this.finish(true);
      return;
    }
    this.setPhase("upgrade", 0);
    const choices = Phaser.Utils.Array.Shuffle([...UPGRADES]).slice(0, 3);
    this.events.emit("upgrade", choices);
  }

  chooseUpgrade(upgrade: Upgrade) {
    this.heroes.forEach((h) => {
      upgrade.apply(h.mods);
      h.applyMods();
    });
    this.stageIndex += 1;
    this.startStage();
  }

  finish(win: boolean) {
    if (this.phase === "over") return;
    this.setPhase("over", 0);
    this.lockHeroes(true);
    const solo = this.mode !== "pk";
    if (solo) this.score += win ? 3000 : 0;
    this.events.emit("result", {
      win,
      title: win ? "CHIẾN THẮNG" : "THẤT BẠI",
      detail: win ? "Thành phố đã an toàn. Giáp Hào Quang bất bại!" : `Ngã xuống ở ${this.stage.name} — đợt ${this.waveIndex + 1}`,
      score: this.score,
      best: 0,
      mode: this.mode,
    } satisfies ResultData);
    if (win) sfx.win();
    else sfx.lose();
  }

  // ---------- PK ----------

  private startPkRound() {
    this.arenaMin = 0;
    this.arenaMax = ARENA_WIDTH;
    this.pkTimer = 99;
    this.heroes.forEach((h, i) => {
      h.x = i === 0 ? 300 : GAME_WIDTH - 300;
      h.y = GROUND_Y;
      h.vx = h.vy = 0;
      h.facing = i === 0 ? 1 : -1;
      h.status = {};
      if (h.dead) h.revive(1);
      h.hp = h.maxHp;
      h.energy = 20;
      Object.keys(h.cooldowns).forEach((k) => (h.cooldowns[k as keyof typeof h.cooldowns] = 0));
      h.cooldowns.ultimate = 15;
    });
    this.lockHeroes(true);
    this.setPhase("pkIntro", 2);
    this.events.emit("banner", `HIỆP ${this.pkRound}`, "SẴN SÀNG...", 0xffd93a);
  }

  private endPkRound(winner: number | null) {
    this.setPhase("roundEnd", 2.4);
    this.lockHeroes(true);
    if (winner !== null) this.pkWins[winner] += 1;
    const label = winner === null ? "HÒA" : `P${winner + 1} THẮNG HIỆP`;
    this.events.emit("banner", label, `P1 ${this.pkWins[0]} — ${this.pkWins[1]} P2`, winner === null ? 0xffffff : this.heroes[winner].def.color);
    sfx.confirm();
  }

  private afterPkRound() {
    const [a, b] = this.pkWins;
    if (a >= 2 || b >= 2 || this.pkRound >= 3) {
      this.setPhase("over", 0);
      const title = a === b ? "HÒA" : a > b ? "P1 CHIẾN THẮNG" : "P2 CHIẾN THẮNG";
      this.events.emit("result", { win: a !== b, title, detail: `Tỉ số ${a} — ${b}`, score: 0, best: 0, mode: "pk" } satisfies ResultData);
      sfx.win();
      return;
    }
    this.pkRound += 1;
    this.startPkRound();
  }

  // ---------- main loop ----------

  update(_time: number, deltaMs: number) {
    const real = Math.min(deltaMs / 1000, 1 / 30);
    if (this.pauseKeys.some((k) => Phaser.Input.Keyboard.JustDown(k)) || consumeTouch("pause")) {
      if (this.phase !== "over" && this.phase !== "upgrade") this.events.emit("pause");
      return;
    }
    this.heroes.forEach((h) => h.readInput());

    if (this.hitstop > 0) {
      this.hitstop -= real;
      return;
    }
    this.dt = real;

    this.updatePhase(real);
    this.heroes.forEach((h) => h.update(real));
    this.enemies.forEach((e) => e.update(real));
    this.enemies = this.enemies.filter((e) => {
      if (e.removable) e.destroy();
      return !e.removable;
    });
    this.updateProjectiles(real);
    this.updateFields(real);
    this.updateHazards(real);
    this.updatePickups(real);

    this.comboTimer -= real;
    if (this.comboTimer <= 0) this.combo = 0;

    this.updateCamera(real);
    this.bg.tilePositionX = (this.cameras.main.scrollX * 0.35) / this.bgScale;
  }

  private updatePhase(dt: number) {
    this.phaseTimer -= dt;
    switch (this.phase) {
      case "intro":
        if (this.phaseTimer <= 0) this.startWave();
        break;
      case "fight":
        this.spawnTimer -= dt;
        if (this.spawnQueue.length && this.spawnTimer <= 0 && this.aliveEnemies().length < (this.mode === "coop" ? 6 : 4)) {
          this.spawnEnemy(this.spawnQueue.shift()!);
          this.spawnTimer = 0.75;
        }
        if (!this.spawnQueue.length && this.aliveEnemies().length === 0) this.onWaveCleared();
        break;
      case "advance": {
        const nextMin = this.arenaMin + ARENA_WIDTH;
        const alive = this.heroes.filter((h) => !h.dead);
        if (alive.length && alive.every((h) => h.x > nextMin + 260)) {
          this.arenaMin = nextMin;
          this.arenaMax = nextMin + ARENA_WIDTH;
          this.waveIndex += 1;
          this.events.emit("go", false);
          this.startWave();
        }
        break;
      }
      case "stageClear":
        if (this.phaseTimer <= 0) this.afterStageClear();
        break;
      case "pkIntro":
        if (this.phaseTimer <= 0) {
          this.setPhase("pkFight", 0);
          this.lockHeroes(false);
          this.events.emit("banner", "CHIẾN!", "", 0xff4e3a);
          sfx.confirm();
        }
        break;
      case "pkFight": {
        this.pkTimer -= dt;
        const [a, b] = this.heroes;
        if (a.dead || b.dead) this.endPkRound(a.dead && b.dead ? null : a.dead ? 1 : 0);
        else if (this.pkTimer <= 0) this.endPkRound(a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1);
        break;
      }
      case "roundEnd":
        if (this.phaseTimer <= 0) this.afterPkRound();
        break;
    }
  }

  private updateCamera(dt: number) {
    const cam = this.cameras.main;
    let target = this.arenaMin;
    if (this.phase === "advance") {
      const alive = this.heroes.filter((h) => !h.dead);
      const avg = alive.reduce((s, h) => s + h.x, 0) / Math.max(1, alive.length);
      target = Phaser.Math.Clamp(avg - GAME_WIDTH * 0.4, this.arenaMin, this.arenaMin + ARENA_WIDTH);
    }
    cam.scrollX += (target - cam.scrollX) * Math.min(1, dt * 5);
  }

  // ---------- spawning ----------

  aliveEnemies() {
    return this.enemies.filter((e) => !e.dead);
  }

  spawnEnemy(type: EnemyType, side?: "left" | "right") {
    const s = side ? (side === "left" ? -1 : 1) : (this.spawnSide *= -1);
    const x = s > 0 ? this.arenaMax - 70 : this.arenaMin + 70;
    const stageScale = type === "boss" ? 1 : 1 + this.stageIndex * 0.3;
    const coopScale = this.mode === "coop" ? 1.5 : 1;
    const e = new Enemy(this, type, x, stageScale * coopScale);
    e.facing = s > 0 ? -1 : 1;
    this.enemies.push(e);
    if (type === "boss") {
      this.boss = e;
      e.x = this.arenaMax - 260;
      this.fx.shake(0.02, 600);
      this.events.emit("boss", e);
    }
    this.fx.glow(e.x, e.cy, 0xff3355, 3, 400);
  }

  // ---------- combat ----------

  targetsFor(actor: Actor): Actor[] {
    if (actor instanceof Hero) return this.mode === "pk" ? this.heroes.filter((h) => h !== actor) : this.enemies;
    return this.heroes;
  }

  anyHeroAlive() {
    return this.heroes.some((h) => !h.dead);
  }

  dealDamage(attacker: Actor | undefined, target: Actor, hit: Hit): number {
    if (target.dead || target.invuln > 0) return 0;
    let damage = hit.damage;
    let crit = false;
    if (attacker instanceof Hero) {
      damage *= attacker.def.power * attacker.mods.damage;
      if (Math.random() < attacker.mods.crit) {
        damage *= 2;
        crit = true;
      }
      if (this.mode === "pk") damage *= hit.heavy ? 0.6 : 0.65;
    } else if (attacker instanceof Enemy) {
      damage *= 1 + this.stageIndex * 0.15;
    }

    let knock = hit.knock;
    if (target instanceof Enemy) {
      const shield = target.shieldFactor(hit);
      if (shield < 1) {
        damage *= shield;
        knock = (knock ?? 100) * 0.2;
        this.fx.sparks(target.x + target.facing * target.bodyW * 0.4, target.cy, 0x9fe8ff, -target.facing, 8);
        this.fx.label(target.x, target.y - target.bodyH - 20, "CHẶN", "#9fe8ff");
      }
    }

    const dealt = target.takeHit({ ...hit, damage, knock, source: attacker });
    if (dealt <= 0) return 0;

    const heavy = crit || !!hit.heavy;
    this.fx.sparks(target.cx - hit.dir * target.bodyW * 0.2, target.cy, hit.color, hit.dir, heavy ? 10 : 6);
    this.fx.glow(target.cx, target.cy, hit.color, heavy ? 2.4 : 1.4, 140);
    if (target instanceof Enemy || this.mode === "pk") this.fx.number(target.cx, target.y - target.bodyH - 10, dealt, 0xffffff, crit);
    if (crit) sfx.crit();
    else sfx.hit();
    this.hitstop = Math.max(this.hitstop, heavy ? 0.07 : 0.035);
    if (heavy) this.fx.shake(0.005, 90);

    if (attacker instanceof Hero) {
      this.combo += 1;
      this.comboTimer = 2.2;
      attacker.gainEnergy(1);
    }
    return dealt;
  }

  meleeHit(attacker: Actor, rect: Phaser.Geom.Rectangle, hit: Hit) {
    let count = 0;
    for (const t of this.targetsFor(attacker)) {
      if (t.dead) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, t.bounds()) && this.dealDamage(attacker, t, hit) > 0) count += 1;
    }
    return count;
  }

  areaHit(attacker: Actor, cx: number, cy: number, radius: number, hit: Hit, everywhere = false) {
    const circle = new Phaser.Geom.Circle(cx, cy, radius);
    let count = 0;
    for (const t of this.targetsFor(attacker)) {
      if (t.dead) continue;
      if (everywhere || Phaser.Geom.Intersects.CircleToRectangle(circle, t.bounds())) {
        const dir = Math.sign(t.x - attacker.x) || attacker.facing;
        if (this.dealDamage(attacker, t, { ...hit, dir }) > 0) count += 1;
      }
    }
    return count;
  }

  enemyAttack(enemy: Enemy, rect: Phaser.Geom.Rectangle, hit: Hit) {
    this.meleeHit(enemy, rect, { ...hit, source: enemy });
  }

  // ---------- callbacks ----------

  onHeroHurt(hero: Hero, dealt: number) {
    if (this.mode !== "pk") this.combo = 0;
    this.fx.shake(0.004 + Math.min(dealt, 40) / 4000, 140);
    void hero;
  }

  onHeroDown(hero: Hero) {
    this.fx.shake(0.015, 300);
    this.fx.burst(hero.cx, hero.cy, hero.def.color, 20, 600);
    if (this.mode !== "pk" && !this.anyHeroAlive()) this.time.delayedCall(1200, () => this.finish(false));
    else if (this.mode === "coop") this.fx.label(hero.x, hero.y - 190, "Hồi sinh sau 8s", "#ffb0b8");
  }

  onEnemyKilled(enemy: Enemy, hit: Hit) {
    const killer = hit.source instanceof Hero ? hit.source : undefined;
    const mult = 1 + Math.min(this.combo, 50) / 25;
    const points = Math.round(enemy.def.score * mult);
    this.score += points;
    if (killer) {
      killer.kills += 1;
      killer.score += points;
      killer.heal(killer.mods.healOnKill);
    }
    this.fx.burst(enemy.cx, enemy.cy, 0xff9a3a, enemy.isBoss ? 60 : 16, enemy.isBoss ? 1200 : 500, enemy.isBoss ? 1.4 : 0.8);
    this.fx.glow(enemy.cx, enemy.cy, 0xffc070, enemy.isBoss ? 10 : 3, 420);
    sfx.boom();
    this.fx.label(enemy.cx, enemy.y - enemy.bodyH - 30, `+${points}`, "#ffe45c");
    if (enemy.isBoss) {
      this.fx.flash(0xffffff, 400);
      this.fx.shake(0.03, 900);
      for (let i = 0; i < 6; i += 1) {
        this.time.delayedCall(i * 220, () => {
          this.fx.burst(enemy.x + Phaser.Math.Between(-120, 120), enemy.cy + Phaser.Math.Between(-100, 100), 0xffa040, 20, 700, 1.2);
          sfx.boom();
        });
      }
      this.aliveEnemies().forEach((e) => e.takeHit({ damage: 9999, dir: 1, color: 0xffffff }));
      this.events.emit("boss", null);
      this.boss = undefined;
    }
    this.dropLoot(enemy);
  }

  onBossEnrage(boss: Enemy) {
    this.fx.flash(0xff2040, 300);
    this.fx.shake(0.02, 500);
    this.events.emit("toast", "Colossus nổi giận!");
    sfx.warn();
    this.fx.ring(boss.cx, boss.cy, 0xff3355, 400, 600);
  }

  ultimateIntro(hero: Hero, skill: SkillDef) {
    sfx.ultimate();
    this.hitstop = Math.max(this.hitstop, 0.3);
    this.fx.glow(hero.cx, hero.cy, skill.color, 8, 600);
    this.events.emit("cutin", hero, skill);
  }

  // ---------- projectiles & hazards ----------

  spawnProjectile(p: { owner: Actor; x: number; y: number; vx: number; vy: number; size: number; color: number; pierce: number; explodeRadius?: number; chain?: number; hit: Hit }) {
    const img = this.add.image(p.x, p.y, "glow").setTint(p.color).setBlendMode(Phaser.BlendModes.ADD).setScale(p.size / 14).setDepth(DEPTH.projectile);
    const core = this.add.image(p.x, p.y, "dot").setScale(p.size / 14, p.size / 22).setDepth(DEPTH.projectile + 1);
    this.projectiles.push({ ...p, img, core, life: 1.6, hitSet: new Set(), color: p.color });
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.img.setPosition(p.x, p.y).setRotation(Math.atan2(p.vy, p.vx));
      p.core.setPosition(p.x, p.y).setRotation(Math.atan2(p.vy, p.vx));
      if (Math.random() < 0.6) this.fx.burst(p.x, p.y, p.color, 1, 60, p.size / 30);
      const box = new Phaser.Geom.Rectangle(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      for (const t of this.targetsFor(p.owner)) {
        if (t.dead || p.hitSet.has(t) || p.pierce <= 0) continue;
        if (!Phaser.Geom.Intersects.RectangleToRectangle(box, t.bounds())) continue;
        p.hitSet.add(t);
        p.pierce -= 1;
        const dir = Math.sign(p.vx) || 1;
        if (p.explodeRadius) {
          this.explode(p.owner, p.x, p.y, p.explodeRadius, p.hit, p.color);
          p.pierce = 0;
        } else {
          this.dealDamage(p.owner, t, { ...p.hit, dir });
        }
        if (p.chain) this.chainFrom(p.owner, t, p.chain, p.hit, p.color);
      }
      const [minX, maxX] = this.arenaBounds();
      if (p.pierce <= 0 || p.life <= 0 || p.x < minX - 60 || p.x > maxX + 60 || p.y > GROUND_Y) {
        if (p.explodeRadius && p.pierce > 0) this.explode(p.owner, p.x, Math.min(p.y, GROUND_Y - 20), p.explodeRadius, p.hit, p.color);
        p.life = -1;
        this.fx.burst(p.x, p.y, p.color, 6, 240, 0.6);
        p.img.destroy();
        p.core.destroy();
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  private explode(owner: Actor, x: number, y: number, radius: number, hit: Hit, color: number) {
    sfx.boom();
    this.fx.ring(x, y, color, radius);
    this.fx.glow(x, y, color, radius / 18, 320);
    this.fx.burst(x, y, color, 16, 500, 0.9);
    this.fx.shake(0.007, 120);
    this.areaHit(owner, x, y, radius, hit);
  }

  private chainFrom(owner: Actor, from: Actor, count: number, hit: Hit, color: number) {
    const done = new Set<Actor>([from]);
    let cur = from;
    for (let i = 0; i < count; i += 1) {
      const next = this.targetsFor(owner)
        .filter((t) => !t.dead && !done.has(t) && Math.abs(t.x - cur.x) < 360)
        .sort((a, b) => Math.abs(a.x - cur.x) - Math.abs(b.x - cur.x))[0];
      if (!next) return;
      done.add(next);
      this.fx.chain(cur.cx, cur.cy, next.cx, next.cy, color);
      this.dealDamage(owner, next, { ...hit, damage: hit.damage * 0.7, dir: Math.sign(next.x - cur.x) || 1, stun: 0.3 });
      cur = next;
    }
  }

  spawnField(f: { owner: Hero; offset: number; x: number; y: number; radius: number; duration: number; tick: number; color: number; hit: Hit }) {
    const ring = this.add.image(f.x, f.y, "ring").setTint(f.color).setBlendMode(Phaser.BlendModes.ADD).setScale(f.radius / 60, f.radius / 120).setDepth(DEPTH.fx);
    const glow = this.add.image(f.x, f.y, "glow").setTint(f.color).setBlendMode(Phaser.BlendModes.ADD).setScale(f.radius / 22, f.radius / 34).setAlpha(0.5).setDepth(DEPTH.fx - 1);
    this.fields.push({ ...f, time: f.duration, acc: f.tick, ring, glow });
  }

  private updateFields(dt: number) {
    for (const f of this.fields) {
      f.time -= dt;
      if (f.offset === 0) f.x = f.owner.x;
      f.ring.setPosition(f.x, f.y).setRotation(f.ring.rotation + dt * 4);
      f.glow.setPosition(f.x, f.y).setAlpha(0.35 + Math.sin(this.time.now / 70) * 0.15);
      f.acc += dt;
      if (f.acc >= f.tick) {
        f.acc -= f.tick;
        this.areaHit(f.owner, f.x, f.y, f.radius, f.hit);
        this.fx.burst(f.x + Phaser.Math.Between(-f.radius, f.radius) * 0.7, f.y + Phaser.Math.Between(-40, 40), f.hit.color, 3, 200, 0.6, "spark");
      }
      if (f.time <= 0) {
        f.ring.destroy();
        f.glow.destroy();
      }
    }
    this.fields = this.fields.filter((f) => f.time > 0);
  }

  spawnMeteor(owner: Hero, x: number, radius: number, hit: Hit) {
    const startX = x - 260;
    const startY = this.cameras.main.worldView.y - 80;
    const rock = this.add.image(startX, startY, "glow").setTint(hit.color).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4).setDepth(DEPTH.projectile);
    const core = this.add.image(startX, startY, "dot").setTint(0xfff0c0).setScale(2).setDepth(DEPTH.projectile + 1);
    this.tweens.add({
      targets: [rock, core],
      x,
      y: GROUND_Y - 30,
      duration: 380,
      ease: "Quad.easeIn",
      onUpdate: () => this.fx.burst(rock.x, rock.y, hit.color, 2, 120, 0.8),
      onComplete: () => {
        rock.destroy();
        core.destroy();
        this.explode(owner, x, GROUND_Y - 60, radius, hit, hit.color);
      },
    });
  }

  spawnShockwave(owner: Enemy, x: number, dir: number, speed: number, damage: number) {
    const view = this.add.image(x, GROUND_Y - 30, "glow").setTint(0x6fb6ff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.6, 2.4).setDepth(DEPTH.fx);
    this.hazards.push({ owner, rect: new Phaser.Geom.Rectangle(x - 30, GROUND_Y - 60, 60, 60), vx: dir * speed, life: 2.2, hitSet: new Set(), damage, view, kind: "shock" });
  }

  spawnBeam(owner: Enemy, x0: number, x1: number, y: number, height: number, damage: number) {
    sfx.boom();
    this.fx.shake(0.012, 400);
    const view = this.add.rectangle((x0 + x1) / 2, y, x1 - x0, height, 0x6fb6ff, 0.55).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
    const core = this.add.rectangle((x0 + x1) / 2, y, x1 - x0, height * 0.35, 0xffffff, 0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx + 1);
    this.hazards.push({ owner, rect: new Phaser.Geom.Rectangle(x0, y - height / 2, x1 - x0, height), vx: 0, life: 0.5, hitSet: new Set(), damage, view, core, kind: "beam" });
  }

  private updateHazards(dt: number) {
    for (const h of this.hazards) {
      h.life -= dt;
      h.rect.x += h.vx * dt;
      if (h.kind === "shock") {
        (h.view as Phaser.GameObjects.Image).setPosition(h.rect.centerX, GROUND_Y - 30).setScale(1.6 + Math.random() * 0.4, 2.2 + Math.random() * 0.8);
        if (Math.random() < 0.5) this.fx.burst(h.rect.centerX, GROUND_Y - 10, 0x9fd0ff, 2, 260, 0.7, "spark");
      } else {
        h.view.setScale(1, 0.8 + Math.random() * 0.4);
        h.core?.setScale(1, 0.6 + Math.random() * 0.6);
      }
      for (const hero of this.heroes) {
        if (hero.dead || h.hitSet.has(hero)) continue;
        if (Phaser.Geom.Intersects.RectangleToRectangle(h.rect, hero.bounds())) {
          if (this.dealDamage(h.owner, hero, { damage: h.damage, dir: Math.sign(hero.x - h.owner.x) || 1, knock: 460, launch: 420, color: 0x6fb6ff }) > 0) h.hitSet.add(hero);
        }
      }
      const [minX, maxX] = this.arenaBounds();
      if (h.life <= 0 || h.rect.right < minX || h.rect.left > maxX) {
        h.life = -1;
        h.view.destroy();
        h.core?.destroy();
      }
    }
    this.hazards = this.hazards.filter((h) => h.life > 0);
  }

  // ---------- pickups ----------

  private dropLoot(enemy: Enemy) {
    const drops: Pickup["kind"][] = ["coin"];
    const r = Math.random();
    if (enemy.isBoss) drops.push("health", "energy", "coin", "coin");
    else if (r < 0.22) drops.push("health");
    else if (r < 0.5) drops.push("energy");
    drops.forEach((kind, i) => {
      const key = kind === "health" ? "item_health" : kind === "energy" ? "item_energy" : "item_coin";
      const x = Phaser.Math.Clamp(enemy.x + (i - drops.length / 2) * 40, this.arenaMin + 40, this.arenaMax - 40);
      const img = this.add.image(x, enemy.cy, key).setScale(kind === "coin" ? 0.45 : 0.6).setDepth(DEPTH.projectile);
      this.pickups.push({ kind, img, x, y: Math.min(enemy.cy, GROUND_Y - 40), vy: -420 - Math.random() * 200, life: 12 });
    });
  }

  private updatePickups(dt: number) {
    for (const p of this.pickups) {
      p.life -= dt;
      p.vy += 1800 * dt;
      p.y = Math.min(GROUND_Y - 24, p.y + p.vy * dt);
      if (p.y >= GROUND_Y - 24) p.vy = 0;
      const bob = p.vy === 0 ? Math.sin(this.time.now / 200 + p.x) * 5 : 0;
      p.img.setPosition(p.x, p.y + bob).setAlpha(p.life < 2 ? (Math.floor(p.life * 8) % 2 ? 0.3 : 1) : 1);
      const hero = this.heroes.find((h) => !h.dead && Math.abs(h.x - p.x) < 60 && Math.abs(h.y - 60 - p.y) < 110);
      if (hero && p.vy === 0) {
        p.life = -1;
        sfx.pickup();
        if (p.kind === "health") {
          hero.heal(45);
          this.fx.label(hero.x, hero.y - 170, "+45 HP", "#7dff9a");
        } else if (p.kind === "energy") {
          hero.gainEnergy(30);
          this.fx.label(hero.x, hero.y - 170, "+30 NL", "#7de8ff");
        } else {
          this.score += 50;
          hero.score += 50;
        }
        this.fx.burst(p.x, p.y, 0xffffff, 8, 200, 0.5);
      }
      if (p.life <= 0) p.img.destroy();
    }
    this.pickups = this.pickups.filter((p) => p.life > 0);
  }
}
