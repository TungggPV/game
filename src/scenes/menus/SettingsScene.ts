import Phaser from "phaser";
import { hex } from "../../config/constants";
import { DIFFICULTIES } from "../../config/meta";
import { resetProfile, saveProfile, settings, type Settings } from "../../systems/save";
import { music, sfx } from "../../systems/sfx";
import { text, toast } from "../../ui/widgets";
import { MenuScreen, type Dir } from "./MenuScreen";
import { body, CYAN, MUTED, RED, Tile } from "./ui";

const ROW_X = 220;
const ROW_W = 840;
const ROW_H = 66;
const CTRL_X = ROW_W / 2 - 24; // right edge of the control area, relative to row center

type Row = { tile: Tile; ctrl: Phaser.GameObjects.Container; draw: () => void; change: (dir: -1 | 1) => void; press: () => void };

export class SettingsScene extends MenuScreen {
  private rows: Row[] = [];
  private sliding = false;

  constructor() {
    super("menu_settings");
  }

  create(data?: { reset?: boolean }) {
    this.rows = [];
    this.sliding = false;
    this.setupScreen({
      title: "CÀI ĐẶT",
      subtitle: "ÂM THANH · HIỂN THỊ · DỮ LIỆU",
      hint: "W / S: chọn mục   ·   A / D: điều chỉnh   ·   J / Enter: bật/tắt   ·   Esc / K: quay lại",
    });

    const s = settings();
    this.addRow("Âm lượng", "Hiệu ứng âm thanh và nhạc", (c) => this.drawSlider(c), (d) => this.setVolume(s.volume + d * 0.05), () => undefined);
    this.addToggle("Nhạc nền", "Nhạc điện tử trong sảnh và trận đấu", "music", (on) => music.play("menu", on));
    this.addToggle("Rung màn hình", "Rung khi đòn đánh mạnh trúng đích", "shake");
    this.addToggle("Hiện số sát thương", "Số sát thương bay lên khi đánh trúng", "damageNumbers");
    this.addRow(
      "Độ khó mặc định",
      "Được chọn sẵn khi bắt đầu trận",
      (c) => this.drawDifficulty(c),
      (d) => this.setDifficulty(DIFFICULTIES.findIndex((x) => x.id === settings().difficulty) + d),
      () => this.setDifficulty(DIFFICULTIES.findIndex((x) => x.id === settings().difficulty) + 1),
    );
    this.addRow("Xóa dữ liệu", "Xóa tín dụng, cấp, sao, thành tựu và cài đặt", (c) => this.drawDanger(c), () => undefined, () => this.confirmReset(), RED);

    body(this, 640, 600, "Thiết lập được lưu tự động trên trình duyệt này.", 15, MUTED, { weight: "700" }).setOrigin(0.5);
    this.focus(0, true);
    if (data?.reset) toast(this, "Đã xóa dữ liệu", "Hồ sơ đã được làm mới hoàn toàn", RED);

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.sliding && p.isDown) this.volumeFromPointer(p.x);
    });
    this.input.on("pointerup", () => {
      if (this.sliding) sfx.select();
      this.sliding = false;
    });
  }

  private addRow(label: string, sub: string, draw: (c: Phaser.GameObjects.Container) => void, change: (d: -1 | 1) => void, press: () => void, accent = CYAN) {
    const i = this.rows.length;
    const tile = new Tile(this, ROW_X, 104 + i * 78, ROW_W, ROW_H, { title: label, sub, titleSize: 20, subSize: 13, accent, onPress: () => this.rows[i].press() });
    const ctrl = this.add.container(0, 0);
    tile.add(ctrl);
    const row: Row = { tile, ctrl, draw: () => { ctrl.removeAll(true); draw(ctrl); }, change, press };
    this.rows.push(row);
    this.addFocusable(tile);
    row.draw();
  }

  private addToggle(label: string, sub: string, key: "music" | "shake" | "damageNumbers", after?: (on: boolean) => void) {
    const flip = () => {
      const st = settings();
      st[key] = !st[key];
      saveProfile();
      after?.(st[key]);
      sfx.select();
      this.rows.forEach((r) => r.draw());
    };
    this.addRow(label, sub, (c) => this.drawToggle(c, settings()[key]), flip, flip);
  }

  protected onDirection(dir: Dir) {
    if (dir === "left" || dir === "right") {
      this.rows[this.focusIndex]?.change(dir === "left" ? -1 : 1);
      return true;
    }
    return false;
  }

  // ---------- controls ----------

  private drawToggle(c: Phaser.GameObjects.Container, on: boolean) {
    const g = this.add.graphics();
    const x = CTRL_X - 76;
    g.fillStyle(on ? CYAN : 0x1d2b3a, 1).fillRoundedRect(x, -16, 76, 32, 16);
    g.fillStyle(on ? 0x02070d : 0x8fa6ba, 1).fillCircle(on ? x + 60 : x + 16, 0, 11);
    c.add(g);
    c.add(text(this, x - 14, 0, on ? "BẬT" : "TẮT", 17, on ? hex(CYAN) : "#8fa6ba", "900").setOrigin(1, 0.5));
  }

  private drawSlider(c: Phaser.GameObjects.Container) {
    const v = settings().volume;
    const x0 = CTRL_X - 380;
    const w = 300;
    const g = this.add.graphics();
    g.fillStyle(0x1d2b3a, 1).fillRoundedRect(x0, -5, w, 10, 5);
    g.fillStyle(CYAN, 1).fillRoundedRect(x0, -5, Math.max(10, w * v), 10, 5);
    g.fillStyle(0xffffff, 1).fillCircle(x0 + w * v, 0, 12);
    g.lineStyle(3, CYAN, 1).strokeCircle(x0 + w * v, 0, 12);
    c.add(g);
    c.add(text(this, CTRL_X, 0, `${Math.round(v * 100)}%`, 20, "#ffffff", "900").setOrigin(1, 0.5));
    const zone = this.add.zone(x0 - 14, -ROW_H / 2, w + 28, ROW_H).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.focus(0, true);
      this.sliding = true;
      this.volumeFromPointer(p.x);
    });
    c.add(zone);
  }

  private volumeFromPointer(px: number) {
    const tile = this.rows[0].tile;
    const local = px - tile.x - (CTRL_X - 380);
    this.setVolume(local / 300, true);
  }

  private setVolume(v: number, silent = false) {
    const st = settings();
    const next = Math.round(Phaser.Math.Clamp(v, 0, 1) * 100) / 100;
    if (next === st.volume) return;
    st.volume = next;
    sfx.setVolume(next);
    saveProfile();
    if (!silent) sfx.select();
    this.rows[0].draw();
  }

  private drawDifficulty(c: Phaser.GameObjects.Container) {
    const cur = settings().difficulty;
    const w = 104;
    DIFFICULTIES.forEach((d, i) => {
      const x = CTRL_X - (DIFFICULTIES.length - i) * (w + 8) + 8;
      const on = d.id === cur;
      const g = this.add.graphics();
      g.fillStyle(on ? d.color : 0x0d2236, on ? 1 : 0.9).fillRoundedRect(x, -18, w, 36, 18);
      g.lineStyle(2, d.color, on ? 1 : 0.5).strokeRoundedRect(x, -18, w, 36, 18);
      c.add(g);
      c.add(body(this, x + w / 2, 0, d.name, 15, on ? "#02070d" : hex(d.color), { weight: "900" }).setOrigin(0.5));
      const zone = this.add.zone(x, -18, w, 36).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => {
        this.focus(4, true);
        this.setDifficulty(i);
      });
      c.add(zone);
    });
  }

  private setDifficulty(i: number) {
    const n = DIFFICULTIES.length;
    settings().difficulty = DIFFICULTIES[((i % n) + n) % n].id;
    saveProfile();
    sfx.select();
    this.rows[4].draw();
  }

  private drawDanger(c: Phaser.GameObjects.Container) {
    const g = this.add.graphics();
    g.fillStyle(RED, 0.18).fillRoundedRect(CTRL_X - 150, -18, 150, 36, 18);
    g.lineStyle(2, RED, 0.9).strokeRoundedRect(CTRL_X - 150, -18, 150, 36, 18);
    c.add(g);
    c.add(text(this, CTRL_X - 75, 0, "XÓA", 17, "#ff8a8a", "900").setOrigin(0.5));
  }

  private confirmReset() {
    this.openConfirm(
      "XÓA TOÀN BỘ DỮ LIỆU?",
      "Tín dụng, cấp anh hùng, sao chiến dịch, thành tựu, nâng cấp và cài đặt sẽ bị xóa vĩnh viễn. Không thể hoàn tác.",
      "Xóa vĩnh viễn",
      () => {
        resetProfile();
        const s: Settings = settings();
        sfx.setVolume(s.volume);
        music.play("menu", s.music);
        this.scene.restart({ reset: true });
      },
    );
  }
}
