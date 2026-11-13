import Phaser from "phaser";
import { hex } from "../../config/constants";
import { ENEMIES, parseWaveEntry, STAGES } from "../../config/content";
import { stageStars, stageUnlocked } from "../../systems/save";
import { sfx } from "../../systems/sfx";
import { text } from "../../ui/widgets";
import { fmtTime, HAZARD_LABEL, type Flow } from "./data";
import { MenuScreen } from "./MenuScreen";
import { body, GOLD, lockIcon, MUTED, panel, shake, starText, Tile, type Focusable } from "./ui";

class StageNode extends Phaser.GameObjects.Container implements Focusable {
  rect: Phaser.Geom.Rectangle;
  onHover?: () => void;
  private ring: Phaser.GameObjects.Graphics;
  private focused = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly index: number,
    readonly locked: boolean,
    private onPress: () => void,
  ) {
    super(scene, x, y);
    const st = STAGES[index];
    const r = 34;
    this.rect = new Phaser.Geom.Rectangle(x - 70, y - r, 140, 110);
    const glow = scene.add.image(0, 0, "glow").setScale(1.4).setTint(st.accent).setAlpha(locked ? 0 : 0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.ring = scene.add.graphics();
    this.add([glow, this.ring]);
    if (locked) this.add(lockIcon(scene, 0, 2, 24, 0x7f8fa0));
    else this.add(text(scene, 0, 0, `${index + 1}`, 28, "#ffffff", "900").setOrigin(0.5));
    this.add(body(scene, 0, r + 8, st.name, 14, locked ? "#6f7f90" : "#eaf8ff", { weight: "800", align: "center" }).setOrigin(0.5, 0));
    this.add(starText(scene, 0, r + 30, stageStars(index), 17).setOrigin(0.5, 0).setAlpha(locked ? 0.4 : 1));
    const zone = scene.add.zone(0, 10, 140, 110).setInteractive({ useHandCursor: true });
    zone.on("pointerdown", () => this.onPress());
    this.add(zone);
    scene.add.existing(this);
    this.draw();
  }

  setFocus(on: boolean) {
    this.focused = on;
    this.draw();
    this.scene.tweens.add({ targets: this, scale: on ? 1.12 : 1, duration: 140, ease: "Back.easeOut" });
  }

  activate() {
    this.onPress();
  }

  deny() {
    sfx.warn();
    shake(this.scene, this, this.rect.centerX);
  }

  private draw() {
    const st = STAGES[this.index];
    const g = this.ring;
    g.clear();
    g.fillStyle(this.locked ? 0x16202b : 0x0a1a2c, 1).fillCircle(0, 0, 34);
    g.lineStyle(this.focused ? 5 : 3, this.locked ? 0x3a4a5a : st.accent, this.focused || !this.locked ? 1 : 0.6).strokeCircle(0, 0, 34);
    if (this.focused) g.lineStyle(2, 0xffffff, 0.9).strokeCircle(0, 0, 42);
  }
}

export class StageSelectScene extends MenuScreen {
  private flow!: Flow;
  private nodes: StageNode[] = [];
  private detail!: Phaser.GameObjects.Container;
  private thumb!: Phaser.GameObjects.TileSprite;
  private go_!: Tile;

  constructor() {
    super("menu_stage");
  }

