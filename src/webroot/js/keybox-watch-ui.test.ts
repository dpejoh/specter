import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: null as any,
  cfgGet: vi.fn(async () => '3600'),
  cfgSet: vi.fn(),
}));

vi.mock('./subpage.js', () => ({
  openSubPage: vi.fn(async (config: any) => {
    mocks.config = config;
    return { overlay: document.createElement('div'), close: vi.fn(), isMasterEnabled: () => true };
  }),
}));

vi.mock('./cfg.js', () => ({
  cfgGet: mocks.cfgGet,
  cfgSet: mocks.cfgSet,
}));

import { openKeyboxWatchDialog } from './keybox-watch-ui.js';

describe('keybox refresh settings', () => {
  beforeEach(() => {
    mocks.config = null;
    mocks.cfgGet.mockClear();
    mocks.cfgSet.mockClear();
  });

  it('reads and writes the interval in minutes', async () => {
    await openKeyboxWatchDialog();

    const input = mocks.config.groups[0].items[1];
    expect(await input.getValue()).toBe('60');
    input.onChange('10');
    expect(mocks.cfgSet).toHaveBeenCalledWith('keybox_watch_interval', '600');
  });

  it('defaults the replace-if-revoked toggle to on', async () => {
    await openKeyboxWatchDialog();

    const replace = mocks.config.groups[0].items[0];
    expect(replace.type).toBe('switch');
    expect(replace.key).toBe('toggle_keybox_auto_replace');
    expect(replace.defaultVal).toBe('1');
  });
});
