import Phaser from "phaser";
import { FONT, GAME_HEIGHT, GAME_WIDTH, hex, loadBest, saveBest, type SkillSlot } from "../config/constants";
import type { Upgrade } from "../config/content";
import { STAGES } from "../config/content";
import type { SkillDef } from "../config/heroes";
import type { Enemy } from "../entities/Enemy";
import type { Hero } from "../entities/Hero";
import { heroKey } from "../systems/assets";
import { setSceneFlag } from "../systems/controls";
import { sfx } from "../systems/sfx";
import type { GameScene, ResultData } from "./GameScene";
import { Button, ButtonGroup, text } from "../ui/widgets";

const SLOTS: SkillSlot[] = ["basic", "skill1", "skill2", "ultimate"];
const SLOT_KEYS: Record<0 | 1, string[]> = { 0: ["J", "K", "L", "U"], 1: ["1", "2", "3", "4"] };

type Panel = {
  hero: Hero;
  hp: Phaser.GameObjects.Rectangle;
  hpTrail: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
  energy: Phaser.GameObjects.Rectangle;
  energyText: Phaser.GameObjects.Text;
  slots: { icon: Phaser.GameObjects.Image; shade: Phaser.GameObjects.Graphics; cd: Phaser.GameObjects.Text; frame: Phaser.GameObjects.Arc; slot: SkillSlot }[];
  portrait: Phaser.GameObjects.Image;
  trail: number;
};

const BAR_W = 250;

