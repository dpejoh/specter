import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openSubPage } = vi.hoisted(() => ({
  openSubPage: vi.fn(async (_config: object) => ({
    overlay: document.createElement('div'),
    close: vi.fn(),
    isMasterEnabled: () => true,
  })),
}));

vi.mock('./subpage.js', () => ({ openSubPage }));

import { openAutoTargetDialog } from './auto-target-ui.js';

describe('auto-target detection UI', () => {
  beforeEach(() => {
    openSubPage.mockClear();
    localStorage.clear();
  });

  it('uses radio options with instant detection recommended', async () => {
    await openAutoTargetDialog();

    const config = openSubPage.mock.calls[0]![0] as unknown as {
      groups: { title: string; items: Record<string, unknown>[] }[];
    };
    const detection = config.groups[0]!;
    const items = detection.items;

    expect(config.groups).toHaveLength(1);
    expect(detection.title).toBe('Detection');
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      type: 'radio',
      value: 'instant',
      badge: 'Recommended',
      selected: true,
    });
    expect(items[1]).toMatchObject({
      type: 'radio',
      value: 'polling',
      selected: false,
    });
    expect(items[2]).toMatchObject({
      type: 'input',
      id: 'at-interval',
      min: 1,
      max: 60,
      unit: 'minutes',
    });
  });

  it('renders the interval in minutes and saves seconds', async () => {
    await openAutoTargetDialog();

    const config = openSubPage.mock.calls[0]![0] as unknown as {
      groups: { items: Record<string, unknown>[] }[];
    };
    const intervalItem = config.groups[0]!.items[2] as {
      getValue: () => string;
      onChange: (value: string) => void;
    };

    expect(intervalItem.getValue()).toBe('5');

    intervalItem.onChange('12');
    expect(localStorage.getItem('sp_cfg_auto_target_interval')).toBe('720');

    intervalItem.onChange('0');
    expect(localStorage.getItem('sp_cfg_auto_target_interval')).toBe('720');
  });
});
