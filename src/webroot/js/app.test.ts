import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cfg: new Map<string, string>([
    ['theme', 'dark'],
    ['dev_mode', 'false'],
    ['toggle_keybox_info', '1'],
  ]),
  conflicts: [] as Array<{ key: string; friendlyName: string; features: string; prioritySpecter: boolean }>,
  execResult: { stdout: '', stderr: '', code: 0 },
  bridgeFails: false,
  pageCallbacks: new Map<string, () => unknown>(),
  homeCallback: null as null | (() => void),
  lazyClicks: [] as string[],
}));

const m = vi.hoisted(() => ({
  initBridge: vi.fn(async () => {
    if (h.bridgeFails) throw new Error('no bridge');
  }),
  getDataDir: vi.fn(() => '/data/adb/specter'),
  getModuleDir: vi.fn(() => '/data/adb/modules/specter'),
  exec: vi.fn(async () => h.execResult),
  shellEscape: (v: string) => `'${v}'`,
  setDevMode: vi.fn(),
  afterPaint: vi.fn((cb: () => void) => cb()),
  wireLazyClick: vi.fn((id: string) => { h.lazyClicks.push(id); }),
  setDataDir: vi.fn(),
  migrateLocalStorage: vi.fn(async () => {}),
  cfgInit: vi.fn(async () => {}),
  cfgGet: vi.fn(async (key: string, def = '') => h.cfg.get(key) ?? def),
  initDevice: vi.fn(async () => {}),
  refreshKeyboxStatus: vi.fn(async () => {}),
  refreshKeyboxWatchInBackground: vi.fn(async () => {}),
  refreshConflictStatus: vi.fn(async () => h.conflicts),
  reapplyKeyboxStatus: vi.fn(async () => {}),
  reapplyKeystoreManager: vi.fn(),
  initTheme: vi.fn(),
  initI18n: vi.fn(async () => {}),
  loadContributors: vi.fn(async () => {}),
  initRedirect: vi.fn(),
  showToast: vi.fn(),
  initTerminal: vi.fn(),
  renderActivityPreview: vi.fn(),
  wireTopBarScroll: vi.fn(),
  wireNavigation: vi.fn(),
  onHomeShow: vi.fn((cb: () => void) => { h.homeCallback = cb; }),
  onPageActivate: vi.fn((id: string, cb: () => unknown) => { h.pageCallbacks.set(id, cb); }),
  initFonts: vi.fn(async () => {}),
  wireFontToggles: vi.fn(),
  wireHomeCards: vi.fn(),
  initBrand: vi.fn(),
  initThemeToggle: vi.fn(),
  wireActions: vi.fn(),
  buildFriendlyNames: vi.fn(),
  wireControlRows: vi.fn(async () => {}),
  updatePlayIntegritySectionVisibility: vi.fn(async () => true),
  updateModuleConfigSectionVisibility: vi.fn(async () => true),
  wireKeybox: vi.fn(),
  wireAutoTarget: vi.fn(),
  wireAutoHma: vi.fn(),
  wireAutopif: vi.fn(),
  wireRomFingerprint: vi.fn(),
  wireAdbDisabler: vi.fn(),
  wirePropHandler: vi.fn(),
  wireGms: vi.fn(),
  wireHma: vi.fn(),
  wireActionSecurityPatch: vi.fn(),
  wireSecurityPatch: vi.fn(),
  wireOmkTrust: vi.fn(),
  wireOmkRestart: vi.fn(),
  renderControlToggles: vi.fn(),
  wireDevMode: vi.fn(),
  wireDarkTheme: vi.fn(),
  updateDarkThemeSummary: vi.fn(),
  wireLanguageUI: vi.fn(),
  updateLanguageSummary: vi.fn(),
  wireColorsUI: vi.fn(),
  updateColorsSummary: vi.fn(),
  refreshPifChooseDesc: vi.fn(),
}));

