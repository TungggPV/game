import Phaser from "phaser";
import { glow, glowShape, line, makeTexture, plate, roundRect, shade, type Ctx } from "./paint";
import { mergePose, sampleKeys, type BoneDef, type Key, type Pose, type RootPose } from "./Rig";

export type WeaponStyle = "sword" | "fists" | "lance" | "daggers";
type Crest = "fin" | "horns" | "antenna" | "hood";

export type HeroLook = {
  armor: string;
  armorDark: string;
  trim: string;
  suit: string;
  glow: string;
  visor: string;
  crest: Crest;
  weapon: WeaponStyle;
  ribbon: { kind: "scarf" | "plume" | "cape" | "twin"; colors: [number, number]; glow?: boolean };
};

export const HERO_LOOKS: Record<string, HeroLook> = {
  nova_blade: {
    armor: "#e9f1ff", armorDark: "#8ea6cc", trim: "#2a63ff", suit: "#18213a", glow: "#29e9ff", visor: "#7ff7ff",
    crest: "fin", weapon: "sword", ribbon: { kind: "scarf", colors: [0x16a8ff, 0x8ff6ff], glow: true },
  },
  crimson_flare: {
    armor: "#dc2a3c", armorDark: "#6e0f1c", trim: "#3a3f4c", suit: "#1e1418", glow: "#ff8a1a", visor: "#ffd35a",
    crest: "horns", weapon: "fists", ribbon: { kind: "plume", colors: [0xff5a1a, 0xffd36a], glow: true },
  },
  volt_sentinel: {
    armor: "#f4c431", armorDark: "#9c6c14", trim: "#1c2a58", suit: "#141a2e", glow: "#8ff4ff", visor: "#b8f8ff",
    crest: "antenna", weapon: "lance", ribbon: { kind: "cape", colors: [0x1c2a58, 0xf4c431] },
  },
  emerald_phantom: {
    armor: "#1d8f6a", armorDark: "#0a4434", trim: "#bff8e0", suit: "#0c1a18", glow: "#4ef3a5", visor: "#c4ffe2",
    crest: "hood", weapon: "daggers", ribbon: { kind: "twin", colors: [0x2fd892, 0xc4ffe2] },
  },
};

const key = (id: string, part: string) => `rig_${id}_${part}`;

// ---------- painting ----------

const paintHead = (c: Ctx, L: HeroLook) => {
  // Back crest pieces first so the helmet overlaps them.
  if (L.crest === "horns") {
    plate(c, () => { c.moveTo(10, 10); c.quadraticCurveTo(2, 0, 4, -6 + 8); c.quadraticCurveTo(8, 2, 14, 8); }, "#2b2f3a", { y1: 14 });
    plate(c, () => { c.moveTo(20, 7); c.quadraticCurveTo(18, -2 + 4, 26, 0 + 2); c.quadraticCurveTo(24, 5, 24, 9); }, "#3a3f4c", { y1: 12 });
  }
  if (L.crest === "hood") {
    plate(c, () => { c.moveTo(4, 30); c.quadraticCurveTo(-2, 10, 12, 3); c.quadraticCurveTo(26, -1, 30, 10); c.lineTo(18, 14); c.lineTo(10, 32); }, L.armorDark, { y1: 34 });
  }
  // Helmet dome.
  plate(c, () => {
    c.moveTo(6, 22);
    c.bezierCurveTo(4, 8, 12, 4, 19, 4);
    c.bezierCurveTo(28, 4, 32, 11, 31, 19);
    c.lineTo(31, 25);
    c.lineTo(26, 31);
    c.lineTo(12, 32);
    c.lineTo(7, 28);
  }, L.armor, { y1: 32 });
  // Faceplate / jaw.
  plate(c, () => { c.moveTo(19, 22); c.lineTo(31, 21); c.lineTo(30, 26); c.lineTo(25, 31); c.lineTo(17, 31); }, L.crest === "hood" ? "#0c1614" : L.armorDark, { y1: 32, rim: false });
  // Visor.
  glowShape(c, () => { c.moveTo(17, 14); c.lineTo(31, 13); c.lineTo(31, 18); c.lineTo(18, 19); }, L.visor, "#ffffff", 7);
  // Ear piece with glow.
  plate(c, () => { c.arc(12, 19, 4.5, 0, Math.PI * 2); }, L.trim, { y1: 24 });
  glow(c, L.glow, 5, () => { c.beginPath(); c.arc(12, 19, 1.8, 0, Math.PI * 2); c.fillStyle = L.glow; c.fill(); });
  if (L.crest === "fin") {
    plate(c, () => { c.moveTo(8, 9); c.lineTo(18, -0 + 1); c.lineTo(26, 3); c.lineTo(17, 6); c.lineTo(11, 12); }, L.trim, { y1: 12 });
    line(c, [[12, 8], [22, 3]], L.glow, 1);
  }
  if (L.crest === "antenna") {
    plate(c, () => { c.moveTo(9, 10); c.lineTo(5, 0); c.lineTo(10, 3); c.lineTo(9, -3 + 3); c.lineTo(15, 7); }, L.trim, { y1: 10 });
    glow(c, L.glow, 6, () => line(c, [[22, 5], [25, 0], [23, 0], [27, -4 + 4]], L.glow, 1.4));
  }
  if (L.crest === "horns") line(c, [[8, 15], [17, 14]], "rgba(0,0,0,0.35)", 1);
};

