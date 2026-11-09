import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    cfgValues: {} as Record<string, string>,
    intervalRowMode: 'full' as 'full' | 'input-only' | 'none',
  };
  const makeOverlay = () => {
    const overlay = document.createElement('div');
    if (state.intervalRowMode !== 'none') {
      const row = document.createElement('div');
      row.id = 'at-interval-row';
      if (state.intervalRowMode === 'full') {
        const help = document.createElement('span');
        help.className = 'supporting-text';
        help.textContent = 'Minimum 1 minute.';
        row.append(help);
      }
      const input = document.createElement('input');
      input.id = 'at-interval';
      row.append(input);
      overlay.append(row);
    }
    return overlay;
  };
  return {
    state,
    cfgGet: vi.fn(async (key: string, fallback = '') => (
      key in state.cfgValues ? state.cfgValues[key] : fallback
    )),
    cfgSet: vi.fn(async (key: string, value?: string | null) => {
      state.cfgValues[key] = value ?? '';
    }),
    wireRowDialog: vi.fn(),
    openSubPage: vi.fn(async (_config: object) => ({
      overlay: makeOverlay(),
      close: vi.fn(),
      isMasterEnabled: () => true,
    })),
  };
});

vi.mock('./subpage.js', () => ({ openSubPage: mocks.openSubPage }));
vi.mock('./cfg.js', () => ({ cfgGet: mocks.cfgGet, cfgSet: mocks.cfgSet }));
vi.mock('./toggles.js', () => ({ wireRowDialog: mocks.wireRowDialog }));

import { openAutoTargetDialog, wireAutoTarget } from './auto-target-ui.js';
import { t } from './i18n.js';

interface RadioItem {
  type: 'radio';
  value: string;
  selected: boolean;
  onSelect: () => void;
}

interface IntervalItem {
  type: 'input';
  id: string;
  getValue: () => string;
  onChange: (value: string) => void;
}

interface AutoTargetConfig {
  id: string;
  title: string;
  masterToggle: { key: string; defaultVal: string; syncSwitchId: string };
  groups: { title: string; items: (RadioItem | IntervalItem)[] }[];
}

const config = () => mocks.openSubPage.mock.calls[
  mocks.openSubPage.mock.calls.length - 1
]![0] as unknown as AutoTargetConfig;

const detectionItems = (cfg: AutoTargetConfig) => cfg.groups[0]!.items as RadioItem[];
const intervalItem = (cfg: AutoTargetConfig) => cfg.groups[0]!.items[2] as IntervalItem;
const intervalRow = () => mocks.openSubPage.mock.results[
  mocks.openSubPage.mock.results.length - 1
]!.value as Promise<{ overlay: HTMLElement }>;

const overlayRow = async () => (await intervalRow()).overlay.querySelector('#at-interval-row') as HTMLElement;
const overlayInput = async () => (await intervalRow()).overlay.querySelector('#at-interval') as HTMLInputElement;
const overlayHelp = async () => (await intervalRow()).overlay.querySelector('.supporting-text') as HTMLElement;

