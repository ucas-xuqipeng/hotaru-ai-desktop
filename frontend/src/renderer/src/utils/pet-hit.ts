type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };

export function fitPetProjection(projection: { scale(x: number, y: number): void;
  scaleRelative(x: number, y: number): void }) {
  projection.scaleRelative(0.86, 0.86);
}

export function petModelPoint(point: Point, width: number, height: number): Point {
  const unit = Math.min(width, height) * 0.86 / 2;
  return { x: (point.x - width / 2) / unit, y: (height / 2 - point.y) / unit };
}

export function petHitTarget(point: Point, width: number, height: number, panels: Rect[],
  hitModel: (x: number, y: number) => boolean): 'input-subtitle' | 'live2d-model' | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) return null;
  if (panels.some(r => point.x >= r.left && point.x < r.right
    && point.y >= r.top && point.y < r.bottom)) return 'input-subtitle';
  try { return hitModel(point.x, point.y) ? 'live2d-model' : null; } catch { return null; }
}
