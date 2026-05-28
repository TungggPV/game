import Phaser from "phaser";
import { AssetKeys, REQUIRED_RUNTIME_ASSETS } from "../config/assets";
import { HEROES, HeroSpriteName, allHeroAssets, heroDynamicKey, heroTextureKey } from "../config/heroes";
import { allSkillAssets } from "../config/skills";

type LoadableAsset = {
  key: string;
  path: string;
};

export class BootScene extends Phaser.Scene {
  private readonly missingAssets: string[] = [];

  constructor() {
    super("BootScene");
  }

  preload() {
    const assets: LoadableAsset[] = [...REQUIRED_RUNTIME_ASSETS, ...allHeroAssets(), ...allSkillAssets()];
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      const src = typeof file.src === "string" ? file.src : String(file.url);
      this.missingAssets.push(src);
    });
    for (const asset of assets) {
      this.load.image(asset.key, asset.path);
    }
  }

  create() {
    this.createEffectFallbacks();
    this.removeNewHeroWhiteBackdrops();
    this.registry.set("missingAssets", this.missingAssets);
    this.scene.start("MenuScene");
  }

  private createEffectFallbacks() {
    this.ensureSlashTexture(AssetKeys.slash1);
    this.ensureSlashTexture(AssetKeys.slash2);
    this.ensureEnergySheet();
    this.ensureHitSparkSheet();
    this.ensureExplosionSheet();
  }

  private ensureSlashTexture(key: string) {
    if (this.textures.exists(key)) return;
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.lineStyle(18, 0x95fbff, 0.88);
    graphics.beginPath();
    graphics.arc(74, 62, 46, -0.8, 0.86, false);
    graphics.strokePath();
    graphics.lineStyle(6, 0xffffff, 0.84);
    graphics.beginPath();
    graphics.arc(74, 62, 32, -0.62, 0.68, false);
    graphics.strokePath();
    graphics.generateTexture(key, 160, 120);
    graphics.destroy();
  }

  private ensureEnergySheet() {
    if (this.textures.exists(AssetKeys.energyBlastSheet)) return;
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0x18e6ff, 0.24);
    graphics.fillEllipse(78, 72, 130, 48);
    graphics.fillStyle(0xb7fdff, 0.92);
    graphics.fillEllipse(86, 72, 86, 24);
    graphics.fillStyle(0x18e6ff, 0.32);
    graphics.fillEllipse(260, 72, 180, 62);
    graphics.fillStyle(0xffffff, 0.88);
    graphics.fillEllipse(268, 72, 126, 26);
    graphics.generateTexture(AssetKeys.energyBlastSheet, 500, 145);
    graphics.destroy();
  }

  private ensureHitSparkSheet() {
    if (this.textures.exists(AssetKeys.hitSparksSheet)) return;
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < 5; i++) {
      const cx = 36 + i * 71;
      graphics.lineStyle(4, i % 2 === 0 ? 0x18e6ff : 0xffe07a, 0.92);
      graphics.beginPath();
      graphics.moveTo(cx - 24, 72);
      graphics.lineTo(cx + 24, 72);
      graphics.moveTo(cx, 48);
      graphics.lineTo(cx, 96);
      graphics.moveTo(cx - 17, 55);
      graphics.lineTo(cx + 18, 90);
      graphics.moveTo(cx + 17, 55);
      graphics.lineTo(cx - 18, 90);
      graphics.strokePath();
    }
    graphics.generateTexture(AssetKeys.hitSparksSheet, 355, 145);
    graphics.destroy();
  }

  private ensureExplosionSheet() {
    if (this.textures.exists(AssetKeys.explosionsSheet)) return;
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < 3; i++) {
      const cx = 78 + i * 156;
      graphics.fillStyle(0xff6d57, 0.32);
      graphics.fillCircle(cx, 78, 58);
      graphics.fillStyle(0xffd36d, 0.72);
      graphics.fillCircle(cx, 78, 34);
      graphics.lineStyle(5, 0x18e6ff, 0.62);
      graphics.strokeCircle(cx, 78, 50);
    }
    graphics.generateTexture(AssetKeys.explosionsSheet, 485, 155);
    graphics.destroy();
  }

  private removeNewHeroWhiteBackdrops() {
    const spriteNames: HeroSpriteName[] = [
      "idle",
      "walk1",
      "walk2",
      "walk3",
      "walk4",
      "jump",
      "attackSlash",
      "attackBlast",
      "dash",
      "hitReaction",
    ];

    for (const hero of HEROES) {
      if (hero.assetRoot === "hero") continue;
      this.knockOutBorderLightPixels(heroDynamicKey(hero));
      for (const sprite of spriteNames) this.knockOutBorderLightPixels(heroTextureKey(hero, sprite));
    }
  }

  private knockOutBorderLightPixels(key: string) {
    if (!this.textures.exists(key)) return;
    const source = this.textures.get(key).getSourceImage() as CanvasImageSource & {
      width?: number;
      height?: number;
      naturalWidth?: number;
      naturalHeight?: number;
    };
    const width = source.width ?? source.naturalWidth ?? 0;
    const height = source.height ?? source.naturalHeight ?? 0;
    if (width <= 0 || height <= 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(source, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const { data } = imageData;
    const visited = new Uint8Array(width * height);
    const queue: number[] = [];

    const isLight = (pixel: number, loose = false) => {
      const offset = pixel * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      return a < 8 || (r > (loose ? 190 : 218) && g > (loose ? 190 : 218) && b > (loose ? 190 : 218) && max - min < (loose ? 64 : 46));
    };

    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const pixel = y * width + x;
      if (visited[pixel] || !isLight(pixel)) return;
      visited[pixel] = 1;
      queue.push(pixel);
    };

    for (let x = 0; x < width; x++) {
      push(x, 0);
      push(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      push(0, y);
      push(width - 1, y);
    }

    for (let i = 0; i < queue.length; i++) {
      const pixel = queue[i];
      data[pixel * 4 + 3] = 0;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    for (let pixel = 0; pixel < visited.length; pixel++) {
      if (isLight(pixel)) {
        data[pixel * 4 + 3] = 0;
        continue;
      }
      if (visited[pixel] || !isLight(pixel, true)) continue;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const touchesTransparent =
        (x > 0 && visited[pixel - 1]) ||
        (x < width - 1 && visited[pixel + 1]) ||
        (y > 0 && visited[pixel - width]) ||
        (y < height - 1 && visited[pixel + width]);
      if (touchesTransparent) data[pixel * 4 + 3] = Math.min(data[pixel * 4 + 3], 70);
    }

    context.putImageData(imageData, 0, 0);
    this.textures.remove(key);
    this.textures.addCanvas(key, canvas);
  }
}