export class UIScene extends Phaser.Scene {
  private game_!: GameScene;
  private panels: Panel[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private comboShown = 0;
  private bossBar?: { root: Phaser.GameObjects.Container; fill: Phaser.GameObjects.Rectangle; trail: Phaser.GameObjects.Rectangle; boss: Enemy; t: number };
  private goArrow!: Phaser.GameObjects.Container;
  private overlay?: { root: Phaser.GameObjects.Container; group: ButtonGroup; extraKeys?: Phaser.Input.Keyboard.Key[] };
  private pauseKeys: Phaser.Input.Keyboard.Key[] = [];

  constructor() {
    super("ui");
  }

  create() {
    this.game_ = this.scene.get("game") as GameScene;
    this.panels = [];
    this.overlay = undefined;
    this.bossBar = undefined;
    this.comboShown = 0;

    this.game_.heroes.forEach((h, i) => this.panels.push(this.buildPanel(h, i)));

    this.scoreText = text(this, GAME_WIDTH / 2, 18, "", 30, "#ffffff", "900").setOrigin(0.5, 0);
    this.stageText = text(this, GAME_WIDTH / 2, 54, "", 15, "#9fb8cc", "700").setOrigin(0.5, 0);
    this.comboText = text(this, GAME_WIDTH - 40, 250, "", 44, "#ffe45c", "900").setOrigin(1, 0.5).setAlpha(0);

    this.goArrow = this.add.container(GAME_WIDTH - 90, GAME_HEIGHT / 2 - 40).setVisible(false);
    this.goArrow.add([
      text(this, 0, -40, "TIẾN LÊN", 22, "#7dffb0", "900").setOrigin(0.5),
      this.add.triangle(0, 20, 0, 0, 0, 60, 46, 30, 0x7dffb0).setOrigin(0.5),
    ]);
    this.tweens.add({ targets: this.goArrow, x: GAME_WIDTH - 70, yoyo: true, repeat: -1, duration: 350 });

    const ev = this.game_.events;
    const handlers: [string, (...args: never[]) => void][] = [
      ["banner", (t: string, s: string, c: number) => this.banner(t, s, c)],
      ["toast", (t: string) => this.toast(t)],
      ["go", (on: boolean) => this.goArrow.setVisible(on)],
      ["boss", (b: Enemy | null) => this.setBoss(b)],
      ["cutin", (h: Hero, s: SkillDef) => this.cutin(h, s)],
      ["pause", () => this.openPause()],
      ["upgrade", (c: Upgrade[]) => this.openUpgrade(c)],
      ["result", (r: ResultData) => this.openResult(r)],
    ];
    handlers.forEach(([name, fn]) => ev.on(name, fn, this));
    this.events.once("shutdown", () => handlers.forEach(([name, fn]) => ev.off(name, fn, this)));

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.pauseKeys = [K.P, K.ESC].map((k) => this.input.keyboard!.addKey(k));
  }

  // ---------- HUD ----------

  private buildPanel(hero: Hero, index: number): Panel {
    const right = index === 1;
    const x = right ? GAME_WIDTH - 24 : 24;
    const dir = right ? -1 : 1;
    const color = hero.def.color;
    const root = this.add.container(0, 0);

    const plate = this.add.graphics();
    plate.fillStyle(0x02070d, 0.72).fillRoundedRect(right ? x - 370 : x, 14, 370, 132, 14);
    plate.lineStyle(2, color, 0.5).strokeRoundedRect(right ? x - 370 : x, 14, 370, 132, 14);
    root.add(plate);

    const px = x + dir * 52;
    const ring = this.add.circle(px, 62, 38, 0x0a1a2c).setStrokeStyle(3, color);
    const key = heroKey(hero.def.id, "idle");
    const portrait = this.add.image(px, 62, key);
    const src = portrait.frame;
    // Crop to the helmet so the portrait reads at small size.
    portrait.setCrop(0, 0, src.width, src.height * 0.42).setOrigin(0.5, 0.2).setScale(120 / src.width).setFlipX(right);
    root.add([ring, portrait]);
    const tag = text(this, px, 108, `P${index + 1}`, 15, hex(color), "900").setOrigin(0.5);
    root.add(tag);

    const bx = right ? x - 112 - BAR_W : x + 112;
    root.add(text(this, right ? bx + BAR_W : bx, 22, hero.def.name.toUpperCase(), 17, "#ffffff", "900").setOrigin(right ? 1 : 0, 0));
    root.add(this.add.rectangle(bx, 50, BAR_W, 16, 0x1b0a10).setOrigin(0, 0).setStrokeStyle(1, 0xffffff, 0.25));
    const hpTrail = this.add.rectangle(bx, 50, BAR_W, 16, 0xff5a6a).setOrigin(0, 0);
    const hp = this.add.rectangle(bx, 50, BAR_W, 16, 0x52f08a).setOrigin(0, 0);
    const hpText = text(this, bx + BAR_W / 2, 58, "", 12, "#ffffff", "800").setOrigin(0.5);
    root.add([hpTrail, hp, hpText]);
    root.add(this.add.rectangle(bx, 72, BAR_W, 9, 0x0a1622).setOrigin(0, 0).setStrokeStyle(1, 0xffffff, 0.2));
    const energy = this.add.rectangle(bx, 72, BAR_W, 9, 0x3ad6ff).setOrigin(0, 0);
    const energyText = text(this, right ? bx : bx + BAR_W, 84, "", 11, "#9fe8ff", "800").setOrigin(right ? 0 : 1, 0);
    root.add([energy, energyText]);

    const slots: Panel["slots"] = [];
    SLOTS.forEach((slot, i) => {
      const sx = right ? bx + BAR_W - 22 - (3 - i) * 56 : bx + 22 + i * 56;
      const sy = 120;
      const frame = this.add.circle(sx, sy, 22, 0x02070d).setStrokeStyle(2, color, 0.6);
      const icon = this.add.image(sx, sy, `${hero.def.id}_icon_${slot}`).setDisplaySize(40, 40);
      const shade = this.add.graphics();
      const cd = text(this, sx, sy, "", 15, "#ffffff", "900").setOrigin(0.5);
      const keyLabel = text(this, sx + 16, sy + 14, SLOT_KEYS[index as 0 | 1][i], 11, "#ffe45c", "900").setOrigin(0.5);
      root.add([frame, icon, shade, cd, keyLabel]);
      slots.push({ icon, shade, cd, frame, slot });
    });

    return { hero, hp, hpTrail, hpText, energy, energyText, slots, portrait, trail: 1 };
  }

  update(_t: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    const game = this.game_;
    if (!game.heroes.length) return;

    for (const p of this.panels) this.updatePanel(p, dt);

    if (game.mode === "pk") {
      this.scoreText.setText(String(Math.max(0, Math.ceil(game.pkTimer))));
      this.scoreText.setColor(game.pkTimer < 10 ? "#ff5a6a" : "#ffffff");
      this.stageText.setText(`HIỆP ${game.pkRound}  ·  ${"●".repeat(game.pkWins[0])}${"○".repeat(2 - game.pkWins[0])}  vs  ${"●".repeat(game.pkWins[1])}${"○".repeat(2 - game.pkWins[1])}`);
    } else {
      this.scoreText.setText(String(game.score).padStart(6, "0"));
      const stage = STAGES[game.stageIndex];
      this.stageText.setText(`${stage.subtitle.toUpperCase()} · ${stage.name.toUpperCase()} · ĐỢT ${game.waveIndex + 1}/${stage.waves.length}`);
    }

    if (game.combo >= 3 && game.mode !== "pk") {
      if (game.combo !== this.comboShown) {
        this.comboText.setText(`${game.combo} COMBO`).setAlpha(1).setScale(1.3);
        this.tweens.add({ targets: this.comboText, scale: 1, duration: 140, ease: "Back.easeOut" });
      }
    } else if (this.comboText.alpha > 0) {
      this.comboText.setAlpha(Math.max(0, this.comboText.alpha - dt * 3));
    }
    this.comboShown = game.combo;

    if (this.bossBar) {
      const b = this.bossBar;
      const ratio = Math.max(0, b.boss.hp / b.boss.maxHp);
      b.fill.width = 620 * ratio;
      b.t += (ratio - b.t) * Math.min(1, dt * 2.5);
      b.trail.width = 620 * b.t;
      b.fill.setFillStyle(b.boss.enraged ? 0xff3355 : 0xb06cff);
    }

    this.overlay?.group.update();
  }

  private updatePanel(p: Panel, dt: number) {
    const h = p.hero;
    const ratio = Math.max(0, h.hp / h.maxHp);
    p.hp.width = BAR_W * ratio;
    p.hp.setFillStyle(ratio < 0.3 ? 0xff5a6a : ratio < 0.6 ? 0xffc84a : 0x52f08a);
    p.trail += (ratio - p.trail) * Math.min(1, dt * 3);
    if (p.trail < ratio) p.trail = ratio;
    p.hpTrail.width = BAR_W * p.trail;
    p.hpText.setText(h.dead ? (this.game_.mode === "coop" && this.game_.anyHeroAlive() ? `HỒI SINH ${Math.ceil(h.reviveTimer)}s` : "GỤC NGÃ") : `${Math.ceil(h.hp)} / ${h.maxHp}`);
    const full = h.energy >= 100;
    p.energy.width = BAR_W * (h.energy / 100);
    p.energy.setFillStyle(full ? (Math.floor(this.time.now / 150) % 2 ? 0xffe45c : 0xffffff) : 0x3ad6ff);
    p.energyText.setText(full ? "TUYỆT KỸ SẴN SÀNG!" : `NĂNG LƯỢNG ${Math.floor(h.energy)}`).setColor(full ? "#ffe45c" : "#9fe8ff");
    p.portrait.setAlpha(h.dead ? 0.35 : 1);

    for (const s of p.slots) {
      s.shade.clear();
      if (s.slot === "basic") continue;
      const skill = h.def.skills[s.slot];
      const cd = h.cooldowns[s.slot];
      const max = skill.cooldown * (s.slot === "ultimate" ? 1 : h.mods.cooldown);
      const lacking = h.energy < skill.cost;
      if (cd > 0) {
        s.shade.fillStyle(0x000000, 0.65).slice(s.icon.x, s.icon.y, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd / max), false).fillPath();
        s.cd.setText(cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1));
      } else {
        s.cd.setText("");
      }
      s.icon.setAlpha(lacking ? 0.35 : 1);
      const ready = s.slot === "ultimate" && !lacking && cd <= 0;
      s.frame.setStrokeStyle(ready ? 3 : 2, ready ? 0xffe45c : h.def.color, ready ? 1 : 0.6);
    }
  }

  private setBoss(boss: Enemy | null) {
    this.bossBar?.root.destroy();
    this.bossBar = undefined;
    if (!boss) return;
    const y = GAME_HEIGHT - 44;
    const root = this.add.container(GAME_WIDTH / 2, y);
    root.add(this.add.rectangle(0, 0, 640, 34, 0x02070d, 0.85).setStrokeStyle(2, 0xb06cff));
    const trail = this.add.rectangle(-310, 0, 620, 16, 0xffffff, 0.7).setOrigin(0, 0.5);
    const fill = this.add.rectangle(-310, 0, 620, 16, 0xb06cff).setOrigin(0, 0.5);
    root.add([trail, fill, text(this, 0, -30, boss.def.name.toUpperCase(), 18, "#e6c8ff", "900").setOrigin(0.5)]);
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 400 });
    this.bossBar = { root, fill, trail, boss, t: 1 };
  }

  // ---------- announcements ----------

  banner(title: string, sub: string, color: number) {
    const root = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60).setDepth(50);
    const band = this.add.rectangle(0, 0, GAME_WIDTH, 150, 0x02070d, 0.75);
    const line1 = this.add.rectangle(0, -75, GAME_WIDTH, 3, color);
    const line2 = this.add.rectangle(0, 75, GAME_WIDTH, 3, color);
    const t = text(this, 0, sub ? -18 : 0, title, 64, hex(color), "900").setOrigin(0.5);
    const s = text(this, 0, 42, sub, 24, "#eaf8ff", "700").setOrigin(0.5);
    root.add([band, line1, line2, t, s]);
    root.setScale(1, 0);
    this.tweens.add({ targets: root, scaleY: 1, duration: 180, ease: "Back.easeOut" });
    this.tweens.add({ targets: t, x: { from: -60, to: 0 }, duration: 400, ease: "Cubic.easeOut" });
    this.tweens.add({ targets: root, alpha: 0, delay: 1600, duration: 300, onComplete: () => root.destroy() });
  }

  toast(message: string) {
    const t = text(this, GAME_WIDTH / 2, 120, message, 26, "#ffffff", "900").setOrigin(0.5).setAlpha(0).setDepth(40);
    this.tweens.add({ targets: t, alpha: 1, y: 100, duration: 200 });
    this.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 300, onComplete: () => t.destroy() });
  }

  private cutin(hero: Hero, skill: SkillDef) {
    const fromLeft = hero.index === 0;
    const root = this.add.container(0, GAME_HEIGHT / 2).setDepth(60);
    const band = this.add.rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH, 190, hero.def.color, 0.22).setBlendMode(Phaser.BlendModes.ADD);
    const dark = this.add.rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH, 170, 0x02070d, 0.8);
    const art = this.add.image(fromLeft ? 260 : GAME_WIDTH - 260, 0, `${hero.def.id}_art`).setScale(0.62).setFlipX(!fromLeft);
    art.setCrop(0, 30, art.width, 280);
    const name = text(this, fromLeft ? 470 : GAME_WIDTH - 470, -10, skill.name.toUpperCase(), 56, hex(hero.def.color), "900").setOrigin(fromLeft ? 0 : 1, 0.5);
    const sub = text(this, fromLeft ? 474 : GAME_WIDTH - 474, 40, "TUYỆT KỸ", 20, "#ffffff", "800").setOrigin(fromLeft ? 0 : 1, 0.5);
    root.add([band, dark, art, name, sub]);
    root.setX(fromLeft ? -GAME_WIDTH : GAME_WIDTH);
    this.tweens.add({ targets: root, x: 0, duration: 160, ease: "Cubic.easeOut" });
    this.tweens.add({ targets: art, x: art.x + (fromLeft ? 40 : -40), duration: 700 });
    this.tweens.add({ targets: root, alpha: 0, delay: 650, duration: 200, onComplete: () => root.destroy() });
  }

  // ---------- overlays ----------

  private dim() {
    return this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.78).setInteractive();
  }

  private closeOverlay() {
    this.overlay?.group.destroy();
    this.overlay?.root.destroy();
    this.overlay = undefined;
  }

  private openPause() {
    if (this.overlay) return;
    this.scene.pause("game");
    const root = this.add.container(0, 0).setDepth(100);
    root.add(this.dim());
    root.add(text(this, GAME_WIDTH / 2, 190, "TẠM DỪNG", 64, "#9ff8ff", "900").setOrigin(0.5));
    const cx = GAME_WIDTH / 2;
    const resume = () => {
      this.closeOverlay();
      this.game_.resumeFromPause();
      this.scene.resume("game");
    };
    const mute = new Button(this, cx, 470, 340, 56, "", () => {
      sfx.toggleMute();
      mute.setCaption(`Âm thanh: ${sfx.isMuted() ? "TẮT" : "BẬT"}`);
    });
    mute.setCaption(`Âm thanh: ${sfx.isMuted() ? "TẮT" : "BẬT"}`);
    const buttons = [
      new Button(this, cx, 290, 340, 56, "Tiếp tục", resume),
      new Button(this, cx, 350, 340, 56, "Chơi lại", () => this.restart()),
      new Button(this, cx, 410, 340, 56, "Về menu", () => this.toMenu()),
      mute,
    ];
    root.add(buttons);
    root.add(text(this, cx, 560, "Nhấn P hoặc Esc để tiếp tục", 16, "#7f95a8", "700").setOrigin(0.5));
    const group = new ButtonGroup(this, buttons);
    group.reset();
    this.overlay = { root, group };
    this.pauseKeys.forEach((k) => k.reset());
    const onKey = () => {
      if (this.overlay?.root === root) resume();
    };
    this.pauseKeys.forEach((k) => k.once("down", onKey));
    root.once("destroy", () => this.pauseKeys.forEach((k) => k.off("down", onKey)));
  }

  private openUpgrade(choices: Upgrade[]) {
    this.scene.pause("game");
    const root = this.add.container(0, 0).setDepth(100);
    root.add(this.dim());
    root.add(text(this, GAME_WIDTH / 2, 120, "CHỌN NÂNG CẤP GIÁP", 48, "#ffe45c", "900").setOrigin(0.5));
    root.add(text(this, GAME_WIDTH / 2, 170, "Áp dụng cho toàn đội trước khi vào màn tiếp theo", 18, "#9fb8cc", "700").setOrigin(0.5));
    const buttons = choices.map((u, i) => {
      const x = GAME_WIDTH / 2 + (i - 1) * 330;
      const card = new Button(this, x, 390, 300, 320, "", () => {
        this.closeOverlay();
        this.scene.resume("game");
        this.game_.chooseUpgrade(u);
      }, 0xffe45c, true);
      card.add([
        this.add.image(0, -70, u.icon).setScale(1.3),
        text(this, 0, 30, u.name, 26, "#ffffff", "900").setOrigin(0.5),
        this.add.text(0, 90, u.desc, { fontFamily: FONT, fontSize: "18px", color: "#c8dcea", align: "center", wordWrap: { width: 250 } }).setOrigin(0.5),
      ]);
      return card;
    });
    root.add(buttons);
    root.add(text(this, GAME_WIDTH / 2, 600, "A/D chọn · J/Enter xác nhận", 16, "#7f95a8", "700").setOrigin(0.5));
    const group = new ButtonGroup(this, buttons, true);
    group.reset();
    this.overlay = { root, group };
  }

  private openResult(r: ResultData) {
    this.closeOverlay();
    if (r.mode !== "pk") saveBest(r.score);
    const best = loadBest();
    const root = this.add.container(0, 0).setDepth(100);
    root.add(this.dim().setAlpha(0.85));
    const color = r.win ? "#ffe45c" : "#ff5a6a";
    root.add(text(this, GAME_WIDTH / 2, 170, r.title, 76, color, "900").setOrigin(0.5));
    root.add(text(this, GAME_WIDTH / 2, 240, r.detail, 22, "#c8dcea", "700").setOrigin(0.5));
    if (r.mode !== "pk") {
      root.add(text(this, GAME_WIDTH / 2, 310, `ĐIỂM  ${r.score}`, 40, "#ffffff", "900").setOrigin(0.5));
      root.add(text(this, GAME_WIDTH / 2, 356, r.score >= best && r.score > 0 ? "KỶ LỤC MỚI!" : `Kỷ lục: ${best}`, 20, "#9fe8ff", "800").setOrigin(0.5));
      const lines = this.game_.heroes.map((h) => `P${h.index + 1} ${h.def.name}: ${h.kills} hạ gục`).join("     ");
      root.add(text(this, GAME_WIDTH / 2, 396, lines, 18, "#9fb8cc", "700").setOrigin(0.5));
    }
    const buttons = [
      new Button(this, GAME_WIDTH / 2 - 180, 500, 320, 60, "Chơi lại", () => this.restart()),
      new Button(this, GAME_WIDTH / 2 + 180, 500, 320, 60, "Về menu", () => this.toMenu()),
    ];
    root.add(buttons);
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 400 });
    const group = new ButtonGroup(this, buttons, true);
    group.reset();
    this.overlay = { root, group };
  }

  private restart() {
    const data = { mode: this.game_.mode, heroes: this.game_.heroIds };
    this.closeOverlay();
    this.scene.stop("game");
    this.scene.start("game", data);
  }

  private toMenu() {
    this.closeOverlay();
    this.scene.stop("game");
    setSceneFlag("menu");
    this.scene.start("menu");
  }
}
