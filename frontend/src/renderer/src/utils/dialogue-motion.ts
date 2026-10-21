interface MotionAdapter {
  getMotionGroups(): string[];
  getMotionCount(group: string): number;
  startMotion(group: string, index: number, priority: number): unknown;
}

const allowed = new Set([
  'mtn_idle01_C', 'mtn_nod01_C', 'mtn_smile01_C', 'mtn_thinking01_C',
  'mtn_surprised01_C', 'mtn_bye01_C', 'mtn_sad01_C', 'mtn_denial01_C',
]);

/** Play only authored, allowlisted motions present in the loaded model. */
export function playDialogueMotion(
  adapter: MotionAdapter | null | undefined,
  requested?: string[] | null,
): string | null {
  if (!adapter) return null;
  const groups = adapter.getMotionGroups();
  const candidate = requested?.[0];
  const group = candidate && allowed.has(candidate) && groups.includes(candidate)
    ? candidate
    : ['mtn_idle01_C', 'Talk', 'Idle'].find((name) => groups.includes(name));
  if (!group || adapter.getMotionCount(group) < 1) return null;
  adapter.startMotion(group, 0, 3);
  return group;
}
