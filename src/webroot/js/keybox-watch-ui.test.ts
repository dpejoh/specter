import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: null as any,
  cfgGet: vi.fn(async () => '3600'),
  cfgSet: vi.fn(),
  wireRowDialog: vi.fn(),
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

vi.mock('./toggles.js', () => ({
  wireRowDialog: mocks.wireRowDialog,
}));

import { openKeyboxWatchDialog, wireKeyboxWatch } from './keybox-watch-ui.js';

describe('keybox refresh settings', () => {
  beforeEach(() => {
    mocks.config = null;
    mocks.cfgGet.mockReset();
    mocks.cfgGet.mockResolvedValue('3600');
    mocks.cfgSet.mockClear();
    mocks.wireRowDialog.mockClear();
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

  it('falls back to the default interval when the stored value is empty', async () => {
    mocks.cfgGet.mockResolvedValue('');
    await openKeyboxWatchDialog();

    const input = mocks.config.groups[0].items[1];
    expect(await input.getValue()).toBe('60');
  });

  it('falls back to the default interval when the stored value is not a number', async () => {
    mocks.cfgGet.mockResolvedValue('not-a-number');
    await openKeyboxWatchDialog();

    const input = mocks.config.groups[0].items[1];
    expect(await input.getValue()).toBe('60');
  });

  it('clamps a stored interval below one minute', async () => {
    mocks.cfgGet.mockResolvedValue('-120');
    await openKeyboxWatchDialog();

    const input = mocks.config.groups[0].items[1];
    expect(await input.getValue()).toBe('1');
  });

  it('writes the default interval for an empty or invalid input', async () => {
    await openKeyboxWatchDialog();
    const input = mocks.config.groups[0].items[1];

    input.onChange('');
    input.onChange('not-a-number');

    expect(mocks.cfgSet).toHaveBeenNthCalledWith(1, 'keybox_watch_interval', '3600');
    expect(mocks.cfgSet).toHaveBeenNthCalledWith(2, 'keybox_watch_interval', '3600');
  });

  it('clamps a zero-minute input to one minute', async () => {
    await openKeyboxWatchDialog();
    const input = mocks.config.groups[0].items[1];

    input.onChange('0');

    expect(mocks.cfgSet).toHaveBeenCalledWith('keybox_watch_interval', '60');
  });

  it('wires the background refresh row to the settings dialog', () => {
    wireKeyboxWatch();

    expect(mocks.wireRowDialog).toHaveBeenCalledWith(
      'toggle-background_keybox_info-row',
      openKeyboxWatchDialog,
    );
  });
});