const paintTorso = (c: Ctx, L: HeroLook) => {
  // Under-suit waist.
  plate(c, () => { c.moveTo(11, 28); c.lineTo(31, 28); c.lineTo(29, 50); c.lineTo(13, 50); }, L.suit, { y0: 28, y1: 50, rim: false });
  // Ab plates.
  for (let i = 0; i < 3; i += 1) {
    plate(c, () => roundRect(c, 14, 30 + i * 6.5, 14, 5.5, 1.5), i % 2 ? L.armorDark : L.armor, { y0: 30 + i * 6, y1: 36 + i * 6, outline: 1 });
  }
  // Chest plate.
  plate(c, () => {
    c.moveTo(3, 6);
    c.quadraticCurveTo(10, 1, 21, 1);
    c.quadraticCurveTo(33, 1, 39, 6);
    c.lineTo(36, 22);
    c.quadraticCurveTo(28, 31, 21, 31);
    c.quadraticCurveTo(13, 31, 6, 22);
  }, L.armor, { y1: 32 });
  // Trim chevrons.
  plate(c, () => { c.moveTo(7, 9); c.lineTo(17, 15); c.lineTo(15, 19); c.lineTo(6, 14); }, L.trim, { y1: 20, outline: 1 });
  plate(c, () => { c.moveTo(35, 9); c.lineTo(26, 15); c.lineTo(28, 19); c.lineTo(36, 14); }, L.trim, { y1: 20, outline: 1 });
  // Collar.
  plate(c, () => { c.moveTo(14, 2); c.lineTo(28, 2); c.lineTo(26, 6); c.lineTo(16, 6); }, L.armorDark, { y1: 6, outline: 1 });
  // Power core.
  glow(c, L.glow, 10, () => { c.beginPath(); c.arc(24, 17, 5.2, 0, Math.PI * 2); c.fillStyle = L.glow; c.fill(); });
  c.beginPath(); c.arc(24, 17, 5.2, 0, Math.PI * 2); c.lineWidth = 1.4; c.strokeStyle = "#070b14"; c.stroke();
  c.beginPath(); c.arc(23.2, 16.2, 2.2, 0, Math.PI * 2); c.fillStyle = "#ffffff"; c.fill();
};

const paintPelvis = (c: Ctx, L: HeroLook) => {
  plate(c, () => { c.moveTo(2, 2); c.lineTo(28, 2); c.lineTo(26, 12); c.lineTo(19, 17); c.lineTo(11, 17); c.lineTo(4, 12); }, L.armorDark, { y1: 18 });
  plate(c, () => roundRect(c, 3, 2, 24, 5, 1.5), L.trim, { y1: 7, outline: 1 });
  glowShape(c, () => roundRect(c, 13, 2.5, 6, 4, 1), L.glow, "#ffffff", 5);
};

const paintUpperArm = (c: Ctx, L: HeroLook) => {
  plate(c, () => roundRect(c, 4.5, 8, 9, 22, 4), L.suit, { y0: 8, y1: 30, rim: false });
  plate(c, () => roundRect(c, 5, 14, 8, 10, 2.5), L.armorDark, { y0: 14, y1: 24, outline: 1 });
  // Pauldron.
  plate(c, () => { c.moveTo(1, 9); c.bezierCurveTo(0, 1, 6, -0 + 0.5, 9, 0.5); c.bezierCurveTo(14, 0.5, 18, 3, 17, 10); c.lineTo(14, 13); c.lineTo(4, 13); }, L.armor, { y1: 14 });
  line(c, [[3, 9.5], [15, 9.5]], L.trim, 1.6);
};

const paintForeArm = (c: Ctx, L: HeroLook) => {
  plate(c, () => roundRect(c, 4.5, 1, 7, 10, 3), L.suit, { y1: 11, rim: false });
  plate(c, () => { c.moveTo(3, 6); c.lineTo(13, 6); c.lineTo(15, 26); c.lineTo(1, 26); }, L.armor, { y0: 6, y1: 28 });
  plate(c, () => roundRect(c, 1, 22, 14, 6, 2), L.trim, { y0: 22, y1: 28, outline: 1 });
  glow(c, L.glow, 5, () => line(c, [[8, 10], [8, 20]], L.glow, 1.6));
};

const paintHand = (c: Ctx, L: HeroLook, big: boolean) => {
  const s = big ? 1.5 : 1;
  c.save();
  c.scale(s, s);
  plate(c, () => roundRect(c, 1.5, 1, 11, 11, 3.5), big ? L.armorDark : L.suit, { y1: 12 });
  line(c, [[3, 7], [11, 7]], "rgba(0,0,0,0.35)", 0.8);
  if (big) glowShape(c, () => roundRect(c, 2.5, 8, 9, 3.2, 1.2), L.glow, "#ffffff", 8);
  c.restore();
};

