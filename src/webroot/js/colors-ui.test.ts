import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cfg: new Map<string, string>(),
  preset: 'monet',
  subpageConfig: null as unknown,
}));

const { cfgGet, cfgSet, applyPreset, openSubPage, wireRowActivation } = vi.hoisted(() => ({
  cfgGet: vi.fn(async (key: string, def = '') => h.cfg.get(key) ?? def),
  cfgSet: vi.fn(async (key: string, value: string) => { h.cfg.set(key, value); }),
  applyPreset: vi.fn(),
  openSubPage: vi.fn((config: unknown) => { h.subpageConfig = config; }),
  wireRowActivation: vi.fn(),
}));

vi.mock('./cfg.js', () => ({ cfgGet, cfgSet }));
vi.mock('./theme.js', () => ({
  applyPreset,
  getCurrentPreset: () => h.preset,
  PRESETS: { blue: '#1157CE', red: '#B3251E', purple: '#7438D2' },
}));
vi.mock('./subpage.js', () => ({ openSubPage }));
vi.mock('./utils.js', () => ({ wireRowActivation }));
vi.mock('./i18n.js', () => ({ t: (_key: string, fallback = '') => fallback }));

import { openColorsDialog, updateColorsSummary, wireColorsUI } from './colors-ui.js';

interface ColorsConfig {
  groups: {
    items: Record<string, unknown>[];
  }[];
}

function setupSummary() {
  document.body.innerHTML = `
    <span id="color-theme-summary"></span>
    <span id="settings-color-dot"></span>`;
}

describe('colors ui', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    h.cfg.clear();
    h.preset = 'monet';
    h.subpageConfig = null;
    vi.clearAllMocks();
    cfgGet.mockImplementation(async (key: string, def = '') => h.cfg.get(key) ?? def);
    cfgSet.mockImplementation(async (key: string, value: string) => { h.cfg.set(key, value); });
    openSubPage.mockImplementation((config: unknown) => { h.subpageConfig = config; });
  });

  it('summarizes Monet with a gradient dot and fixed presets by name', () => {
    setupSummary();
    updateColorsSummary();
    expect(document.getElementById('color-theme-summary')?.textContent).toBe('System (Dynamic)');
    expect((document.getElementById('settings-color-dot') as HTMLElement).style.background)
      .toContain('linear-gradient');

    h.preset = 'purple';
    updateColorsSummary();
    expect(document.getElementById('color-theme-summary')?.textContent).toBe('Purple');
    expect((document.getElementById('settings-color-dot') as HTMLElement).style.background)
      .toContain('#7438D2');

    h.preset = 'custom-xyz';
    updateColorsSummary();
    expect(document.getElementById('color-theme-summary')?.textContent).toBe('custom-xyz');
  });

  it('dialog renders the inert phone mockup from settings components', async () => {
    await openColorsDialog();
    const config = h.subpageConfig as ColorsConfig;
    const render = config.groups[0]!.items[0]!.render as (host: HTMLElement) => void;
    const host = document.createElement('div');
    render(host);

    expect(host.querySelector('.phone-mockup')).not.toBeNull();
    expect(host.querySelectorAll('.list-item')).toHaveLength(0);
    expect(host.querySelectorAll('sp-settings-section')).toHaveLength(2);
    const rows = host.querySelectorAll('sp-settings-row');
    expect(rows).toHaveLength(4);
    expect(rows[0]!.querySelector('[slot="headline"]')?.textContent).toBe('Boot Spoofing');
    expect(rows[0]!.querySelector('md-switch')?.hasAttribute('selected')).toBe(true);
    expect(rows[1]!.classList.contains('mock-row--secondary')).toBe(true);
    expect(rows[2]!.classList.contains('mock-row--tertiary')).toBe(true);
    expect(rows[2]!.querySelector('md-switch')?.hasAttribute('selected')).toBe(false);
    expect(host.querySelectorAll('.list-title')).toHaveLength(2);
    expect(host.querySelector('.colors-preview-showcase')?.hasAttribute('inert')).toBe(true);
  });

  it('monet on: swatches are disabled; turning monet off re-enables and applies the fixed preset', async () => {
    h.cfg.set('theme_monet_switch', '1');
    h.cfg.set('theme_fixed_preset', 'blue');
    await openColorsDialog();
    const config = h.subpageConfig as ColorsConfig;

    const gridHost = document.createElement('div');
    const gridRender = config.groups[2]!.items[0]!.render as (host: HTMLElement) => void;
    gridRender(gridHost);
    const grid = gridHost.querySelector('#basic-colors-grid')!;
    expect(grid.classList.contains('colors-grid--disabled')).toBe(true);
    expect(grid.querySelectorAll('.colors-swatch-btn')).toHaveLength(9);
    expect((grid.querySelector('.colors-swatch-btn') as HTMLButtonElement).disabled).toBe(true);

    const monetItem = config.groups[1]!.items[0]! as {
      defaultVal: string;
      onChange: (checked: boolean) => Promise<void>;
    };
    expect(monetItem.defaultVal).toBe('1');
    await monetItem.onChange(false);

    expect(h.cfg.get('theme_monet_switch')).toBe('0');
    expect(h.cfg.get('theme_preset')).toBe('blue');
    expect(applyPreset).toHaveBeenCalledWith('blue');
    expect(grid.classList.contains('colors-grid--disabled')).toBe(false);
    expect((grid.querySelector('.colors-swatch-btn') as HTMLButtonElement).disabled).toBe(false);
  });

  it('swatch clicks persist and apply the chosen preset', async () => {
    h.cfg.set('theme_monet_switch', '0');
    h.preset = 'blue';
    await openColorsDialog();
    const config = h.subpageConfig as ColorsConfig;

    const gridHost = document.createElement('div');
    (config.groups[2]!.items[0]!.render as (host: HTMLElement) => void)(gridHost);
    const redBtn = gridHost.querySelector('[data-preset="red"]') as HTMLButtonElement;
    expect(gridHost.querySelector('[data-preset="blue"]')!.classList.contains('colors-swatch--selected')).toBe(true);

    redBtn.click();
    await vi.waitFor(() => expect(applyPreset).toHaveBeenCalledWith('red'));
    expect(h.cfg.get('theme_fixed_preset')).toBe('red');
    expect(h.cfg.get('theme_preset')).toBe('red');
    expect(redBtn.classList.contains('colors-swatch--selected')).toBe(true);
  });

  it('wireColorsUI activates the settings row and refreshes the summary', () => {
    setupSummary();
    document.body.innerHTML += '<div id="color-theme-row"></div>';
    h.preset = 'red';
    wireColorsUI();
    expect(wireRowActivation).toHaveBeenCalledWith(
      document.getElementById('color-theme-row'), expect.any(Function));
    expect(document.getElementById('color-theme-summary')?.textContent).toBe('Red');
  });
});
