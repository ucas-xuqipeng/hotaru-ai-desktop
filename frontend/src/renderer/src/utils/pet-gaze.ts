export function idleGaze(point: { x: number; y: number }, width: number, height: number,
  state: string, dragging: boolean, editing: boolean, elapsed: number) {
  if (state !== 'idle' || dragging || editing || elapsed < 2500
    || width <= 0 || height <= 0 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return { x: 0, y: 0 };
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  return { x: clamp((point.x - width / 2) / (width * 1.4), 0.65),
    y: clamp((height * 0.23 - point.y) / height, 0.45) };
}