const paintThigh = (c: Ctx, L: HeroLook) => {
  plate(c, () => roundRect(c, 3, 1, 12, 32, 5), L.suit, { y1: 33, rim: false });
  plate(c, () => { c.moveTo(4, 3); c.lineTo(16, 3); c.lineTo(15, 24); c.lineTo(9, 30); c.lineTo(4, 24); }, L.armor, { y1: 30 });
  line(c, [[6, 10], [14, 10]], L.trim, 1.4);
};

const paintShin = (c: Ctx, L: HeroLook) => {
  // Boot sole and toe point forward (+x).
  plate(c, () => { c.moveTo(3, 30); c.lineTo(15, 30); c.lineTo(23, 37); c.lineTo(24, 42); c.lineTo(2, 42); }, L.armorDark, { y0: 30, y1: 43 });
  plate(c, () => roundRect(c, 4, 1, 11, 31, 4), L.suit, { y1: 32, rim: false });
  // Knee cap + shin guard.
  plate(c, () => { c.moveTo(5, 4); c.lineTo(16, 2); c.lineTo(17, 26); c.lineTo(11, 33); c.lineTo(5, 28); }, L.armor, { y1: 33 });
  plate(c, () => { c.arc(11, 5, 5, 0, Math.PI * 2); }, L.trim, { y1: 10, outline: 1 });
  glow(c, L.glow, 4, () => line(c, [[14, 13], [14, 24]], L.glow, 1.4));
  line(c, [[3, 41.5], [23.5, 41.5]], "#05080e", 1.6);
};

const paintSword = (c: Ctx, L: HeroLook) => {
  // Hilt at top, blade toward +y.
  plate(c, () => roundRect(c, 4.5, 0, 5, 12, 2), L.suit, { y1: 12, outline: 1 });
  plate(c, () => roundRect(c, 0.5, 11, 13, 4, 1.5), L.trim, { y1: 15, outline: 1 });
  glowShape(c, () => { c.moveTo(3.5, 15); c.lineTo(10.5, 15); c.lineTo(10, 74); c.lineTo(7, 84); c.lineTo(4, 74); }, L.glow, "#ffffff", 10);
  c.save();
  c.beginPath(); c.moveTo(6, 17); c.lineTo(8, 17); c.lineTo(7.6, 74); c.lineTo(7, 80); c.lineTo(6.4, 74); c.closePath();
  c.fillStyle = "#ffffff"; c.fill();
  c.restore();
};

const paintLance = (c: Ctx, L: HeroLook) => {
  // Butt cap at top, head toward +y.
  plate(c, () => roundRect(c, 3, 0, 6, 8, 2), L.trim, { y1: 8, outline: 1 });
  plate(c, () => roundRect(c, 4, 6, 4, 76, 2), L.armorDark, { x1: 12, y1: 0, outline: 1 });
  plate(c, () => roundRect(c, 2.5, 34, 7, 10, 2), L.trim, { y0: 34, y1: 44, outline: 1 });
  plate(c, () => { c.moveTo(0, 80); c.lineTo(12, 80); c.lineTo(10, 86); c.lineTo(2, 86); }, L.armor, { y0: 80, y1: 86, outline: 1 });
  glowShape(c, () => { c.moveTo(2, 86); c.lineTo(10, 86); c.lineTo(9, 100); c.lineTo(6, 112); c.lineTo(3, 100); }, L.glow, "#ffffff", 10);
  glow(c, L.glow, 6, () => line(c, [[6, 48], [7.5, 54], [4.5, 60], [7, 66], [5, 72]], "#ffffff", 1.1));
};

const paintDagger = (c: Ctx, L: HeroLook) => {
  plate(c, () => roundRect(c, 3, 0, 5, 9, 2), L.suit, { y1: 9, outline: 1 });
  plate(c, () => roundRect(c, 0.5, 8, 10, 3, 1), L.trim, { y1: 11, outline: 1 });
  glowShape(c, () => { c.moveTo(2.5, 11); c.lineTo(8.5, 11); c.quadraticCurveTo(10, 28, 4, 42); c.quadraticCurveTo(4.5, 26, 2.5, 11); }, L.glow, "#ffffff", 8);
};

export const paintHeroRig = (scene: Phaser.Scene, id: string) => {
  const L = HERO_LOOKS[id];
  makeTexture(scene, key(id, "head"), 34, 34, (c) => paintHead(c, L));
  makeTexture(scene, key(id, "torso"), 42, 52, (c) => paintTorso(c, L));
  makeTexture(scene, key(id, "pelvis"), 30, 18, (c) => paintPelvis(c, L));
  makeTexture(scene, key(id, "upper"), 18, 32, (c) => paintUpperArm(c, L));
  makeTexture(scene, key(id, "fore"), 16, 30, (c) => paintForeArm(c, L));
  makeTexture(scene, key(id, "hand"), L.weapon === "fists" ? 22 : 14, L.weapon === "fists" ? 20 : 13, (c) => paintHand(c, L, L.weapon === "fists"));
  makeTexture(scene, key(id, "thigh"), 18, 34, (c) => paintThigh(c, L));
  makeTexture(scene, key(id, "shin"), 26, 44, (c) => paintShin(c, L));
  if (L.weapon === "sword") makeTexture(scene, key(id, "weapon"), 14, 86, (c) => paintSword(c, L));
  if (L.weapon === "lance") makeTexture(scene, key(id, "weapon"), 12, 114, (c) => paintLance(c, L));
  if (L.weapon === "daggers") makeTexture(scene, key(id, "weapon"), 11, 44, (c) => paintDagger(c, L));
};

