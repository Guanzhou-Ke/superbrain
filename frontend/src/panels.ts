export function clampPanelWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(width)));
}

export function readStoredPanelWidth(
  getItem: (key: string) => string | null,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = getItem(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return clampPanelWidth(parsed, min, max);
}
