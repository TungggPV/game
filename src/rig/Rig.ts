import Phaser from "phaser";

/**
 * Lightweight 2D skeleton. Bones are images inside one container; transforms are
 * solved manually each frame so we can also query world positions (weapon tips,
 * ribbon anchors). Angles are radians, 0 = pointing straight down (+y), negative
 * swings toward the facing direction.
 */

export type BoneDef = {
  name: string;
  parent?: string;
  /** Pivot offset from the parent's pivot, in the parent's local frame (facing right). */
  x: number;
  y: number;
  texture?: string;
  /** Texture origin at the pivot. */
  ox?: number;
  oy?: number;
  /** Draw order. */
  z: number;
  /** Multiplied tint, e.g. to darken far-side limbs. */
  tint?: number;
  /** Texture scale relative to the rig scale (textures are painted at 2x). */
  scale?: number;
};

export type Pose = Record<string, number>;
export type RootPose = { x: number; y: number; rot: number; sx: number; sy: number };

export const ZERO_ROOT: RootPose = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };

type Bone = {
  def: BoneDef;
  img?: Phaser.GameObjects.Image;
  angle: number;
  wx: number;
  wy: number;
  wa: number;
};

const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

export class Rig {
  readonly container: Phaser.GameObjects.Container;
  private bones: Bone[] = [];
  private byName = new Map<string, Bone>();
  private root: RootPose = { ...ZERO_ROOT };
  facing = 1;
  /** Smoothed facing used for the turn-around squeeze (-1..1). */
  turn = 1;
  scale: number;

  constructor(
    private scene: Phaser.Scene,
    defs: BoneDef[],
    scale: number,
    depth: number,
  ) {
    this.scale = scale;
    this.container = scene.add.container(0, 0).setDepth(depth);
    const sorted = [...defs].sort((a, b) => a.z - b.z);
    for (const def of defs) {
      const bone: Bone = { def, angle: 0, wx: 0, wy: 0, wa: 0 };
      this.bones.push(bone);
      this.byName.set(def.name, bone);
    }
    for (const def of sorted) {
      if (!def.texture) continue;
      const img = scene.add.image(0, 0, def.texture).setOrigin(def.ox ?? 0.5, def.oy ?? 0.5).setScale(0.5 * (def.scale ?? 1));
      if (def.tint !== undefined) img.setTint(def.tint);
      this.byName.get(def.name)!.img = img;
      this.container.add(img);
    }
    // Parents must be solved before children.
    this.bones.sort((a, b) => this.depthOf(a.def) - this.depthOf(b.def));
  }

  private depthOf(def: BoneDef): number {
    let d = 0;
    let p = def.parent;
    while (p) {
      d += 1;
      p = this.byName.get(p)?.def.parent;
    }
    return d;
  }

  get depth() {
    return this.container.depth;
  }

  set depth(v: number) {
    this.container.setDepth(v);
  }

  /** Blend toward the target pose; `stiffness` ~ 1/seconds (higher = snappier). */
  update(dt: number, x: number, y: number, pose: Pose, root: RootPose, stiffness: number, rootStiffness = stiffness) {
    const k = damp(stiffness, dt);
    const kr = damp(rootStiffness, dt);
    for (const b of this.bones) {
      const target = pose[b.def.name] ?? 0;
      b.angle += (target - b.angle) * k;
    }
    const r = this.root;
    r.x += (root.x - r.x) * kr;
    r.y += (root.y - r.y) * kr;
    r.rot += (root.rot - r.rot) * kr;
    r.sx += (root.sx - r.sx) * kr;
    r.sy += (root.sy - r.sy) * kr;

    this.turn += (this.facing - this.turn) * damp(30, dt);
    const flip = this.turn >= 0 ? 1 : -1;
    const squeeze = Math.max(0.15, Math.abs(this.turn));
    this.container.setPosition(x, y).setScale(this.scale * flip * squeeze * r.sx, this.scale * r.sy);
    this.solve();
  }

  /** Snap straight to a pose (used on spawn). */
  snap(pose: Pose, root: RootPose) {
    for (const b of this.bones) b.angle = pose[b.def.name] ?? 0;
    this.root = { ...root };
    this.solve();
  }

  private solve() {
    for (const b of this.bones) {
      const p = b.def.parent ? this.byName.get(b.def.parent)! : null;
      if (!p) {
        b.wa = this.root.rot + b.angle;
        b.wx = this.root.x + b.def.x;
        b.wy = this.root.y + b.def.y;
      } else {
        const c = Math.cos(p.wa);
        const s = Math.sin(p.wa);
        b.wx = p.wx + b.def.x * c - b.def.y * s;
        b.wy = p.wy + b.def.x * s + b.def.y * c;
        b.wa = p.wa + b.angle;
      }
      b.img?.setPosition(b.wx, b.wy).setRotation(b.wa);
    }
  }