// ---------- skeleton ----------

const BACK = 0x8f9ab4;

export const heroBones = (id: string): BoneDef[] => {
  const L = HERO_LOOKS[id];
  const k = (p: string) => key(id, p);
  const fist = L.weapon === "fists";
  const bones: BoneDef[] = [
    { name: "hip", x: 0, y: -71, texture: k("pelvis"), ox: 0.5, oy: 0.25, z: 6 },
    { name: "torso", parent: "hip", x: 0, y: -1, texture: k("torso"), ox: 0.5, oy: 0.97, z: 10 },
    { name: "head", parent: "torso", x: 3, y: -48, texture: k("head"), ox: 0.5, oy: 0.9, z: 12 },

    { name: "armB_u", parent: "torso", x: -4, y: -41, texture: k("upper"), ox: 0.5, oy: 0.2, z: 1, tint: BACK },
    { name: "armB_f", parent: "armB_u", x: 0, y: 23, texture: k("fore"), ox: 0.5, oy: 0.12, z: 2, tint: BACK },
    { name: "handB", parent: "armB_f", x: 0, y: 24, texture: k("hand"), ox: 0.5, oy: fist ? 0.3 : 0.25, z: 3, tint: BACK },

    { name: "legB_t", parent: "hip", x: -4, y: 3, texture: k("thigh"), ox: 0.5, oy: 0.08, z: 4, tint: BACK },
    { name: "legB_s", parent: "legB_t", x: 0, y: 30, texture: k("shin"), ox: 0.4, oy: 0.07, z: 5, tint: BACK },
    { name: "legF_t", parent: "hip", x: 5, y: 3, texture: k("thigh"), ox: 0.5, oy: 0.08, z: 7 },
    { name: "legF_s", parent: "legF_t", x: 0, y: 30, texture: k("shin"), ox: 0.4, oy: 0.07, z: 8 },

    { name: "armF_u", parent: "torso", x: 5, y: -41, texture: k("upper"), ox: 0.5, oy: 0.2, z: 14 },
    { name: "armF_f", parent: "armF_u", x: 0, y: 23, texture: k("fore"), ox: 0.5, oy: 0.12, z: 15 },
    { name: "handF", parent: "armF_f", x: 0, y: 24, texture: k("hand"), ox: 0.5, oy: fist ? 0.3 : 0.25, z: 17 },
  ];
  if (L.weapon === "sword") bones.push({ name: "weapon", parent: "handF", x: 0, y: 5, texture: k("weapon"), ox: 0.5, oy: 0.1, z: 16 });
  if (L.weapon === "lance") bones.push({ name: "weapon", parent: "handF", x: 0, y: 5, texture: k("weapon"), ox: 0.5, oy: 0.36, z: 16 });
  if (L.weapon === "daggers") {
    bones.push({ name: "weapon", parent: "handF", x: 0, y: 4, texture: k("weapon"), ox: 0.5, oy: 0.12, z: 16 });
    bones.push({ name: "weaponB", parent: "handB", x: 0, y: 4, texture: k("weapon"), ox: 0.5, oy: 0.12, z: 2.5, tint: BACK });
  }
  return bones;
};

/** Points (bone, local x, local y) used for weapon trails: [base, tip]. */
export const trailPoints = (style: WeaponStyle): [string, number, number][][] => {
  switch (style) {
    case "sword":
      return [[["weapon", 0, 22], ["weapon", 0, 82]]];
    case "lance":
      return [[["weapon", 0, 40], ["weapon", 0, 108]]];
    case "daggers":
      return [[["weapon", 0, 8], ["weapon", 0, 40]], [["weaponB", 0, 8], ["weaponB", 0, 40]]];
    case "fists":
      return [[["armF_f", 0, 14], ["handF", 0, 10]], [["armB_f", 0, 14], ["handB", 0, 10]]];
  }
};

// ---------- animation ----------

export type AnimState = "idle" | "run" | "air" | "dash" | "attack" | "cast" | "hurt" | "down" | "sweep" | "stun";
export type CastKind = "shoot" | "burst" | "field" | "strikes" | "ultCharge" | "screen" | "sweep";

export type AnimInput = {
  state: AnimState;
  progress: number;
  combo: number;
  cast: CastKind;
  vx: number;
  vy: number;
  speedRef: number;
  stride: number;
  time: number;
  land: number;
};

export type AnimOut = { pose: Pose; root: RootPose; stiffness: number; trail: boolean };

const GUARD: Record<WeaponStyle, Pose> = {
  sword: { armF_u: -0.55, armF_f: -1.25, handF: 0.2, weapon: -0.95, armB_u: 0.25, armB_f: -0.7 },
  fists: { armF_u: -0.75, armF_f: -1.9, handF: 0.3, armB_u: -0.35, armB_f: -2.0, handB: 0.3 },
  lance: { armF_u: -0.75, armF_f: -0.85, handF: 0.2, weapon: -0.1, armB_u: -0.2, armB_f: -1.2 },
  daggers: { armF_u: -0.45, armF_f: -1.5, handF: 0.3, weapon: -1.6, armB_u: 0.35, armB_f: -1.2, weaponB: -1.4 },
};