vi.mock('./bridge.js', () => ({
  initBridge: m.initBridge, getDataDir: m.getDataDir, getModuleDir: m.getModuleDir, exec: m.exec,
}));
vi.mock('./utils.js', () => ({
  shellEscape: m.shellEscape, setDevMode: m.setDevMode,
  afterPaint: m.afterPaint, wireLazyClick: m.wireLazyClick,
}));
vi.mock('./cfg.js', () => ({
  setDataDir: m.setDataDir, migrateLocalStorage: m.migrateLocalStorage,
  cfgInit: m.cfgInit, cfgGet: m.cfgGet,
}));
vi.mock('./device.js', () => ({
  initDevice: m.initDevice, refreshKeyboxStatus: m.refreshKeyboxStatus,
  refreshKeyboxWatchInBackground: m.refreshKeyboxWatchInBackground,
  refreshConflictStatus: m.refreshConflictStatus, reapplyKeyboxStatus: m.reapplyKeyboxStatus,
  reapplyKeystoreManager: m.reapplyKeystoreManager,
}));
vi.mock('./theme.js', () => ({ initTheme: m.initTheme }));
vi.mock('./i18n.js', () => ({
  initI18n: m.initI18n, t: (_key: string, fallback = '') => fallback,
}));
vi.mock('./contributors.js', () => ({ loadContributors: m.loadContributors }));
vi.mock('./redirect.js', () => ({ initRedirect: m.initRedirect }));
vi.mock('./toast.js', () => ({ showToast: m.showToast }));
vi.mock('./terminal.js', () => ({ initTerminal: m.initTerminal }));
vi.mock('./history.js', () => ({ renderActivityPreview: m.renderActivityPreview }));
vi.mock('./navigation.js', () => ({
  wireTopBarScroll: m.wireTopBarScroll, wireNavigation: m.wireNavigation, onHomeShow: m.onHomeShow,
}));
vi.mock('./page-loader.js', () => ({ onPageActivate: m.onPageActivate }));
vi.mock('./font.js', () => ({ initFonts: m.initFonts, wireFontToggles: m.wireFontToggles }));
vi.mock('./home-cards.js', () => ({ wireHomeCards: m.wireHomeCards }));
vi.mock('./brand.js', () => ({ initBrand: m.initBrand }));
vi.mock('./theme-toggle.js', () => ({ initThemeToggle: m.initThemeToggle }));
vi.mock('./constants.js', () => ({
  FEATURE_I18N_KEYS: { security_patch: 'control_toggle_action_security_patch' },
}));
vi.mock('./actions.js', () => ({ wireActions: m.wireActions, buildFriendlyNames: m.buildFriendlyNames }));
vi.mock('./control-ui.js', () => ({ wireControlRows: m.wireControlRows }));
vi.mock('./pif-section.js', () => ({ updatePlayIntegritySectionVisibility: m.updatePlayIntegritySectionVisibility }));
vi.mock('./module-config-section.js', () => ({ updateModuleConfigSectionVisibility: m.updateModuleConfigSectionVisibility }));
vi.mock('./material-core.js', () => ({}));
vi.mock('./dev-mock.js', () => ({}));
vi.mock('./keybox-ui.js', () => ({ wireKeybox: m.wireKeybox }));
vi.mock('./auto-target-ui.js', () => ({ wireAutoTarget: m.wireAutoTarget }));
vi.mock('./auto-hma-ui.js', () => ({ wireAutoHma: m.wireAutoHma }));
vi.mock('./autopif-ui.js', () => ({ wireAutopif: m.wireAutopif }));
vi.mock('./rom-fingerprint-ui.js', () => ({ wireRomFingerprint: m.wireRomFingerprint }));
vi.mock('./adb-disabler-ui.js', () => ({ wireAdbDisabler: m.wireAdbDisabler }));
vi.mock('./prop-handler-ui.js', () => ({ wirePropHandler: m.wirePropHandler }));
vi.mock('./gms-ui.js', () => ({ wireGms: m.wireGms }));
vi.mock('./hma-ui.js', () => ({ wireHma: m.wireHma }));
vi.mock('./action-security-patch-ui.js', () => ({ wireActionSecurityPatch: m.wireActionSecurityPatch }));
vi.mock('./security-patch-ui.js', () => ({ wireSecurityPatch: m.wireSecurityPatch }));
vi.mock('./omk-trust-ui.js', () => ({ wireOmkTrust: m.wireOmkTrust, wireOmkRestart: m.wireOmkRestart }));
vi.mock('./toggles.js', () => ({ renderControlToggles: m.renderControlToggles, wireDevMode: m.wireDevMode }));
vi.mock('./dark-theme-ui.js', () => ({ wireDarkTheme: m.wireDarkTheme, updateDarkThemeSummary: m.updateDarkThemeSummary }));
vi.mock('./language-ui.js', () => ({ wireLanguageUI: m.wireLanguageUI, updateLanguageSummary: m.updateLanguageSummary }));
vi.mock('./colors-ui.js', () => ({ wireColorsUI: m.wireColorsUI, updateColorsSummary: m.updateColorsSummary }));
vi.mock('./pif-choose-desc.js', () => ({ refreshPifChooseDesc: m.refreshPifChooseDesc }));
vi.mock('./target-apps.js', () => ({ openTargetAppsManager: vi.fn() }));
vi.mock('./pif-device-ui.js', () => ({ openPifDeviceSubpage: vi.fn() }));
vi.mock('./boot-hash-ui.js', () => ({ openBootHashSubpage: vi.fn() }));

