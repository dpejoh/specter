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
    cfgGet: vi.fn(async () => '86400'),
    cfgSet: vi.fn(),
  };
});

vi.mock('./subpage.js', () => ({ openSubPage: mocks.openSubPage }));
vi.mock('./cfg.js', () => ({ cfgGet: mocks.cfgGet, cfgSet: mocks.cfgSet }));

import { openAutopifDialog, wireAutopif } from './autopif-ui.js';

interface AutopifConfig {
  id: string;
  masterToggle: { key: string; defaultVal: string; syncSwitchId: string };
  groups: { items: AutopifInput[] }[];
}

interface AutopifInput {
  type: string;
  id: string;
  inputType: string;
  min: number;
  unit: string;
  getValue: () => Promise<string>;
  onChange: (value: string) => void;
}

function openPage(): { config: AutopifConfig; input: AutopifInput } {
  openAutopifDialog();
  const config = mocks.state.config as AutopifConfig;
  return { config, input: config.groups[0]!.items[0]! };
}

describe('auto PIF subpage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mocks.state.config = null;
    mocks.openSubPage.mockClear();
    mocks.cfgGet.mockReset();
    mocks.cfgGet.mockResolvedValue('86400');
    mocks.cfgSet.mockReset();
  });

  it('opens with the master toggle and the interval input', () => {
    const { config, input } = openPage();

    expect(config.id).toBe('autopif');
    expect(config.masterToggle).toMatchObject({
      key: 'toggle_autopif',
      defaultVal: '0',
      syncSwitchId: 'toggle-background_autopif',
    });
    expect(input).toMatchObject({
      type: 'input',
      id: 'ap-interval',
      inputType: 'number',
      min: 1,
      unit: 'hrs',
    });
    expect(input.getValue).toBeTypeOf('function');
    expect(input.onChange).toBeTypeOf('function');
  });

  it('reads the interval in hours and falls back to the default', async () => {
    const { input } = openPage();

    mocks.cfgGet.mockResolvedValueOnce('86400');
    await expect(input.getValue()).resolves.toBe('24');

    mocks.cfgGet.mockResolvedValueOnce('3600');
    await expect(input.getValue()).resolves.toBe('1');

    mocks.cfgGet.mockResolvedValueOnce('7200');
    await expect(input.getValue()).resolves.toBe('2');

    mocks.cfgGet.mockResolvedValueOnce('1800');
    await expect(input.getValue()).resolves.toBe('1');

    mocks.cfgGet.mockResolvedValueOnce('0');
    await expect(input.getValue()).resolves.toBe('24');

    mocks.cfgGet.mockResolvedValueOnce('');
    await expect(input.getValue()).resolves.toBe('24');

    mocks.cfgGet.mockResolvedValueOnce('not-a-number');
    await expect(input.getValue()).resolves.toBe('24');

    expect(mocks.cfgGet).toHaveBeenCalledWith('autopif_interval', '86400');
  });

  it('writes the interval back in seconds with a minimum of one hour', () => {
    const { input } = openPage();

    input.onChange('48');
    expect(mocks.cfgSet).toHaveBeenLastCalledWith('autopif_interval', '172800');

    input.onChange('0');
    expect(mocks.cfgSet).toHaveBeenLastCalledWith('autopif_interval', '3600');

    input.onChange('-5');
    expect(mocks.cfgSet).toHaveBeenLastCalledWith('autopif_interval', '3600');

    input.onChange('');
    expect(mocks.cfgSet).toHaveBeenLastCalledWith('autopif_interval', '86400');

    input.onChange('1.9');
    expect(mocks.cfgSet).toHaveBeenLastCalledWith('autopif_interval', '3600');

    input.onChange('not-a-number');
    expect(mocks.cfgSet).toHaveBeenLastCalledWith('autopif_interval', '86400');

    for (const call of mocks.cfgSet.mock.calls) {
      expect(call[1]).not.toBe('NaN');
    }
  });

  it('falls back to the default when the config read fails', async () => {
    const { input } = openPage();

    mocks.cfgGet.mockRejectedValueOnce(new Error('no bridge'));
    await expect(input.getValue()).resolves.toBe('24');
    expect(mocks.cfgSet).not.toHaveBeenCalled();
  });

  it('wires the auto-PIF row to the page', () => {
    document.body.innerHTML = '<div id="toggle-background_autopif-row"></div>';
    const row = document.getElementById('toggle-background_autopif-row')!;

    wireAutopif();
    expect(row.dataset.spWired).toBe('1');

    row.dispatchEvent(new Event('sp-activate'));
    expect(mocks.openSubPage).toHaveBeenCalledTimes(1);
    expect((mocks.state.config as AutopifConfig).id).toBe('autopif');
  });
});