const STANCE: Pose = { legF_t: -0.32, legF_s: 0.38, legB_t: 0.28, legB_s: 0.22, torso: 0.05, head: -0.04 };

const ATTACKS: Record<WeaponStyle, Key[][]> = {
  sword: [
    [
      { t: 0, pose: { armF_u: -2.7, armF_f: -0.5, weapon: -0.5, torso: -0.12, armB_u: 0.5 } },
      { t: 0.22, pose: { armF_u: -1.35, armF_f: -0.15, weapon: -0.1, torso: 0.2, armB_u: 0.7 }, root: { x: 8 } },
      { t: 0.55, pose: { armF_u: -0.15, armF_f: -0.4, weapon: 0.35, torso: 0.28, armB_u: 0.8 }, root: { x: 10 } },
      { t: 1, pose: { armF_u: -0.45, armF_f: -1.1, weapon: -0.8, torso: 0.1 }, root: { x: 4 } },
    ],
    [
      { t: 0, pose: { armF_u: 0.45, armF_f: -0.5, weapon: 0.7, torso: 0.25, armB_u: -0.3 } },
      { t: 0.22, pose: { armF_u: -1.6, armF_f: -0.3, weapon: -0.4, torso: -0.05, armB_u: 0.6 }, root: { x: 8 } },
      { t: 0.55, pose: { armF_u: -2.6, armF_f: -0.3, weapon: -0.6, torso: -0.15, armB_u: 0.8 }, root: { x: 10 } },
      { t: 1, pose: { armF_u: -0.6, armF_f: -1.2, weapon: -0.9, torso: 0.05 }, root: { x: 4 } },
    ],
    [
      { t: 0, pose: { armF_u: -3.1, armF_f: -0.2, weapon: -0.3, armB_u: -2.6, armB_f: -0.4, torso: -0.25, legF_t: -0.6, legF_s: 0.9 }, root: { y: -16 } },
      { t: 0.25, pose: { armF_u: -0.9, armF_f: -0.1, weapon: -0.05, armB_u: -0.5, torso: 0.45, legF_t: -0.75, legF_s: 0.6, legB_t: 0.6, legB_s: 0.4 }, root: { x: 16, y: 8 } },
      { t: 0.6, pose: { armF_u: -0.55, armF_f: -0.1, weapon: 0.15, armB_u: 0.4, torso: 0.4, legF_t: -0.75, legF_s: 0.6, legB_t: 0.6, legB_s: 0.4 }, root: { x: 16, y: 8 } },
      { t: 1, pose: { armF_u: -0.5, armF_f: -1.2, weapon: -0.9, torso: 0.1 }, root: { x: 6 } },
    ],
  ],
  fists: [
    [
      { t: 0, pose: { armF_u: -0.4, armF_f: -2.2, torso: -0.1 } },
      { t: 0.2, pose: { armF_u: -1.55, armF_f: -0.05, handF: 0, torso: 0.18, armB_u: 0.1 }, root: { x: 10 } },
      { t: 0.55, pose: { armF_u: -1.5, armF_f: -0.1, torso: 0.15 }, root: { x: 10 } },
      { t: 1, pose: { armF_u: -0.75, armF_f: -1.9, torso: 0.05 }, root: { x: 4 } },
    ],
    [
      { t: 0, pose: { armB_u: 0.4, armB_f: -2.0, torso: -0.2, armF_u: -0.4 } },
      { t: 0.2, pose: { armB_u: -1.7, armB_f: -0.3, handB: 0, torso: 0.3, armF_u: 0.3, armF_f: -1.6 }, root: { x: 12 } },
      { t: 0.55, pose: { armB_u: -1.4, armB_f: -0.6, torso: 0.25, armF_u: 0.3 }, root: { x: 12 } },
      { t: 1, pose: { armB_u: -0.35, armB_f: -2.0, torso: 0.05 }, root: { x: 4 } },
    ],
    [
      { t: 0, pose: { armF_u: 0.5, armF_f: -1.6, torso: 0.35, legF_t: -0.7, legF_s: 1.1, legB_t: 0.5, legB_s: 0.6 }, root: { y: 10 } },
      { t: 0.25, pose: { armF_u: -2.9, armF_f: -0.6, torso: -0.2, legF_t: -0.2, legF_s: 0.2, legB_t: 0.3, legB_s: 0.4 }, root: { x: 12, y: -22 } },
      { t: 0.6, pose: { armF_u: -3.0, armF_f: -0.4, torso: -0.25 }, root: { x: 12, y: -18 } },
      { t: 1, pose: { armF_u: -0.75, armF_f: -1.9, torso: 0.05 }, root: { x: 4 } },
    ],
  ],
  lance: [
    [
      { t: 0, pose: { armF_u: -0.3, armF_f: -1.3, weapon: 0.05, torso: -0.12 }, root: { x: -6 } },
      { t: 0.2, pose: { armF_u: -1.5, armF_f: -0.05, weapon: 0, torso: 0.22, armB_u: -1.3, armB_f: -0.3 }, root: { x: 14 } },
      { t: 0.55, pose: { armF_u: -1.45, armF_f: -0.1, weapon: 0, torso: 0.2 }, root: { x: 14 } },
      { t: 1, pose: { armF_u: -0.75, armF_f: -0.85, weapon: -0.1 }, root: { x: 4 } },
    ],
    [
      { t: 0, pose: { armF_u: -2.8, armF_f: -0.2, weapon: -0.6, torso: -0.15, armB_u: -2.2 } },
      { t: 0.22, pose: { armF_u: -1.2, armF_f: 0, weapon: 0.2, torso: 0.25, armB_u: -0.8 }, root: { x: 10 } },
      { t: 0.55, pose: { armF_u: -0.2, armF_f: -0.2, weapon: 0.7, torso: 0.3 }, root: { x: 10 } },
      { t: 1, pose: { armF_u: -0.75, armF_f: -0.85, weapon: -0.1 }, root: { x: 4 } },
    ],
    [
      { t: 0, pose: { armF_u: -0.1, armF_f: -1.5, weapon: 0.1, torso: -0.25, legF_t: -0.6, legF_s: 0.9 }, root: { x: -10, y: 6 } },
      { t: 0.22, pose: { armF_u: -1.55, armF_f: 0, weapon: 0, torso: 0.4, armB_u: -1.4, armB_f: 0, legF_t: -0.9, legF_s: 0.5, legB_t: 0.7, legB_s: 0.2 }, root: { x: 26, y: 6 } },
      { t: 0.6, pose: { armF_u: -1.55, armF_f: 0, weapon: 0, torso: 0.4, legF_t: -0.9, legF_s: 0.5, legB_t: 0.7, legB_s: 0.2 }, root: { x: 26, y: 6 } },
      { t: 1, pose: { armF_u: -0.75, armF_f: -0.85, weapon: -0.1 }, root: { x: 6 } },
    ],
  ],
  daggers: [
    [
      { t: 0, pose: { armF_u: -2.4, armF_f: -0.6, weapon: -0.4, torso: -0.1 } },
      { t: 0.2, pose: { armF_u: -0.9, armF_f: -0.2, weapon: 0.1, torso: 0.2 }, root: { x: 8 } },
      { t: 0.55, pose: { armF_u: 0.1, armF_f: -0.5, weapon: 0.4, torso: 0.25 }, root: { x: 9 } },
      { t: 1, pose: { armF_u: -0.45, armF_f: -1.5, weapon: -1.6 }, root: { x: 3 } },
    ],
    [
      { t: 0, pose: { armB_u: -2.5, armB_f: -0.5, weaponB: -0.4, torso: -0.1, armF_u: 0.3 } },
      { t: 0.2, pose: { armB_u: -0.8, armB_f: -0.2, weaponB: 0.1, torso: 0.25, armF_u: 0.5 }, root: { x: 9 } },
      { t: 0.55, pose: { armB_u: 0.2, armB_f: -0.5, weaponB: 0.4, torso: 0.3 }, root: { x: 10 } },
      { t: 1, pose: { armB_u: 0.35, armB_f: -1.2, weaponB: -1.4 }, root: { x: 3 } },
    ],
    [
      { t: 0, pose: { armF_u: -1.6, armF_f: 0, weapon: 0, armB_u: 1.6, armB_f: 0, weaponB: 0, torso: 0.1 }, root: { sx: 1 } },
      { t: 0.3, pose: { armF_u: -1.6, armF_f: 0, weapon: 0, armB_u: 1.6, armB_f: 0, weaponB: 0, torso: 0.1 }, root: { x: 14, sx: -1, y: -8 } },
      { t: 0.6, pose: { armF_u: -1.6, armF_f: 0, weapon: 0, armB_u: 1.6, armB_f: 0, weaponB: 0, torso: 0.1 }, root: { x: 20, sx: 1, y: -4 } },
      { t: 1, pose: { armF_u: -0.45, armF_f: -1.5, weapon: -1.6, armB_u: 0.35, weaponB: -1.4 }, root: { x: 6 } },
    ],
  ],
};