function setupDom() {
  document.body.innerHTML = `
    <div id="conflicts-section" style="display:none"></div>
    <button id="security-patch-btn"></button>
    <div id="toggle-action_security_patch"></div>
    <div id="pif-choose-device" hidden></div>
    <md-dialog id="progress-dialog"></md-dialog>
    <md-dialog id="other-dialog"></md-dialog>
  `;
}

async function boot() {
  vi.resetModules();
  await import('./app.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => expect(m.initDevice).toHaveBeenCalled());
  // Let the cfgReady chains settle.
  await new Promise(r => setTimeout(r, 10));
}

describe('app bootstrap', () => {
  beforeEach(() => {
    setupDom();
    h.cfg = new Map([
      ['theme', 'dark'],
      ['dev_mode', 'false'],
      ['toggle_keybox_info', '1'],
    ]);
    h.conflicts = [];
    h.execResult = { stdout: '', stderr: '', code: 0 };
    h.bridgeFails = false;
    h.pageCallbacks.clear();
    h.homeCallback = null;
    h.lazyClicks = [];
    vi.clearAllMocks();
    // clearAllMocks drops mock implementations set at creation for some fns;
    // restore the stateful ones.
    m.cfgGet.mockImplementation(async (key: string, def = '') => h.cfg.get(key) ?? def);
    m.refreshConflictStatus.mockImplementation(async () => h.conflicts);
    m.exec.mockImplementation(async () => h.execResult);
    m.initBridge.mockImplementation(async () => {
      if (h.bridgeFails) throw new Error('no bridge');
    });
    m.onPageActivate.mockImplementation((id: string, cb: () => unknown) => { h.pageCallbacks.set(id, cb); });
    m.onHomeShow.mockImplementation((cb: () => void) => { h.homeCallback = cb; });
    m.wireLazyClick.mockImplementation((id: string) => { h.lazyClicks.push(id); });
    m.afterPaint.mockImplementation((cb: () => void) => cb());
  });

  it('wires the shell, config, theme and home on DOMContentLoaded', async () => {
    await boot();

    expect(m.initBridge).toHaveBeenCalled();
    expect(m.setDataDir).toHaveBeenCalledWith('/data/adb/specter');
    expect(m.wireTopBarScroll).toHaveBeenCalled();
    expect(m.wireNavigation).toHaveBeenCalled();
    expect(m.initRedirect).toHaveBeenCalled();
    expect(m.wireHomeCards).toHaveBeenCalled();
    expect(m.initBrand).toHaveBeenCalled();
    expect(m.initThemeToggle).toHaveBeenCalled();
    expect(m.wireActions).toHaveBeenCalled();
    expect(m.buildFriendlyNames).toHaveBeenCalled();
    expect(m.cfgInit).toHaveBeenCalled();
    expect(m.migrateLocalStorage).toHaveBeenCalled();
    expect(m.initFonts).toHaveBeenCalled();
    expect(m.initTheme).toHaveBeenCalledWith('dark');
    expect(m.setDevMode).toHaveBeenCalledWith(false);
    expect(m.initI18n).toHaveBeenCalled();
    expect(m.reapplyKeyboxStatus).toHaveBeenCalled();
    expect(m.refreshKeyboxWatchInBackground).toHaveBeenCalled();
    expect(m.renderActivityPreview).toHaveBeenCalled();
    expect([...h.pageCallbacks.keys()]).toEqual(['tools-page', 'control-page', 'settings-page']);
    expect(h.homeCallback).not.toBeNull();
  });

  it('survives a bridge failure and skips the keybox watch when toggled off', async () => {
    h.bridgeFails = true;
    h.cfg.set('toggle_keybox_info', '0');
    await boot();

    expect(m.setDataDir).not.toHaveBeenCalled();
    expect(m.wireNavigation).toHaveBeenCalled();
    expect(m.refreshKeyboxWatchInBackground).not.toHaveBeenCalled();
  });

  it('throttles home keybox refreshes and skips the first home show', async () => {
    await boot();
    m.refreshKeyboxStatus.mockClear();

    h.homeCallback!();
    expect(m.refreshKeyboxStatus).not.toHaveBeenCalled();

    h.homeCallback!();
    expect(m.refreshKeyboxStatus).toHaveBeenCalledTimes(1);

    h.homeCallback!();
    expect(m.refreshKeyboxStatus).toHaveBeenCalledTimes(1);
  });

  it('loads the Tools page modules and lazy click targets on activation', async () => {
    await boot();
    await h.pageCallbacks.get('tools-page')!();

    expect(m.wireKeybox).toHaveBeenCalled();
    expect(m.wireAutoTarget).toHaveBeenCalled();
    expect(m.wireAutopif).toHaveBeenCalled();
    expect(m.wireSecurityPatch).toHaveBeenCalled();
    expect(m.wireOmkTrust).toHaveBeenCalled();
    expect(m.wireOmkRestart).toHaveBeenCalled();
    expect(h.lazyClicks).toEqual(['target-apps-btn', 'hma-apps-btn', 'pif-choose-device', 'boot-hash-btn']);
    expect(document.getElementById('pif-choose-device')!.hidden).toBe(false);
    await vi.waitFor(() => expect(m.refreshPifChooseDesc).toHaveBeenCalled());
    expect(m.updatePlayIntegritySectionVisibility).toHaveBeenCalled();
    expect(m.updateModuleConfigSectionVisibility).toHaveBeenCalled();
  });

  it('loads Control and Settings page modules on activation', async () => {
    await boot();

    await h.pageCallbacks.get('control-page')!();
    expect(m.renderControlToggles).toHaveBeenCalled();
    expect(m.wireControlRows).toHaveBeenCalled();

    await h.pageCallbacks.get('settings-page')!();
    expect(m.wireFontToggles).toHaveBeenCalled();
    expect(m.wireDarkTheme).toHaveBeenCalled();
    expect(m.wireLanguageUI).toHaveBeenCalled();
    expect(m.wireColorsUI).toHaveBeenCalled();
    expect(m.wireDevMode).toHaveBeenCalled();
    expect(m.initTerminal).toHaveBeenCalled();
    expect(m.loadContributors).toHaveBeenCalled();
  });

  it('builds conflict rows, applies module ownership and handles switch changes', async () => {
    h.conflicts = [{
      key: 'teesim', friendlyName: 'TEE Simulator', features: 'security_patch', prioritySpecter: false,
    }];
    await boot();
    await h.pageCallbacks.get('tools-page')!();

    const section = document.getElementById('conflicts-section')!;
    expect(section.style.display).toBe('');
    const row = section.querySelector('#conflict-row-teesim');
    expect(row).not.toBeNull();
    expect(row!.querySelector('[slot="headline"]')?.textContent).toBe('TEE Simulator');
    expect(document.getElementById('conflict-hint-teesim')?.textContent)
      .toContain('Covers: security_patch');
    // Module owns security patch -> Specter controls hidden
    expect(document.getElementById('security-patch-btn')!.hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('toggle-action_security_patch')!.hasAttribute('hidden')).toBe(true);

    const sw = section.querySelector('#conflict-switch-teesim') as HTMLElement & { selected: boolean; disabled: boolean };
    expect(sw.selected).toBe(true); // module priority

    // Hand control back to Specter
    sw.selected = false;
    sw.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(m.showToast).toHaveBeenCalledWith(
        expect.stringContaining('Specter handles it'), expect.objectContaining({ type: 'success' }));
    });
    expect(m.exec).toHaveBeenCalledWith(expect.stringContaining("set 'teesim' 'priority_specter'"));
    expect(document.getElementById('security-patch-btn')!.hasAttribute('hidden')).toBe(false);

    // A failing update reverts the switch and toasts an error
    h.execResult = { stdout: '', stderr: 'denied', code: 1 };
    m.showToast.mockClear();
    sw.selected = true;
    sw.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(m.showToast).toHaveBeenCalledWith('Failed to update', expect.objectContaining({ type: 'error' }));
    });
    expect(sw.selected).toBe(false);
  });

  it('refreshes localized surfaces on languageChanged', async () => {
    await boot();
    m.loadContributors.mockClear();
    m.renderActivityPreview.mockClear();

    document.dispatchEvent(new CustomEvent('languageChanged'));
    await vi.waitFor(() => expect(m.updateColorsSummary).toHaveBeenCalled());
    expect(m.loadContributors).toHaveBeenCalled();
    expect(m.renderActivityPreview).toHaveBeenCalledWith(true);
    expect(m.refreshPifChooseDesc).toHaveBeenCalled();
    expect(m.updateDarkThemeSummary).toHaveBeenCalled();
    expect(m.updateLanguageSummary).toHaveBeenCalled();
  });

  it('tracks md-dialog open state on the body and locks the progress dialog cancel', async () => {
    await boot();

    const dialog = document.getElementById('other-dialog')!;
    expect(dialog.hasAttribute('data-sp-tracked')).toBe(true);

    dialog.dispatchEvent(new Event('open'));
    expect(document.body.classList.contains('dialog-open')).toBe(true);

    dialog.dispatchEvent(new Event('closed'));
    expect(document.body.classList.contains('dialog-open')).toBe(false);

    const cancelEvent = new Event('cancel', { cancelable: true });
    document.getElementById('progress-dialog')!.dispatchEvent(cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
  });
});