  /** Scene-space position of a point in a bone's local frame. */
  point(bone: string, lx = 0, ly = 0) {
    const b = this.byName.get(bone)!;
    const c = Math.cos(b.wa);
    const s = Math.sin(b.wa);
    const px = b.wx + lx * c - ly * s;
    const py = b.wy + lx * s + ly * c;
    const m = this.container;
    return { x: m.x + px * m.scaleX, y: m.y + py * m.scaleY };
  }

  boneAngle(bone: string) {
    return this.byName.get(bone)!.wa;
  }

  forEachImage(fn: (img: Phaser.GameObjects.Image) => void) {
    for (const b of this.bones) if (b.img) fn(b.img);
  }

  setTintFill(color: number) {
    this.forEachImage((i) => i.setTintFill(color));
    return this;
  }

  setTint(color: number) {
    this.forEachImage((i) => i.setTint(color));
    return this;
  }

  clearTint() {
    for (const b of this.bones) {
      if (!b.img) continue;
      if (b.def.tint !== undefined) b.img.setTint(b.def.tint);
      else b.img.clearTint();
    }
    return this;
  }

  setAlpha(a: number) {
    this.container.setAlpha(a);
    return this;
  }

  setVisible(v: boolean) {
    this.container.setVisible(v);
    return this;
  }

  /** Frozen silhouette copy that fades out — afterimages for dashes and ultimates. */
  ghost(color: number, alpha = 0.5, duration = 240) {
    const src = this.container;
    const g = this.scene.add.container(src.x, src.y).setScale(src.scaleX, src.scaleY).setDepth(src.depth - 1).setAlpha(alpha);
    src.each((child: Phaser.GameObjects.GameObject) => {
      const i = child as Phaser.GameObjects.Image;
      g.add(
        this.scene.add
          .image(i.x, i.y, i.texture.key)
          .setOrigin(i.originX, i.originY)
          .setScale(i.scaleX, i.scaleY)
          .setRotation(i.rotation)
          .setTintFill(color)
          .setBlendMode(Phaser.BlendModes.ADD),
      );
    });
    this.scene.tweens.add({ targets: g, alpha: 0, duration, ease: "Quad.easeOut", onComplete: () => g.destroy() });
    return g;
  }

  destroy() {
    this.container.destroy();
  }
}

/**
 * Verlet chain for scarves, capes and plumes. Anchored to a rig point each frame,
 * drawn as a tapered ribbon.
 */
export class Ribbon {
  private pts: { x: number; y: number; px: number; py: number }[] = [];
  private g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private segments: number,
    private segLen: number,
    private width: number,
    private colors: [number, number],
    depth: number,
    private gravity = 900,
    private glow = false,
  ) {
    for (let i = 0; i <= segments; i += 1) this.pts.push({ x: x - i * segLen, y, px: x - i * segLen, py: y });
    this.g = scene.add.graphics().setDepth(depth);
    if (glow) this.g.setBlendMode(Phaser.BlendModes.ADD);
  }

  setDepth(d: number) {
    this.g.setDepth(d);
  }

  setVisible(v: boolean) {
    this.g.setVisible(v);
  }

  setAlpha(a: number) {
    this.g.setAlpha(a);
  }

  /** `wind` pushes the free end opposite to motion; `flutter` adds idle waving. */
  update(dt: number, ax: number, ay: number, wind: number, time: number) {
    const p0 = this.pts[0];
    p0.x = p0.px = ax;
    p0.y = p0.py = ay;
    const step = Math.min(dt, 1 / 30);
    for (let i = 1; i < this.pts.length; i += 1) {
      const p = this.pts[i];
      const vx = (p.x - p.px) * 0.94;
      const vy = (p.y - p.py) * 0.94;
      p.px = p.x;
      p.py = p.y;
      const flutter = Math.sin(time * 9 + i * 0.9) * 140 * (i / this.pts.length);
      p.x += vx + (wind + flutter * 0.3) * step * step;
      p.y += vy + (this.gravity + flutter) * step * step;
    }
    for (let iter = 0; iter < 3; iter += 1) {
      for (let i = 1; i < this.pts.length; i += 1) {
        const a = this.pts[i - 1];
        const b = this.pts[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - this.segLen) / d;
        if (i === 1) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
    }
    this.draw();
  }

  private draw() {
    const g = this.g;
    g.clear();
    const left: Phaser.Math.Vector2[] = [];
    const right: Phaser.Math.Vector2[] = [];
    const n = this.pts.length;
    for (let i = 0; i < n; i += 1) {
      const p = this.pts[i];
      const q = this.pts[Math.min(n - 1, i + 1)];
      const r = this.pts[Math.max(0, i - 1)];
      const tx = q.x - r.x;
      const ty = q.y - r.y;
      const len = Math.hypot(tx, ty) || 1;
      const w = (this.width * (1 - (i / n) * 0.75)) / 2;
      left.push(new Phaser.Math.Vector2(p.x - (ty / len) * w, p.y + (tx / len) * w));
      right.push(new Phaser.Math.Vector2(p.x + (ty / len) * w, p.y - (tx / len) * w));
    }
    g.fillStyle(this.colors[0], this.glow ? 0.55 : 1);
    g.fillPoints([...left, ...right.reverse()], true);
    // Lighter inner stripe gives the cloth some volume.
    const inner: Phaser.Math.Vector2[] = [];
    const inner2: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < n; i += 1) {
      const p = this.pts[i];
      const l = left[i];
      inner.push(new Phaser.Math.Vector2((p.x + l.x) / 2, (p.y + l.y) / 2));
      inner2.push(new Phaser.Math.Vector2(p.x, p.y));
    }
    g.fillStyle(this.colors[1], this.glow ? 0.8 : 1);
    g.fillPoints([...inner, ...inner2.reverse()], true);
  }

  destroy() {
    this.g.destroy();
  }
}