const SHOOT: Key[] = [
  { t: 0, pose: { armF_u: -0.5, armF_f: -2.1, torso: -0.15, armB_u: -0.6, armB_f: -1.8 }, root: { x: -4 } },
  { t: 0.25, pose: { armF_u: -1.6, armF_f: -0.05, handF: -0.2, torso: 0.12, armB_u: 0.7, armB_f: -0.6 }, root: { x: 6 } },
  { t: 0.45, pose: { armF_u: -1.45, armF_f: -0.1, torso: -0.05, armB_u: 0.7 }, root: { x: -2 } },
  { t: 1, pose: { armF_u: -1.2, armF_f: -0.5, torso: 0, armB_u: 0.4 }, root: { x: 0 } },
];

const BURST: Record<WeaponStyle, Key[]> = {
  sword: [
    { t: 0, pose: { armF_u: 0.5, armF_f: -0.4, weapon: 0.7, torso: 0.45, legF_t: -0.9, legF_s: 1.4, legB_t: 0.4, legB_s: 1.2 }, root: { y: 14 } },
    { t: 0.25, pose: { armF_u: -3.0, armF_f: -0.2, weapon: -0.4, torso: -0.25, legF_t: -0.3, legF_s: 0.3, legB_t: 0.2, legB_s: 0.3, armB_u: 0.8 }, root: { x: 10, y: -30 } },
    { t: 0.7, pose: { armF_u: -3.0, armF_f: -0.3, weapon: -0.5, torso: -0.2, legF_t: -0.6, legF_s: 1.0 }, root: { x: 10, y: -24 } },
    { t: 1, pose: { armF_u: -0.55, armF_f: -1.25, weapon: -0.95 }, root: { y: 0 } },
  ],
  fists: [
    { t: 0, pose: { armF_u: 0.9, armF_f: -0.8, armB_u: 0.9, torso: -0.3 }, root: { x: -6 } },
    { t: 0.25, pose: { armF_u: -1.8, armF_f: -0.1, armB_u: -1.4, armB_f: -0.2, torso: 0.45, legF_t: -0.8, legF_s: 0.5, legB_t: 0.7 }, root: { x: 18, y: 6 } },
    { t: 0.7, pose: { armF_u: -1.6, armF_f: -0.2, armB_u: -1.2, torso: 0.4, legF_t: -0.8, legF_s: 0.5, legB_t: 0.7 }, root: { x: 18, y: 6 } },
    { t: 1, pose: { armF_u: -0.75, armF_f: -1.9 }, root: { x: 4 } },
  ],
  lance: [
    { t: 0, pose: { armF_u: -2.9, armF_f: -0.2, weapon: 3.0, torso: -0.2, armB_u: -2.6 }, root: { y: -12 } },
    { t: 0.25, pose: { armF_u: -0.8, armF_f: 0, weapon: 2.9, torso: 0.3, armB_u: -0.6, legF_t: -0.8, legF_s: 1.2, legB_t: 0.5, legB_s: 1.0 }, root: { y: 12 } },
    { t: 0.75, pose: { armF_u: -0.8, armF_f: 0, weapon: 2.9, torso: 0.3, legF_t: -0.8, legF_s: 1.2, legB_t: 0.5, legB_s: 1.0 }, root: { y: 12 } },
    { t: 1, pose: { armF_u: -0.75, armF_f: -0.85, weapon: -0.1 }, root: { y: 0 } },
  ],
  daggers: [
    { t: 0, pose: { armF_u: -1.6, armF_f: 0, armB_u: 1.6, armB_f: 0, weapon: 0, weaponB: 0 }, root: { sx: 1 } },
    { t: 0.2, pose: { armF_u: -1.6, armF_f: 0, armB_u: 1.6, armB_f: 0, weapon: 0, weaponB: 0 }, root: { sx: -1, y: -6 } },
    { t: 0.45, pose: { armF_u: -1.6, armF_f: 0, armB_u: 1.6, armB_f: 0, weapon: 0, weaponB: 0 }, root: { sx: 1, y: -6 } },
    { t: 0.7, pose: { armF_u: -1.6, armF_f: 0, armB_u: 1.6, armB_f: 0, weapon: 0, weaponB: 0 }, root: { sx: -1, y: -4 } },
    { t: 1, pose: { armF_u: -0.45, armF_f: -1.5, weapon: -1.6, armB_u: 0.35, weaponB: -1.4 }, root: { sx: 1 } },
  ],
};