  create(flow: Flow) {
    this.flow = { ...flow };
    this.nodes = [];
    const total = STAGES.reduce((s, _x, i) => s + stageStars(i), 0);
    this.setupScreen({
      title: "CHỌN MÀN CHƠI",
      subtitle: `CHIẾN DỊCH  ·  ★ ${total}/${STAGES.length * 3}`,
      hint: "A / D: chọn màn   ·   J / Enter: vào màn   ·   Chạm một màn để xem, chạm lần nữa để chọn   ·   Esc: quay lại",
    });

    panel(this, 36, 96, 1208, 262, { alpha: 0.6, stroke: 0x18e6ff, strokeAlpha: 0.2, radius: 18 });
    const pos = STAGES.map((_s, i) => ({ x: 146 + i * 198, y: i % 2 === 0 ? 176 : 250 }));
    const path = this.add.graphics();
    for (let i = 0; i < pos.length - 1; i += 1) {
      const open = stageUnlocked(i + 1);
      path.lineStyle(10, open ? STAGES[i + 1].accent : 0x223344, open ? 0.18 : 0.5).lineBetween(pos[i].x, pos[i].y, pos[i + 1].x, pos[i + 1].y);
      path.lineStyle(3, open ? STAGES[i + 1].accent : 0x334455, open ? 0.85 : 0.6).lineBetween(pos[i].x, pos[i].y, pos[i + 1].x, pos[i + 1].y);
    }
    STAGES.forEach((_s, i) => {
      const node = new StageNode(this, pos[i].x, pos[i].y, i, !stageUnlocked(i), () => this.pressNode(i));
      this.nodes.push(this.addFocusable(node));
      node.onHover = undefined;
    });

    panel(this, 36, 372, 1208, 304, { alpha: 0.85, stroke: 0x18e6ff, strokeAlpha: 0.25, radius: 18 });
    const src = this.textures.get(STAGES[0].background).getSourceImage();
    this.thumb = this.add.tileSprite(56, 392, 400, 264, STAGES[0].background).setOrigin(0).setTileScale(264 / src.height);
    this.detail = this.add.container(0, 0);
    this.go_ = new Tile(this, 960, 600, 264, 60, { title: "VÀO MÀN  ›", titleSize: 22, align: "center", accent: GOLD, onPress: () => this.next() });
    this.go_.onHover = () => this.go_.setFocus(true);
    this.go_.on("hoverout", () => this.go_.setFocus(false));

    let start = this.flow.stage;
    if (start === undefined) {
      const firstOpen = STAGES.findIndex((_s, i) => stageUnlocked(i) && stageStars(i) === 0);
      start = firstOpen >= 0 ? firstOpen : 0;
    }
    this.focus(start, true);
  }

  protected onDirection(dir: "up" | "down" | "left" | "right") {
    const step = dir === "left" || dir === "up" ? -1 : 1;
    this.focus(Phaser.Math.Clamp(this.focusIndex + step, 0, STAGES.length - 1));
    return true;
  }

  protected onConfirmKey() {
    this.next();
    return true;
  }

  protected onBack() {
    this.go("menu_heroes", { mode: this.flow.mode });
  }

  private pressNode(i: number) {
    if (this.focusIndex === i) this.next();
    else this.focus(i);
  }

  protected onFocusChanged(i: number) {
    const st = STAGES[i];
    const locked = !stageUnlocked(i);
    const src = this.textures.get(st.background).getSourceImage();
    this.thumb.setTexture(st.background).setTileScale(264 / src.height).setTint(locked ? 0x445566 : st.bgTint);
    this.thumb.tilePositionX = i * 140;

    const d = this.detail;
    d.removeAll(true);
    d.add(text(this, 480, 392, st.subtitle.toUpperCase(), 14, hex(st.accent), "900").setLetterSpacing(3));
    d.add(text(this, 478, 412, st.name, 32, "#ffffff", "900"));
    d.add(starText(this, 1224, 414, stageStars(i), 30).setOrigin(1, 0));
    d.add(body(this, 480, 460, st.story, 16, "#c8dcea", { wrap: 740 }));

    const bosses = st.waves.flat().map((e) => parseWaveEntry(e).type).filter((t) => ENEMIES[t].bossBar);
    const facts: [string, string][] = [
      ["Bẫy môi trường", HAZARD_LABEL[st.hazard]],
      ["Thời gian chuẩn", fmtTime(st.par)],
      ["Số đợt", `${st.waves.length} đợt`],
      ["Trùm", bosses.length ? [...new Set(bosses.map((b) => ENEMIES[b].name))].join(", ") : "Không"],
    ];
    facts.forEach(([k, v], j) => {
      const x = 480 + (j % 2) * 250;
      const y = 520 + Math.floor(j / 2) * 46;
      d.add(body(this, x, y, k, 13, MUTED, { weight: "800" }));
      d.add(body(this, x, y + 17, v, 16, "#ffffff", { weight: "900" }));
    });
    d.add(body(this, 480, 612, "★ hoàn thành   ·   ★★ không gục ngã   ·   ★★★ dưới thời gian chuẩn", 14, hex(GOLD), { weight: "800" }));
    if (locked) {
      const shade = this.add.rectangle(256, 524, 400, 264, 0x02070d, 0.45);
      d.add(shade);
      d.add(lockIcon(this, 256, 500, 48, 0xc8dcea));
      d.add(body(this, 256, 546, `Hoàn thành Màn ${i} để mở khóa`, 17, "#eaf8ff", { weight: "900" }).setOrigin(0.5, 0));
    }
    this.go_.setVisible(!locked);
  }

  private next() {
    const i = this.focusIndex;
    if (!stageUnlocked(i)) {
      this.nodes[i].deny();
      return;
    }
    sfx.confirm();
    this.go("menu_difficulty", { mode: "campaign", heroes: this.flow.heroes, stage: i });
  }
}