const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('auto-target detection UI', () => {
  beforeEach(() => {
    mocks.state.cfgValues = {};
    mocks.state.intervalRowMode = 'full';
    mocks.cfgGet.mockClear();
    mocks.cfgSet.mockClear();
    mocks.wireRowDialog.mockClear();
    mocks.openSubPage.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    mocks.state.intervalRowMode = 'full';
  });

  it('uses radio options with instant detection recommended', async () => {
    await openAutoTargetDialog();

    const cfg = config();
    const detection = cfg.groups[0]!;
    const items = detection.items;

    expect(cfg.id).toBe('auto-target');
    expect(cfg.title).toBe('Auto Targeting');
    expect(cfg.masterToggle).toMatchObject({
      key: 'toggle_auto_target',
      defaultVal: '1',
      syncSwitchId: 'toggle-background_auto_target',
    });
    expect(cfg.groups).toHaveLength(1);
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
    expect((await overlayRow()).hidden).toBe(true);
  });

  it('renders the interval in minutes and saves seconds', async () => {
    await openAutoTargetDialog();

    const item = intervalItem(config());

    expect(item.getValue()).toBe('5');

    item.onChange('12');
    expect(mocks.cfgSet).toHaveBeenCalledWith('auto_target_interval', '720');
    expect(mocks.state.cfgValues.auto_target_interval).toBe('720');

    item.onChange('0');
    expect(mocks.cfgSet).not.toHaveBeenCalledWith('auto_target_interval', '0');
    expect(mocks.state.cfgValues.auto_target_interval).toBe('720');
  });

  it('loads the stored polling method and interval', async () => {
    mocks.state.cfgValues.auto_target_method = 'polling';
    mocks.state.cfgValues.auto_target_interval = '900';

    await openAutoTargetDialog();

    const cfg = config();
    expect(detectionItems(cfg)[0]!.selected).toBe(false);
    expect(detectionItems(cfg)[1]!.selected).toBe(true);
    expect(intervalItem(cfg).getValue()).toBe('15');
    expect((await overlayRow()).hidden).toBe(false);
    expect((await overlayRow()).classList.contains('at-interval--visible')).toBe(true);
  });

  it('normalizes a stored interval that is not a whole number of minutes', async () => {
    mocks.state.cfgValues.auto_target_interval = '500';

    await openAutoTargetDialog();

    expect(intervalItem(config()).getValue()).toBe('8');
    expect(mocks.cfgSet).toHaveBeenCalledWith('auto_target_interval', '480');
  });

  it('keeps an already normalized interval without writing it back', async () => {
    mocks.state.cfgValues.auto_target_interval = '300';

    await openAutoTargetDialog();

    expect(intervalItem(config()).getValue()).toBe('5');
    expect(mocks.cfgSet.mock.calls.filter(([key]) => key === 'auto_target_interval')).toHaveLength(0);
  });

  it('rounds and clamps stored intervals', async () => {
    mocks.state.cfgValues.auto_target_interval = '90';
    await openAutoTargetDialog();
    expect(intervalItem(config()).getValue()).toBe('2');
    expect(mocks.cfgSet).toHaveBeenCalledWith('auto_target_interval', '120');

    mocks.cfgSet.mockClear();
    mocks.state.cfgValues.auto_target_interval = '0';
    await openAutoTargetDialog();
    expect(intervalItem(config()).getValue()).toBe('1');
    expect(mocks.cfgSet).toHaveBeenCalledWith('auto_target_interval', '60');

    mocks.cfgSet.mockClear();
    mocks.state.cfgValues.auto_target_interval = '999999';
    await openAutoTargetDialog();
    expect(intervalItem(config()).getValue()).toBe('60');
    expect(mocks.cfgSet).toHaveBeenCalledWith('auto_target_interval', '3600');

    mocks.cfgSet.mockClear();
    mocks.state.cfgValues.auto_target_interval = 'not-a-number';
    await openAutoTargetDialog();
    expect(intervalItem(config()).getValue()).toBe('5');
    expect(mocks.cfgSet).not.toHaveBeenCalled();
  });

  it('falls back to instant detection for an unknown method', async () => {
    mocks.state.cfgValues.auto_target_method = 'something-else';

    await openAutoTargetDialog();

    expect(detectionItems(config())[0]!.selected).toBe(true);
    expect(detectionItems(config())[1]!.selected).toBe(false);
  });

  it('defaults an empty stored interval without rewriting it', async () => {
    mocks.state.cfgValues.auto_target_interval = '';

    await openAutoTargetDialog();

    expect(intervalItem(config()).getValue()).toBe('5');
    expect(mocks.cfgSet).not.toHaveBeenCalled();
  });

  it('selecting polling stores the method and reveals the interval', async () => {
    await openAutoTargetDialog();
    const cfg = config();
    const row = await overlayRow();

    detectionItems(cfg)[1]!.onSelect();
    await settle();

    expect(mocks.cfgSet).toHaveBeenCalledWith('auto_target_method', 'polling');
    expect(row.hidden).toBe(false);
    expect(row.classList.contains('at-interval--visible')).toBe(true);
    expect(row.classList.contains('at-interval--leaving')).toBe(false);
  });

  it('selecting instant hides the interval after the leave animation', async () => {
    vi.useFakeTimers();
    await openAutoTargetDialog();
    const cfg = config();
    const row = await overlayRow();

    detectionItems(cfg)[1]!.onSelect();
    detectionItems(cfg)[0]!.onSelect();

    expect(mocks.cfgSet).toHaveBeenCalledWith('auto_target_method', 'instant');
    expect(row.classList.contains('at-interval--visible')).toBe(false);
    expect(row.classList.contains('at-interval--leaving')).toBe(true);
    expect(row.hidden).toBe(false);

    await vi.advanceTimersByTimeAsync(200);

    expect(row.hidden).toBe(true);
    expect(row.classList.contains('at-interval--leaving')).toBe(false);
  });

  it('hides the interval immediately when reduced motion is requested', async () => {
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({ matches: true })),
    });

    try {
      await openAutoTargetDialog();
      const cfg = config();
      const row = await overlayRow();

      detectionItems(cfg)[1]!.onSelect();
      detectionItems(cfg)[0]!.onSelect();

      expect(row.hidden).toBe(true);
      expect(row.classList.contains('at-interval--leaving')).toBe(false);
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });

  it('cancels a pending hide animation when polling is selected again', async () => {
    vi.useFakeTimers();
    await openAutoTargetDialog();
    const cfg = config();
    const row = await overlayRow();

    detectionItems(cfg)[1]!.onSelect();
    detectionItems(cfg)[0]!.onSelect();
    detectionItems(cfg)[1]!.onSelect();

    await vi.advanceTimersByTimeAsync(250);

    expect(row.hidden).toBe(false);
    expect(row.classList.contains('at-interval--visible')).toBe(true);
    expect(row.classList.contains('at-interval--leaving')).toBe(false);
  });

  it('resets the interval input when switching back to instant', async () => {
    await openAutoTargetDialog();
    const cfg = config();
    const input = await overlayInput();

    intervalItem(cfg).onChange('20');
    detectionItems(cfg)[1]!.onSelect();
    detectionItems(cfg)[0]!.onSelect();

    expect(input.value).toBe('20');
    expect(input.classList.contains('subpage-inline-input--invalid')).toBe(false);
  });

  it('validates the interval range and clears the error for a valid value', async () => {
    await openAutoTargetDialog();
    const cfg = config();
    const item = intervalItem(cfg);
    const input = await overlayInput();
    const help = await overlayHelp();

    for (const invalid of ['0', '61', '1.5', 'abc']) {
      item.onChange(invalid);
      expect(input.classList.contains('subpage-inline-input--invalid')).toBe(true);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(help.classList.contains('supporting-text--error')).toBe(true);
      expect(help.textContent).toBe(t('auto_target_interval_error', 'Enter a number from 1 to 60.'));
    }
    expect(mocks.cfgSet).not.toHaveBeenCalled();

    item.onChange('30');
    expect(mocks.cfgSet).toHaveBeenCalledWith('auto_target_interval', '1800');
    expect(input.classList.contains('subpage-inline-input--invalid')).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(help.classList.contains('supporting-text--error')).toBe(false);
    expect(help.textContent).toBe(t('auto_target_interval_desc', 'Minimum 1 minute.'));
  });

  it('labels the interval input for assistive technology', async () => {
    await openAutoTargetDialog();

    const input = await overlayInput();
    const help = await overlayHelp();

    expect(input.getAttribute('aria-describedby')).toBe('at-interval-help');
    expect(help.id).toBe('at-interval-help');
    expect(help.getAttribute('aria-live')).toBe('polite');
  });

  it('handles a missing interval row', async () => {
    mocks.state.intervalRowMode = 'none';
    await openAutoTargetDialog();

    const cfg = config();
    expect(() => detectionItems(cfg)[1]!.onSelect()).not.toThrow();
    expect(() => detectionItems(cfg)[0]!.onSelect()).not.toThrow();
    expect(mocks.cfgSet).toHaveBeenCalledWith('auto_target_method', 'polling');
    expect(mocks.cfgSet).toHaveBeenCalledWith('auto_target_method', 'instant');
  });

  it('handles a missing interval help element', async () => {
    mocks.state.intervalRowMode = 'input-only';
    await openAutoTargetDialog();

    const cfg = config();
    const input = await overlayInput();

    expect(() => intervalItem(cfg).onChange('0')).not.toThrow();
    expect(() => intervalItem(cfg).onChange('10')).not.toThrow();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(mocks.cfgSet).toHaveBeenCalledWith('auto_target_interval', '600');
  });

  it('wires the control row to open the dialog', () => {
    wireAutoTarget();

    expect(mocks.wireRowDialog).toHaveBeenCalledWith(
      'toggle-background_auto_target-row',
      openAutoTargetDialog,
    );
  });
});