const ULT_CHARGE: Pose = {
  armF_u: -2.4, armF_f: -0.6, armB_u: -2.2, armB_f: -0.6, torso: -0.22, head: -0.3,
  legF_t: -0.5, legF_s: 0.9, legB_t: 0.3, legB_s: 0.9, weapon: -0.2, weaponB: -0.2,
};

const add = (a: Pose, b: Pose) => {
  const out: Pose = { ...a };
  for (const k of Object.keys(b)) out[k] = (out[k] ?? 0) + b[k];
  return out;
};

export const animateHero = (style: WeaponStyle, a: AnimInput): AnimOut => {
  const guard = GUARD[style];
  const t = a.time;
  const root: RootPose = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };
  const withRoot = (r: Partial<RootPose>) => Object.assign(root, r);
  let pose: Pose;
  let stiffness = 18;
  let trail = false;

  switch (a.state) {
    case "idle": {
      const b = Math.sin(t * 2.6);
      pose = mergePose(STANCE, guard, {
        torso: 0.05 + b * 0.025,
        head: -0.04 - b * 0.02,
        armF_u: (guard.armF_u ?? 0) + b * 0.04,
        armB_u: (guard.armB_u ?? 0) - b * 0.04,
      });
      root.y = 2 + b * 1.5;
      stiffness = 12;
      break;
    }
    case "run": {
      const ratio = Math.min(1.3, Math.abs(a.vx) / a.speedRef);
      const ph = a.stride;
      const s = Math.sin(ph);
      const cF = Math.cos(ph);
      const cB = Math.cos(ph + Math.PI);
      pose = mergePose(guard, {
        legF_t: -0.75 * s * ratio - 0.12,
        legF_s: 0.25 + 1.25 * Math.max(0, cF) * ratio,
        legB_t: 0.75 * s * ratio - 0.12,
        legB_s: 0.25 + 1.25 * Math.max(0, cB) * ratio,
        torso: 0.16 * ratio + Math.sin(ph * 2) * 0.03,
        head: -0.1 * ratio,
        armB_u: 0.75 * s * ratio,
        armB_f: -1.1,
      });
      if (style === "fists") pose = add(pose, { armF_u: -0.45 * s * ratio });
      else pose.armF_u = (guard.armF_u ?? 0) - 0.25 * s * ratio;
      root.y = -Math.abs(Math.cos(ph)) * 5 * ratio + 3;
      root.x = 0;
      stiffness = 26;
      break;
    }
    case "air": {
      const rising = a.vy < 0;
      const f = Phaser.Math.Clamp(-a.vy / 900, -1, 1);
      pose = mergePose(guard, {
        legF_t: rising ? -1.2 : -0.55,
        legF_s: rising ? 1.7 : 0.8,
        legB_t: rising ? -0.2 : 0.35,
        legB_s: rising ? 1.1 : 0.5,
        torso: rising ? 0.05 : 0.12,
        head: -0.1 * f,
        armB_u: rising ? -1.2 : 0.9,
        armB_f: -0.6,
      });
      if (style === "fists") pose.armF_u = rising ? -1.9 : -0.3;
      root.y = rising ? -6 : 0;
      stiffness = 14;
      break;
    }
    case "dash":
    case "sweep": {
      pose = mergePose(guard, {
        legF_t: -1.25, legF_s: 1.3, legB_t: 0.9, legB_s: 0.5,
        torso: 0.6, head: -0.45,
        armF_u: -1.2, armF_f: -0.3, armB_u: 1.2, armB_f: -0.2,
        weapon: style === "sword" ? 0.9 : guard.weapon ?? 0,
      });
      root.y = 8;
      stiffness = 40;
      trail = a.state === "sweep";
      break;
    }
    case "attack": {
      const keys = ATTACKS[style][Math.max(0, Math.min(2, a.combo - 1))];
      const s = sampleKeys(keys, a.progress);
      pose = mergePose(STANCE, guard, s.pose);
      withRoot(s.root);
      stiffness = 55;
      trail = a.progress > 0.05 && a.progress < 0.7;
      break;
    }
    case "cast": {
      if (a.cast === "shoot") {
        const s = sampleKeys(SHOOT, a.progress);
        pose = mergePose(STANCE, guard, s.pose);
        withRoot(s.root);
      } else if (a.cast === "ultCharge" || a.cast === "screen" || a.cast === "strikes") {
        // Rise and gather power, then strike down with the weapon's signature swing.
        const charge = a.progress < 0.5;
        if (charge) {
          const hover = Math.sin(t * 20) * 1.5;
          pose = mergePose(STANCE, guard, ULT_CHARGE);
          root.y = -14 + hover;
        } else {
          const s = sampleKeys(BURST[style], (a.progress - 0.5) / 0.5);
          pose = mergePose(STANCE, guard, s.pose);
          withRoot(s.root);
          trail = true;
        }
      } else {
        const s = sampleKeys(BURST[style], a.progress);
        pose = mergePose(STANCE, guard, s.pose);
        withRoot(s.root);
        trail = a.progress > 0.1 && a.progress < 0.8;
      }
      stiffness = 45;
      break;
    }
    case "hurt": {
      pose = mergePose(STANCE, guard, {
        torso: -0.4, head: -0.35, armF_u: 0.5, armF_f: -0.8, armB_u: 0.7, armB_f: -0.5,
        legF_t: -0.5, legF_s: 0.6, legB_t: 0.4, legB_s: 0.3,
      });
      root.x = -8;
      stiffness = 30;
      break;
    }
    case "stun": {
      const w = Math.sin(t * 9) * 0.12;
      pose = mergePose(STANCE, { torso: 0.3 + w, head: 0.4 - w, armF_u: 0.2, armF_f: -0.2, armB_u: 0.3, armB_f: -0.2, legF_s: 0.6, legB_s: 0.6 });
      root.y = 6;
      stiffness = 10;
      break;
    }
    case "down": {
      pose = { torso: -0.2, head: -0.3, armF_u: -2.2, armF_f: -0.3, armB_u: -2.6, armB_f: -0.2, legF_t: -0.2, legF_s: 0.4, legB_t: 0.1, legB_s: 0.2 };
      root.rot = -1.45;
      root.y = -6;
      root.x = -60;
      stiffness = 8;
      break;
    }
  }

  // Landing: knees absorb the impact.
  if (a.land > 0 && (a.state === "idle" || a.state === "run")) {
    const l = a.land;
    pose = add(pose!, { legF_t: -0.45 * l, legF_s: 0.9 * l, legB_t: -0.25 * l, legB_s: 0.8 * l, torso: 0.25 * l });
    root.y += 12 * l;
  }

  return { pose: pose!, root, stiffness, trail };
};

export const heroRibbonAnchor = (kind: HeroLook["ribbon"]["kind"]): [string, number, number] => {
  switch (kind) {
    case "plume":
      return ["head", -4, -28];
    case "cape":
      return ["torso", -6, -42];
    default:
      return ["torso", -4, -44];
  }
};

export { key as rigKey, shade };