/** Swoosh ribbon traced by a weapon's base and tip while it swings. */
export class WeaponTrail {
  private samples: { bx: number; by: number; tx: number; ty: number; t: number }[] = [];
  private g: Phaser.GameObjects.Graphics;
  active = false;

  constructor(
    scene: Phaser.Scene,
    private colors: [number, number],
    depth: number,
    private life = 0.14,
  ) {
    this.g = scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  }

  setColors(c: [number, number]) {
    this.colors = c;
  }

  update(now: number, base: { x: number; y: number }, tip: { x: number; y: number }) {
    if (this.active) {
      const last = this.samples[this.samples.length - 1];
      // Subdivide fast swings so the arc stays round at 60 fps.
      if (last) {
        const dist = Math.hypot(tip.x - last.tx, tip.y - last.ty);
        const steps = Math.min(6, Math.floor(dist / 18));
        for (let s = 1; s <= steps; s += 1) {
          const f = s / (steps + 1);
          this.samples.push({
            bx: last.bx + (base.x - last.bx) * f,
            by: last.by + (base.y - last.by) * f,
            tx: last.tx + (tip.x - last.tx) * f,
            ty: last.ty + (tip.y - last.ty) * f,
            t: last.t + (now - last.t) * f,
          });
        }
      }
      this.samples.push({ bx: base.x, by: base.y, tx: tip.x, ty: tip.y, t: now });
    }
    this.samples = this.samples.filter((s) => now - s.t < this.life);
    this.draw(now);
  }

  clear() {
    this.samples = [];
    this.g.clear();
  }

  private draw(now: number) {
    const g = this.g;
    g.clear();
    const n = this.samples.length;
    if (n < 2) return;
    for (let i = 1; i < n; i += 1) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      const fade = 1 - (now - b.t) / this.life;
      if (fade <= 0) continue;
      g.fillStyle(this.colors[0], 0.55 * fade);
      g.fillPoints([
        new Phaser.Math.Vector2(a.bx, a.by),
        new Phaser.Math.Vector2(a.tx, a.ty),
        new Phaser.Math.Vector2(b.tx, b.ty),
        new Phaser.Math.Vector2(b.bx, b.by),
      ], true);
      // Hot edge along the tip path.
      const mx = (a.tx + a.bx * 0.25) / 1.25;
      const my = (a.ty + a.by * 0.25) / 1.25;
      const nx = (b.tx + b.bx * 0.25) / 1.25;
      const ny = (b.ty + b.by * 0.25) / 1.25;
      g.fillStyle(this.colors[1], 0.9 * fade);
      g.fillPoints([
        new Phaser.Math.Vector2(mx, my),
        new Phaser.Math.Vector2(a.tx, a.ty),
        new Phaser.Math.Vector2(b.tx, b.ty),
        new Phaser.Math.Vector2(nx, ny),
      ], true);
    }
  }

  destroy() {
    this.g.destroy();
  }
}

// ---------- keyframe helpers ----------

export type Key = { t: number; pose: Pose; root?: Partial<RootPose> };

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Sample a keyframe track at progress p (0..1) with cubic easing between keys. */
export const sampleKeys = (keys: Key[], p: number): { pose: Pose; root: Partial<RootPose> } => {
  if (p <= keys[0].t) return { pose: keys[0].pose, root: keys[0].root ?? {} };
  const last = keys[keys.length - 1];
  if (p >= last.t) return { pose: last.pose, root: last.root ?? {} };
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t < p) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const f = easeInOut((p - a.t) / (b.t - a.t));
  const pose: Pose = {};
  for (const k of new Set([...Object.keys(a.pose), ...Object.keys(b.pose)])) {
    const va = a.pose[k] ?? 0;
    const vb = b.pose[k] ?? 0;
    pose[k] = va + (vb - va) * f;
  }
  const root: Partial<RootPose> = {};
  for (const k of ["x", "y", "rot", "sx", "sy"] as const) {
    const va = a.root?.[k];
    const vb = b.root?.[k];
    if (va === undefined && vb === undefined) continue;
    const da = k === "sx" || k === "sy" ? 1 : 0;
    root[k] = (va ?? da) + ((vb ?? da) - (va ?? da)) * f;
  }
  return { pose, root };
};

export const mergePose = (...poses: Pose[]): Pose => Object.assign({}, ...poses);
