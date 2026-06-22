import { describe, expect, it } from 'vitest';
import { clampPanelWidth, readStoredPanelWidth } from './panels';

describe('panel layout helpers', () => {
  it('clamps panel widths to configured bounds', () => {
    expect(clampPanelWidth(120, 180, 420)).toBe(180);
    expect(clampPanelWidth(300, 180, 420)).toBe(300);
    expect(clampPanelWidth(520, 180, 420)).toBe(420);
  });

  it('falls back when stored width is missing or invalid', () => {
    const storage = new Map<string, string>();
    const getItem = (key: string) => storage.get(key) ?? null;

    expect(readStoredPanelWidth(getItem, 'left', 220, 180, 420)).toBe(220);
    storage.set('left', 'not-a-number');
    expect(readStoredPanelWidth(getItem, 'left', 220, 180, 420)).toBe(220);
    storage.set('left', '999');
    expect(readStoredPanelWidth(getItem, 'left', 220, 180, 420)).toBe(420);
  });
});
