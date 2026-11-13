import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, hex, loadBest, type GameMode } from "../config/constants";
import { HEROES } from "../config/heroes";
import { heroKey } from "../systems/assets";
import { setSceneFlag } from "../systems/controls";
import { sfx } from "../systems/sfx";
import { Button, text } from "../ui/widgets";

const MODES: { id: GameMode; label: string; hint: string }[] = [
  { id: "solo", label: "1 NGƯỜI", hint: "Vượt 3 màn, hạ trùm Abyssal Colossus" },
  { id: "coop", label: "CO-OP 2P", hint: "Hai người cùng bàn phím, cùng chiến đấu" },
  { id: "pk", label: "ĐỐI KHÁNG", hint: "P1 đấu P2 · thắng 2/3 hiệp" },
];

const STAT_LABELS: [keyof (typeof HEROES)[number]["stats"], string][] = [
  ["atk", "Công"],
  ["def", "Thủ"],
  ["spd", "Tốc"],
  ["skill", "Kỹ năng"],
];

export class MenuScene extends Phaser.Scene {
  private mode = 0;
  private picks: [number, number] = [0, 1];
  private modeButtons: Button[] = [];
  private cards: { root: Phaser.GameObjects.Container; frame: Phaser.GameObjects.Rectangle; p1: Phaser.GameObjects.Text; p2: Phaser.GameObjects.Text }[] = [];
  private detail!: Phaser.GameObjects.Container;
  private art!: Phaser.GameObjects.Image;
  private artGlow!: Phaser.GameObjects.Image;
  private modeHint!: Phaser.GameObjects.Text;
  private bg!: Phaser.GameObjects.TileSprite;
  private help?: Phaser.GameObjects.Container;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super("menu");
  }

  create() {
    setSceneFlag("menu");
    this.cards = [];
    this.modeButtons = [];
    this.help = undefined;

    const src = this.textures.get("bg_city_neon").getSourceImage();
    this.bg = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg_city_neon").setOrigin(0).setTileScale(GAME_HEIGHT / src.height);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.55).setOrigin(0);
    this.add.rectangle(0, 0, 640, GAME_HEIGHT, 0x02070d, 0.6).setOrigin(0);

    text(this, 60, 38, "ELEMENT ARMOR", 18, "#18e6ff", "900").setLetterSpacing(6);
    text(this, 56, 58, "HÀO QUANG GIÁP", 54, "#ffffff", "900");
    text(this, GAME_WIDTH - 40, 40, `KỶ LỤC ${loadBest()}`, 18, "#ffe45c", "900").setOrigin(1, 0);

    MODES.forEach((m, i) => {
      const b = new Button(this, 130 + i * 190, 162, 176, 44, m.label, () => this.setMode(i));
      this.modeButtons.push(b);
    });
    this.modeHint = text(this, 44, 194, "", 15, "#9fb8cc", "700");

    this.artGlow = this.add.image(950, 280, "glow").setBlendMode(Phaser.BlendModes.ADD).setScale(9).setAlpha(0.5);
    this.art = this.add.image(950, 270, `${HEROES[0].id}_art`).setScale(0.85);
    this.tweens.add({ targets: this.art, y: 252, yoyo: true, repeat: -1, duration: 1600, ease: "Sine.easeInOut" });

    this.detail = this.add.container(60, 226);

    HEROES.forEach((h, i) => {
      const x = 690 + i * 132;
      const root = this.add.container(x, 548);
      const frame = this.add.rectangle(0, 0, 124, 124, 0x0a1a2c, 0.95).setOrigin(0).setStrokeStyle(2, h.color, 0.4);
      const idle = this.add.image(62, 118, heroKey(h.id, "idle")).setOrigin(0.5, 1);
      idle.setScale(104 / idle.height);
      const p1 = text(this, 6, 4, "P1", 15, "#18e6ff", "900");
      const p2 = text(this, 118, 4, "P2", 15, "#ff6a8a", "900").setOrigin(1, 0);
      root.add([frame, idle, p1, p2]);
      frame.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.pick(0, i));
      this.cards.push({ root, frame, p1, p2 });
    });
    text(this, 690, 684, "P1: A/D  ·  P2: ←/→  ·  Tab: đổi chế độ  ·  H: hướng dẫn", 14, "#7f95a8", "700");

    new Button(this, 230, 652, 340, 60, "BẮT ĐẦU", () => this.start(), 0xffe45c).setSelected(true);
    new Button(this, 520, 652, 200, 48, "Hướng dẫn (H)", () => this.toggleHelp());

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      a: K.A, d: K.D, left: K.LEFT, right: K.RIGHT, tab: K.TAB, enter: K.ENTER, j: K.J, space: K.SPACE, h: K.H, esc: K.ESC,
    }) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture([K.TAB, K.SPACE]);
    this.input.once("pointerdown", () => sfx.unlock());
    this.input.keyboard!.once("keydown", () => sfx.unlock());

    this.setMode(this.mode, true);
    this.refresh();
  }

  update(_t: number, dms: number) {
    this.bg.tilePositionX += dms * 0.01;
    const jd = (k: string) => Phaser.Input.Keyboard.JustDown(this.keys[k]);
    if (this.help) {
      if (jd("h") || jd("esc") || jd("enter") || jd("j")) this.toggleHelp();
      return;
    }
    if (jd("a")) this.pick(0, this.picks[0] - 1);
    if (jd("d")) this.pick(0, this.picks[0] + 1);
    if (this.mode > 0) {
      if (jd("left")) this.pick(1, this.picks[1] - 1);
      if (jd("right")) this.pick(1, this.picks[1] + 1);
    }
    if (jd("tab")) this.setMode(this.mode + 1);
    if (jd("h")) this.toggleHelp();
    if (jd("enter") || jd("j") || jd("space")) this.start();
  }

  private setMode(i: number, silent = false) {
    this.mode = (i + MODES.length) % MODES.length;
    this.modeButtons.forEach((b, j) => b.setSelected(j === this.mode));
    this.modeHint.setText(MODES[this.mode].hint);
    if (!silent) sfx.select();
    this.refresh();
  }

  private pick(player: 0 | 1, i: number) {
    this.picks[player] = (i + HEROES.length) % HEROES.length;
    sfx.select();
    this.refresh();
  }

  private refresh() {
    const twoPlayer = this.mode > 0;
    this.cards.forEach((c, i) => {
      const sel1 = this.picks[0] === i;
      const sel2 = twoPlayer && this.picks[1] === i;
      c.frame.setStrokeStyle(sel1 || sel2 ? 4 : 2, sel1 ? 0x18e6ff : sel2 ? 0xff6a8a : HEROES[i].color, sel1 || sel2 ? 1 : 0.35);
      c.frame.setFillStyle(sel1 || sel2 ? 0x14304a : 0x0a1a2c, 0.95);
      c.p1.setVisible(sel1);
      c.p2.setVisible(sel2);
      c.root.y = sel1 ? 540 : 548;
    });

    const hero = HEROES[this.picks[0]];
    this.art.setTexture(`${hero.id}_art`).setScale(0.85);
    this.artGlow.setTint(hero.color);
    this.art.setAlpha(0).setX(990);
    this.tweens.add({ targets: this.art, alpha: 1, x: 950, duration: 220, ease: "Cubic.easeOut" });

    this.detail.removeAll(true);
    const d = this.detail;
    d.add(text(this, 0, 0, hero.name.toUpperCase(), 36, hex(hero.color), "900"));
    d.add(text(this, 0, 44, hero.role, 17, "#c8dcea", "700"));
    STAT_LABELS.forEach(([k, label], i) => {
      const y = 82 + i * 22;
      d.add(text(this, 0, y, label, 14, "#9fb8cc", "700"));
      for (let s = 0; s < 5; s += 1) d.add(this.add.rectangle(80 + s * 30, y + 4, 26, 10, s < hero.stats[k] ? hero.color : 0x1d2b3a).setOrigin(0));
    });
    const skills = [
      { key: "J", slot: "basic", name: hero.basic.name, desc: hero.basic.desc },
      ...(["skill1", "skill2", "ultimate"] as const).map((s, i) => ({ key: ["K", "L", "U"][i], slot: s, name: hero.skills[s].name, desc: hero.skills[s].desc })),
    ];
    skills.forEach((s, i) => {
      const y = 186 + i * 50;
      d.add(this.add.image(20, y + 18, `${hero.id}_icon_${s.slot}`).setDisplaySize(38, 38));
      d.add(text(this, 48, y, `${s.key} · ${s.name}`, 17, "#ffffff", "800"));
      d.add(text(this, 48, y + 22, s.desc, 14, "#9fb8cc", "600"));
    });
    if (twoPlayer) {
      const p2 = HEROES[this.picks[1]];
      d.add(text(this, 630, 286, `P2 chọn: ${p2.name}`, 17, "#ff6a8a", "900"));
    }
  }

  private toggleHelp() {
    if (this.help) {
      this.help.destroy();
      this.help = undefined;
      return;
    }
    sfx.select();
    const root = this.add.container(0, 0).setDepth(10);
    root.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02070d, 0.92).setOrigin(0).setInteractive().on("pointerdown", () => this.toggleHelp()));
    root.add(text(this, GAME_WIDTH / 2, 70, "HƯỚNG DẪN", 44, "#18e6ff", "900").setOrigin(0.5));
    const col = (x: number, title: string, lines: string[], color: string) => {
      root.add(text(this, x, 130, title, 24, color, "900"));
      lines.forEach((l, i) => root.add(text(this, x, 172 + i * 32, l, 18, "#eaf8ff", "700")));
    };
    col(110, "P1 / 1 NGƯỜI", ["A / D — di chuyển", "W / Space — nhảy (nhảy kép)", "Shift / F — lướt né (bất tử ngắn)", "J — đánh thường (combo 3)", "K / L — kỹ năng 1 / 2", "U hoặc I — tuyệt kỹ (100 năng lượng)", "P / Esc — tạm dừng"], "#18e6ff");
    col(700, "P2", ["← / → — di chuyển", "↑ — nhảy", "↓ hoặc Numpad 0 — lướt", "Numpad 1 hoặc , — đánh thường", "Numpad 2/3 hoặc . / — kỹ năng", "Numpad 4 hoặc ' — tuyệt kỹ"], "#ff6a8a");
    const tips = [
      "• Đánh trúng và nhận đòn đều nạp năng lượng. Kỹ năng tiêu năng lượng.",
      "• Kẻ địch nháy đỏ và hiện dấu ! trước khi tấn công — hãy lướt hoặc nhảy né.",
      "• Aegis Elite chặn đòn thường phía trước: đánh từ sau lưng hoặc dùng kỹ năng.",
      "• Sóng xung kích của trùm chạy dọc mặt đất — nhảy qua. Tia laser — nhảy kép hoặc lướt.",
      "• Sau mỗi màn được chọn một nâng cấp giáp.",
    ];
    tips.forEach((t, i) => root.add(text(this, 110, 430 + i * 30, t, 17, "#c8dcea", "600")));
    root.add(text(this, GAME_WIDTH / 2, 680, "Nhấn H / Esc hoặc chạm để đóng", 15, "#7f95a8", "700").setOrigin(0.5));
    this.help = root;
  }

  private start() {
    sfx.unlock();
    sfx.confirm();
    const mode = MODES[this.mode].id;
    const heroes = mode === "solo" ? [HEROES[this.picks[0]].id] : [HEROES[this.picks[0]].id, HEROES[this.picks[1]].id];
    this.cameras.main.fadeOut(250, 2, 7, 13);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start("game", { mode, heroes }));
  }
}
