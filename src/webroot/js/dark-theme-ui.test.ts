import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cfg: new Map<string, string>(),
  subpageConfig: null as unknown,
  systemDark: true,
}));

const { cfgGet, cfgSet, applyMode, openSubPage, wireRowDialog } = vi.hoisted(() => ({
  cfgGet: vi.fn(async (key: string, def = '') => h.cfg.get(key) ?? def),
  cfgSet: vi.fn((key: string, value: string) => { h.cfg.set(key, value); }),
  applyMode: vi.fn(),
  openSubPage: vi.fn((config: unknown) => { h.subpageConfig = config; }),
  wireRowDialog: vi.fn(),
}));

vi.mock('./cfg.js', () => ({ cfgGet, cfgSet }));
vi.mock('./theme.js', () => ({ applyMode }));
vi.mock('./subpage.js', () => ({ openSubPage }));
vi.mock('./toggles.js', () => ({ wireRowDialog }));
vi.mock('./i18n.js', () => ({ t: (_key: string, fallback = '') => fallback }));

import { openDarkThemeDialog, updateDarkThemeSummary, wireDarkTheme } from './dark-theme-ui.js';

type SwitchEl = HTMLElement & { selected: boolean };

interface DarkConfig {
  masterToggle: {
    getValue: () => boolean;
    setValue: (enabled: boolean) => void;
  };
  groups: { items: Record<string, unknown>[] }[];
  onClose: () => void;
}

function setupSummary(mode: string) {
  document.documentElement.setAttribute('data-theme', mode);
  document.body.innerHTML = `
    <span id="dark-theme-summary"></span>
    <md-switch id="dark-theme-switch"></md-switch>`;
}

describe('dark theme ui', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
    h.cfg.clear();
    h.subpageConfig = null;
    h.systemDark = true;
    vi.clearAllMocks();
    cfgGet.mockImplementation(async (key: string, def = '') => h.cfg.get(key) ?? def);
    openSubPage.mockImplementation((config: unknown) => { h.subpageConfig = config; });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: h.systemDark })));
  });

  it('summarizes each theme mode and syncs the switch', () => {
    setupSummary('amoled');
    updateDarkThemeSummary();
    expect(document.getElementById('dark-theme-summary')?.textContent).toBe('On (AMOLED)');
    expect((document.getElementById('dark-theme-switch') as SwitchEl).selected).toBe(true);

    setupSummary('light');
    updateDarkThemeSummary();
    expect(document.getElementById('dark-theme-summary')?.textContent).toBe('Off');
    expect((document.getElementById('dark-theme-switch') as SwitchEl).selected).toBe(false);

    setupSummary('auto');
    updateDarkThemeSummary();
    expect(document.getElementById('dark-theme-summary')?.textContent).toBe('Follow system');
    expect((document.getElementById('dark-theme-switch') as SwitchEl).selected).toBe(true);
  });

  it('wireDarkTheme applies the stored variant when the switch flips', async () => {
    setupSummary('dark');
    document.body.innerHTML += `
      <div id="dark-theme-row"><sp-settings-row data-config></sp-settings-row></div>`;
    h.cfg.set('theme_dark_variant', 'amoled');
    wireDarkTheme();
    expect(wireRowDialog).toHaveBeenCalledWith('dark-theme-row', expect.any(Function));

    const sw = document.getElementById('dark-theme-switch') as SwitchEl;
    expect(sw.selected).toBe(true);

    sw.selected = false;
    sw.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(applyMode).toHaveBeenCalledWith('light'));

    sw.selected = true;
    sw.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(applyMode).toHaveBeenCalledWith('amoled'));
  });

  it('dialog master toggle and variant radios drive applyMode and config', async () => {
    setupSummary('dark');
    h.cfg.set('theme', 'dark');
    h.cfg.set('theme_dark_variant', 'dark');
    await openDarkThemeDialog();
    const config = h.subpageConfig as DarkConfig;

    expect(config.masterToggle.getValue()).toBe(true);
    config.masterToggle.setValue(false);
    expect(applyMode).toHaveBeenCalledWith('light');
    config.masterToggle.setValue(true);
    expect(applyMode).toHaveBeenCalledWith('dark');

    const amoled = config.groups[0]!.items[1]! as { selected: boolean; onSelect: () => void };
    const standard = config.groups[0]!.items[0]! as { selected: boolean; onSelect: () => void };
    expect(standard.selected).toBe(true);
    expect(amoled.selected).toBe(false);

    amoled.onSelect();
    expect(cfgSet).toHaveBeenCalledWith('theme_dark_variant', 'amoled');
    expect(applyMode).toHaveBeenCalledWith('amoled');

    const autoItem = config.groups[1]!.items[0]! as { onChange: (v: boolean) => void; defaultVal: string };
    autoItem.onChange(true);
    expect(applyMode).toHaveBeenCalledWith('auto');
    autoItem.onChange(false);
    expect(applyMode).toHaveBeenCalledWith('amoled'); // system dark + amoled variant

    config.onClose();
    expect(document.getElementById('dark-theme-summary')?.textContent).toBe('On (Standard)');
  });
});
