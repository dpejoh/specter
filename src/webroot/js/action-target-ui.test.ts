import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openSubPage } = vi.hoisted(() => ({ openSubPage: vi.fn() }));

vi.mock('./subpage.js', () => ({ openSubPage }));

import { openActionTargetDialog } from './action-target-ui.js';

describe('action target subpage', () => {
  beforeEach(() => openSubPage.mockClear());

  it('has a target master toggle and the force-regenerate option', () => {
    openActionTargetDialog();

    const config = openSubPage.mock.calls[0]![0] as {
      masterToggle: { key: string; defaultVal: string; syncSwitchId: string };
      groups: { items: Record<string, unknown>[] }[];
    };
    const items = config.groups.flatMap((group: { items: unknown[] }) => group.items);

    expect(config.masterToggle.key).toBe('toggle_action_target');
    expect(config.masterToggle.defaultVal).toBe('1');
    expect(config.masterToggle.syncSwitchId).toBe('toggle-action_target');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: 'toggle_action_force_target',
      defaultVal: '0',
    });
  });
});
