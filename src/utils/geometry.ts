export type RectLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const overlaps = (a: RectLike, b: RectLike) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

export const padScore = (score: number) => Math.max(0, Math.floor(score)).toString().padStart(4, "0");
