import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    config: null as unknown,
  };
  return {
    state,
    openSubPage: vi.fn((config: unknown) => {
      state.config = config;
      return Promise.resolve({
        overlay: document.createElement('div'),
        close: vi.fn(),
        isMasterEnabled: () => true,
      });
    }),
    cfgGet: vi.fn(async () => '21600'),
    cfgSet: vi.fn(),
  };
});

vi.mock('./subpage.js', () => ({ openSubPage: mocks.openSubPage }));
vi.mock('./cfg.js', () => ({ cfgGet: mocks.cfgGet, cfgSet: mocks.cfgSet }));

import { openAutoHmaDialog, wireAutoHma } from './auto-hma-ui.js';

interface AutoHmaConfig {
  id: string;
  masterToggle: { key: string; defaultVal: string; syncSwitchId: string };
  groups: { items: AutoHmaInput[] }[];
  infoCard: { icon?: string; title: string; text: string };
}

interface AutoHmaInput {
  type: string;
  id: string;
  inputType: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  getValue: () => Promise<string>;
  onChange: (value: string) => void;
}

function openPage(): { config: AutoHmaConfig; input: AutoHmaInput } {
  openAutoHmaDialog();
  const config = mocks.state.config as AutoHmaConfig;
  return { config, input: config.groups[0]!.items[0]! };
}

describe('auto-update HMA config subpage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mocks.state.config = null;
    mocks.openSubPage.mockClear();
    mocks.cfgGet.mockReset();
    mocks.cfgGet.mockResolvedValue('21600');
    mocks.cfgSet.mockReset();
  });

  it('opens with the master toggle, interval input and info card', () => {
    const { config, input } = openPage();

    expect(config.id).toBe('auto-hma');
    expect(config.masterToggle).toMatchObject({
      key: 'toggle_auto_hma',
      defaultVal: '0',
      syncSwitchId: 'toggle-background_auto_hma',
    });
    expect(input).toMatchObject({
      type: 'input',
      id: 'auto-hma-interval-input',
      inputType: 'number',
      min: 1,
      max: 168,
      step: 1,
      unit: 'h',
    });
    expect(config.infoCard).toMatchObject({ icon: 'info', title: 'Background Updates' });
    expect(config.infoCard.text).toContain('Background updates');
  });

  it('reads the interval in hours from the stored seconds', async () => {
    const { input } = openPage();

    mocks.cfgGet.mockResolvedValueOnce('21600');
    await expect(input.getValue()).resolves.toBe('6');

    mocks.cfgGet.mockResolvedValueOnce('0');
    await expect(input.getValue()).resolves.toBe('1');

    mocks.cfgGet.mockResolvedValueOnce('3599');
    await expect(input.getValue()).resolves.toBe('1');

    mocks.cfgGet.mockResolvedValueOnce('90000');
    await expect(input.getValue()).resolves.toBe('25');

    mocks.cfgGet.mockResolvedValueOnce('');
    await expect(input.getValue()).resolves.toBe('6');

    mocks.cfgGet.mockResolvedValueOnce('not-a-number');
    await expect(input.getValue()).resolves.toBe('6');

    mocks.cfgGet.mockResolvedValueOnce('9999999');
    await expect(input.getValue()).resolves.toBe('168');

    expect(mocks.cfgGet).toHaveBeenCalledWith('hma_interval', '21600');
  });

  it('writes the interval back in seconds and clamps it to 1-168 hours', () => {
    const { input } = openPage();

    input.onChange('12');
    expect(mocks.cfgSet).toHaveBeenLastCalledWith('hma_interval', '43200');

    input.onChange('0');
    expect(mocks.cfgSet).toHaveBeenLastCalledWith('hma_interval', '3600');

    input.onChange('999');
    expect(mocks.cfgSet).toHaveBeenLastCalledWith('hma_interval', '604800');

    input.onChange('');
    expect(mocks.cfgSet).toHaveBeenLastCalledWith('hma_interval', '21600');

    input.onChange('not-a-number');
    expect(mocks.cfgSet).toHaveBeenLastCalledWith('hma_interval', '21600');

    for (const call of mocks.cfgSet.mock.calls) {
      expect(call[1]).not.toBe('NaN');
    }
  });

  it('falls back to the default when the config read fails', async () => {
    const { input } = openPage();

    mocks.cfgGet.mockRejectedValueOnce(new Error('no bridge'));
    await expect(input.getValue()).resolves.toBe('6');
    expect(mocks.cfgSet).not.toHaveBeenCalled();
  });

  it('wires the auto-HMA row to the page', () => {
    document.body.innerHTML = '<div id="toggle-background_auto_hma-row"></div>';
    const row = document.getElementById('toggle-background_auto_hma-row')!;

    wireAutoHma();
    expect(row.dataset.spWired).toBe('1');

    row.dispatchEvent(new Event('sp-activate'));
    expect(mocks.openSubPage).toHaveBeenCalledTimes(1);
    expect((mocks.state.config as AutoHmaConfig).id).toBe('auto-hma');
  });
});
