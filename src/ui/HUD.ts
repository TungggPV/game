import Phaser from "phaser";
import { DEPTHS, GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { HeroConfig, heroPortraitKey } from "../config/heroes";
import {
  BasicAttackConfig,
  INPUT_LABELS,
  SkillConfig,
  basicAttackIconKey,
  getBasicAttackForHero,
  getSkillsForHero,
  skillIconKey,
} from "../config/skills";
import { Player } from "../entities/Player";
import { padScore } from "../utils/geometry";

export type EnemyBarState = {
  name: string;
  hp: number;
  maxHp: number;
};

type SkillSlot = {
  skill: SkillConfig;
  icon?: Phaser.GameObjects.Image;
  fallback: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  keyText: Phaser.GameObjects.Text;
  cooldown: Phaser.GameObjects.Text;
};

export class HUD {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly portraitFrames: Phaser.GameObjects.Image[] = [];
  private readonly portraits: Phaser.GameObjects.Image[] = [];
  private readonly nameTexts: Phaser.GameObjects.Text[] = [];
  private readonly hpTexts: Phaser.GameObjects.Text[] = [];
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly bossText: Phaser.GameObjects.Text;
  private readonly dashHint: Phaser.GameObjects.Text;
  private basicSlot?: Omit<SkillSlot, "skill"> & { attack: BasicAttackConfig };
  private skillSlots: SkillSlot[] = [];
  private skillHeroId = "";

  constructor(private readonly scene: Phaser.Scene, players: Player[]) {
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(DEPTHS.hud);
    for (let i = 0; i < players.length; i++) this.createPlayerHudObjects(i, players[i].hero);
    this.scoreText = scene.add
      .text(GAME_WIDTH - 32, 26, "SCORE 0000", {
        fontFamily: "Arial, sans-serif",
        fontSize: "24px",
        fontStyle: "900",
        color: "#f5fdff",
        stroke: "#02070d",
        strokeThickness: 5,
      })
      .setOrigin(1, 0)
      .setShadow(0, 0, "#18e6ff", 8, true, true)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 6);
    this.bossText = scene.add
      .text(GAME_WIDTH / 2, 12, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        fontStyle: "900",
        color: "#ffd7d7",
        stroke: "#180204",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 6);
    this.dashHint = scene.add
      .text(0, 0, "SHIFT/F\nDASH", {
        fontFamily: "Arial, sans-serif",
        fontSize: "9px",
        fontStyle: "900",
        align: "center",
        color: "#dffcff",
        stroke: "#02070d",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 6);
    if (players[0]) this.rebuildSkillBar(players[0].hero);
  }

  update(players: Player[], score: number, enemyBar?: EnemyBarState) {
    this.scoreText.setText(`SCORE ${padScore(score)}`);
    if (players[0] && players[0].hero.id !== this.skillHeroId) this.rebuildSkillBar(players[0].hero);

    this.graphics.clear();
    this.drawPlayerPanels(players);
    this.drawSkillBar(players[0]);
    this.drawEnemyBar(enemyBar);
  }

  destroy() {
    this.graphics.destroy();
    this.scoreText.destroy();
    this.bossText.destroy();
    this.dashHint.destroy();
    for (const item of [...this.portraitFrames, ...this.portraits, ...this.nameTexts, ...this.hpTexts]) item.destroy();
    this.destroySkillSlots();
  }

  private createPlayerHudObjects(index: number, hero: HeroConfig) {
    const y = 30 + index * 86;
    const frame = this.scene.add
      .image(60, y + 38, "ui-portrait-frame")
      .setDisplaySize(index === 0 ? 76 : 64, index === 0 ? 76 : 64)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 3);
    const portrait = this.scene.add
      .image(60, y + 38, heroPortraitKey(hero))
      .setDisplaySize(index === 0 ? 64 : 52, index === 0 ? 64 : 52)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 4);
    const name = this.scene.add
      .text(116, y + 4, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: index === 0 ? "16px" : "13px",
        fontStyle: "900",
        color: "#eaf8ff",
        stroke: "#03101d",
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 6);
    const hp = this.scene.add
      .text(304, y + 33, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: index === 0 ? "13px" : "11px",
        fontStyle: "900",
        color: "#eaf8ff",
        stroke: "#03101d",
        strokeThickness: 3,
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTHS.hud + 6);
    this.portraitFrames.push(frame);
    this.portraits.push(portrait);
    this.nameTexts.push(name);
    this.hpTexts.push(hp);
  }

  private drawPlayerPanels(players: Player[]) {
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const hero = player.hero;
      const y = 24 + i * 86;
      const w = i === 0 ? 356 : 300;
      const h = i === 0 ? 76 : 66;
      this.drawSlantedPanel(24, y, w, h, hero.themeColor, i === 0 ? 0.88 : 0.72);

      const portraitKey = heroPortraitKey(hero);
      this.portraitFrames[i].setPosition(60, y + h / 2);
      this.portraits[i].setPosition(60, y + h / 2);
      if (this.scene.textures.exists(portraitKey) && this.portraits[i].texture.key !== portraitKey) {
        this.portraits[i].setTexture(portraitKey);
      }
      this.nameTexts[i]
        .setPosition(116, y + 7)
        .setText(`${i === 0 ? "P1" : "P2"}  ${hero.displayName.toUpperCase()}`)
        .setColor(hero.themeCss);
      this.hpTexts[i].setPosition(304, y + 35).setText(`${Math.ceil(player.hp)} / ${player.maxHp}`);

      this.drawHoloBar(116, y + 32, i === 0 ? 196 : 166, 15, player.hp / player.maxHp, 0x1af071, 0xb8ffc7, hero.themeColor);
      this.drawHoloBar(116, y + 53, i === 0 ? 172 : 142, 11, player.energy / player.maxEnergy, hero.themeColor, 0xf0feff, hero.themeColor);
    }
  }

  private drawSkillBar(player?: Player) {
    if (!player) return;
    const startX = GAME_WIDTH / 2 - 168;
    const y = GAME_HEIGHT - 92;
    this.drawSlantedPanel(startX - 112, y - 10, 486, 84, player.hero.themeColor, 0.82);

    if (this.basicSlot) {
      const x = startX - 84;
      const state = player.getBasicAttackState();
      const glow = state.glow > 0 ? 0.82 : 0.28;
      const basicAlpha = state.cooldownPct > 0 ? 0.48 : 0.92;
      this.graphics.fillStyle(0x03101d, 0.9);
      this.graphics.fillRoundedRect(x, y + 10, 58, 52, 7);
      this.graphics.lineStyle(state.glow > 0 ? 3 : 1, this.basicSlot.attack.effectColor, glow);
      this.graphics.strokeRoundedRect(x, y + 10, 58, 52, 7);
      this.basicSlot.icon?.setAlpha(basicAlpha).setPosition(x + 29, y + 29);
      this.basicSlot.fallback.setAlpha(this.basicSlot.icon ? 0 : basicAlpha).setPosition(x + 29, y + 29);
      this.basicSlot.keyText.setPosition(x + 8, y + 15);
      this.basicSlot.label.setPosition(x + 29, y + 55).setAlpha(0.92);
      this.basicSlot.cooldown.setPosition(x + 29, y + 30);
      if (state.cooldownPct > 0) {
        this.graphics.fillStyle(0x02070d, 0.5);
        this.graphics.fillRoundedRect(x + 5, y + 15, 48, 42 * state.cooldownPct, 5);
        this.basicSlot.cooldown.setText(state.cooldownRemaining.toFixed(1)).setVisible(true);
      } else {
        this.basicSlot.cooldown.setVisible(false);
      }
    }

    for (let i = 0; i < this.skillSlots.length; i++) {
      const slot = this.skillSlots[i];
      const x = startX + i * 100;
      const state = player.getSkillState(slot.skill);
      const dim = state.enoughEnergy ? 1 : 0.38;
      const iconAlpha = state.cooldownPct > 0 ? Math.min(dim, 0.42) : dim;
      const glow = state.glow > 0 ? 0.9 : 0.34;

      this.graphics.fillStyle(0x03101d, 0.94);
      this.graphics.fillRoundedRect(x, y, 76, 68, 7);
      this.graphics.lineStyle(state.glow > 0 ? 3 : 1, slot.skill.effectColor, glow);
      this.graphics.strokeRoundedRect(x, y, 76, 68, 7);
      this.graphics.fillStyle(slot.skill.effectColor, 0.16);
      this.graphics.fillTriangle(x + 4, y + 4, x + 32, y + 4, x + 4, y + 32);

      slot.icon?.setAlpha(iconAlpha).setPosition(x + 38, y + 25);
      slot.fallback.setAlpha(slot.icon ? 0 : iconAlpha).setPosition(x + 38, y + 25);
      slot.keyText.setPosition(x + 9, y + 8);
      slot.label.setPosition(x + 38, y + 56).setAlpha(dim);
      slot.cooldown.setPosition(x + 38, y + 27);

      if (state.cooldownPct > 0) {
        this.graphics.fillStyle(0x02070d, 0.72);
        this.graphics.fillRoundedRect(x + 5, y + 5, 66, 58 * state.cooldownPct, 5);
        slot.cooldown.setText(state.cooldownRemaining.toFixed(1)).setVisible(true);
      } else {
        slot.cooldown.setVisible(false);
      }
    }

    this.graphics.fillStyle(0x061727, 0.88);
    this.graphics.fillRoundedRect(startX + 300, y + 12, 58, 44, 6);
    this.graphics.lineStyle(1, player.hero.themeColor, 0.45);
    this.graphics.strokeRoundedRect(startX + 300, y + 12, 58, 44, 6);
    this.dashHint.setPosition(startX + 329, y + 34).setAlpha(0.92);
  }

  private drawEnemyBar(enemyBar?: EnemyBarState) {
    this.bossText.setVisible(Boolean(enemyBar));
    if (!enemyBar) return;

    const pct = Phaser.Math.Clamp(enemyBar.hp / enemyBar.maxHp, 0, 1);
    const x = GAME_WIDTH / 2 - 240;
    this.drawSlantedPanel(x, 36, 480, 30, 0xff5b6d, 0.88);
    this.graphics.fillStyle(0x250509, 0.95);
    this.graphics.fillRoundedRect(x + 10, 44, 460, 14, 5);
    this.graphics.fillStyle(0xff3655, 0.96);
    this.graphics.fillRoundedRect(x + 12, 46, Math.max(0, 456 * pct), 10, 4);
    this.graphics.fillStyle(0xffb1b1, 0.34);
    this.graphics.fillRoundedRect(x + 12, 46, Math.max(0, 456 * pct), 3, 2);
    this.bossText.setText(enemyBar.name).setVisible(true);
  }

  private rebuildSkillBar(hero: HeroConfig) {
    this.destroySkillSlots();
    this.skillHeroId = hero.id;
    const basicAttack = getBasicAttackForHero(hero.id);
    const skills = getSkillsForHero(hero.id);
    const startX = GAME_WIDTH / 2 - 168;
    const y = GAME_HEIGHT - 92;

    if (basicAttack) {
      const x = startX - 84;
      const iconKey = basicAttackIconKey(basicAttack);
      const icon = this.scene.textures.exists(iconKey)
        ? this.scene.add
          .image(x + 29, y + 29, iconKey)
          .setDisplaySize(30, 30)
          .setScrollFactor(0)
          .setDepth(DEPTHS.hud + 5)
        : undefined;
      const fallback = this.scene.add
        .text(x + 29, y + 29, "J", {
          fontFamily: "Arial, sans-serif",
          fontSize: "16px",
          fontStyle: "900",
          color: basicAttack.themeCss,
          stroke: "#02070d",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTHS.hud + 5)
        .setVisible(!icon);
      const keyText = this.scene.add
        .text(x + 8, y + 15, "J", {
          fontFamily: "Arial, sans-serif",
          fontSize: "10px",
          fontStyle: "900",
          color: "#02070d",
          backgroundColor: basicAttack.themeCss,
          padding: { x: 4, y: 1 },
        })
        .setScrollFactor(0)
        .setDepth(DEPTHS.hud + 6);
      const label = this.scene.add
        .text(x + 29, y + 55, "BASIC", {
          fontFamily: "Arial, sans-serif",
          fontSize: "8px",
          fontStyle: "900",
          color: "#dffcff",
          align: "center",
          stroke: "#02070d",
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTHS.hud + 6);
      const cooldown = this.scene.add
        .text(x + 29, y + 30, "", {
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
          fontStyle: "900",
          color: "#ffffff",
          stroke: "#02070d",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTHS.hud + 7)
        .setVisible(false);
      this.basicSlot = { attack: basicAttack, icon, fallback, label, keyText, cooldown };
    }

    this.skillSlots = skills.map((skill, index) => {
      const x = startX + index * 100;
      const iconKey = skillIconKey(skill);
      const icon = this.scene.textures.exists(iconKey)
        ? this.scene.add
          .image(x + 38, y + 25, iconKey)
          .setDisplaySize(38, 38)
          .setScrollFactor(0)
          .setDepth(DEPTHS.hud + 5)
        : undefined;
      const fallback = this.scene.add
        .text(x + 38, y + 25, skill.name.split(" ").map((part) => part[0]).join("").slice(0, 2), {
          fontFamily: "Arial, sans-serif",
          fontSize: "18px",
          fontStyle: "900",
          color: skill.themeCss,
          stroke: "#02070d",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTHS.hud + 5)
        .setVisible(!icon);
      const keyText = this.scene.add
        .text(x + 9, y + 8, INPUT_LABELS[skill.input], {
          fontFamily: "Arial, sans-serif",
          fontSize: "11px",
          fontStyle: "900",
          color: "#02070d",
          backgroundColor: skill.themeCss,
          padding: { x: 4, y: 1 },
        })
        .setScrollFactor(0)
        .setDepth(DEPTHS.hud + 6);
      const label = this.scene.add
        .text(x + 38, y + 56, skill.name, {
          fontFamily: "Arial, sans-serif",
          fontSize: "8px",
          fontStyle: "900",
          color: "#eaf8ff",
          align: "center",
          stroke: "#02070d",
          strokeThickness: 2,
          wordWrap: { width: 70 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTHS.hud + 6);
      const cooldown = this.scene.add
        .text(x + 38, y + 27, "", {
          fontFamily: "Arial, sans-serif",
          fontSize: "16px",
          fontStyle: "900",
          color: "#ffffff",
          stroke: "#02070d",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTHS.hud + 7)
        .setVisible(false);

      return { skill, icon, fallback, label, keyText, cooldown };
    });
  }

  private destroySkillSlots() {
    if (this.basicSlot) {
      this.basicSlot.icon?.destroy();
      this.basicSlot.fallback.destroy();
      this.basicSlot.label.destroy();
      this.basicSlot.keyText.destroy();
      this.basicSlot.cooldown.destroy();
      this.basicSlot = undefined;
    }
    for (const slot of this.skillSlots) {
      slot.icon?.destroy();
      slot.fallback.destroy();
      slot.label.destroy();
      slot.keyText.destroy();
      slot.cooldown.destroy();
    }
    this.skillSlots = [];
  }

  private drawSlantedPanel(x: number, y: number, width: number, height: number, line: number, alpha: number) {
    const bevel = Math.min(18, width * 0.08);
    const points = [
      new Phaser.Geom.Point(x + bevel, y),
      new Phaser.Geom.Point(x + width, y),
      new Phaser.Geom.Point(x + width - bevel, y + height),
      new Phaser.Geom.Point(x, y + height),
    ];
    this.graphics.fillStyle(0x020b18, alpha);
    this.graphics.fillPoints(points, true);
    this.graphics.lineStyle(2, line, 0.72);
    this.graphics.strokePoints(points, true);
    this.graphics.lineStyle(1, 0xffffff, 0.16);
    this.graphics.lineBetween(x + bevel + 4, y + 4, x + width - 20, y + 4);
  }

  private drawHoloBar(x: number, y: number, width: number, height: number, pct: number, fill: number, highlight: number, frame: number) {
    const clamped = Phaser.Math.Clamp(pct, 0, 1);
    this.graphics.fillStyle(0x02070d, 0.92);
    this.graphics.fillRoundedRect(x, y, width, height, 5);
    this.graphics.fillStyle(fill, 0.96);
    this.graphics.fillRoundedRect(x + 3, y + 3, Math.max(0, (width - 6) * clamped), height - 6, 4);
    this.graphics.fillStyle(highlight, 0.34);
    this.graphics.fillRoundedRect(x + 4, y + 4, Math.max(0, (width - 8) * clamped), Math.max(2, height * 0.25), 2);
    this.graphics.lineStyle(1, frame, 0.76);
    this.graphics.strokeRoundedRect(x, y, width, height, 5);
    this.graphics.lineStyle(1, 0xffffff, 0.13);
    for (let sx = x + 28; sx < x + width - 8; sx += 32) this.graphics.lineBetween(sx, y + 2, sx - 6, y + height - 2);
  }
}
