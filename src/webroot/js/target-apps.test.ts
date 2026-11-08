import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  listRawFails: false,
  blacklistFile: 'com.b.app\n',
  denylist: '',
  km: { format: 'txt', perAppModes: true } as Record<string, unknown>,
}));

const {
  exec, cfgGet, fetchJson, showToast, appendToOutput,
  openModeDialog, openRegenerateDialog, openTeesimModeDialog,
} = vi.hoisted(() => ({
  exec: vi.fn(),
  cfgGet: vi.fn(async (_key: string, def = '') => def),
  fetchJson: vi.fn(async () => state.km),
  showToast: vi.fn(),
  appendToOutput: vi.fn(),
  openModeDialog: vi.fn(),
  openRegenerateDialog: vi.fn(),
  openTeesimModeDialog: vi.fn(),
}));

vi.mock('./bridge.js', () => ({
  exec,
  getModuleDir: () => '/data/adb/modules/specter',
  getDataDir: () => '/data/adb/specter',
}));
vi.mock('./cfg.js', () => ({ cfgGet }));
vi.mock('./utils.js', () => ({
  fetchJson,
  shellEscape: (value: string) => `'${value}'`,
  escapeHtml: (value: string) => value,
}));
vi.mock('./toast.js', () => ({ showToast }));
vi.mock('./terminal.js', () => ({ appendToOutput }));
vi.mock('./i18n.js', () => ({ getTranslation: () => '' }));
vi.mock('./constants.js', () => ({ API_URLS: { KEYSTORE_MANAGER: '/json/keystore_manager.json' } }));
vi.mock('./target-apps-icons.js', () => ({
  ksuGlobal: () => undefined,
  AppIconManager: class {
    createElements() {
      return { wrap: document.createElement('div') };
    }
    watchAll() {}
    destroy() {}
  },
}));
vi.mock('./target-apps-dialogs.js', () => ({
  openModeDialog, openRegenerateDialog, openTeesimModeDialog,
}));
vi.mock('./overlay-a11y.js', () => ({ setupOverlayA11y: () => () => {} }));
vi.mock('./menu-utils.js', () => ({ closeMenu: vi.fn(), wireMenuTrigger: vi.fn() }));
vi.mock('./material-subpages.js', () => ({}));

import { openTargetAppsManager } from './target-apps.js';

const TARGET_LIST = 'com.a.app!\ncom.b.app?\ncom.c.app\n';
const USER_PKGS = 'package:com.a.app\npackage:com.b.app\npackage:com.c.app\npackage:com.d.app\n';

function execImpl(cmd: string) {
  if (cmd.includes('--list-raw')) {
    return state.listRawFails
      ? { stdout: '', stderr: 'boom', code: 1 }
      : { stdout: TARGET_LIST, stderr: '', code: 0 };
  }
  if (cmd.includes('cmd package list packages')) return { stdout: USER_PKGS, stderr: '', code: 0 };
  if (cmd.startsWith('cat ') && cmd.includes('blacklist.txt')) {
    return { stdout: state.blacklistFile, stderr: '', code: 0 };
  }
  if (cmd.includes('magisk --denylist')) return { stdout: state.denylist, stderr: '', code: 0 };
  if (cmd.includes('pm list packages -s')) return { stdout: 'com.sys.one\n', stderr: '', code: 0 };
  if (cmd.includes('base64 -w0')) {
    const m = cmd.match(/printf '%s' '([^']*)'/s);
    return { stdout: m ? btoa(m[1]!) : '', stderr: '', code: 0 };
  }
  return { stdout: '', stderr: '', code: 0 };
}

const items = () =>
  [...document.querySelectorAll<HTMLElement>('.ta-item')].map(el => ({
    pkg: el.dataset.package,
    state: el.dataset.state,
    el,
  }));
const itemByPkg = (pkg: string) => items().find(i => i.pkg === pkg)!;
const execCalls = () => exec.mock.calls.map(([cmd]) => String(cmd));
const click = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));

describe('target apps manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    state.listRawFails = false;
    state.blacklistFile = 'com.b.app\n';
    state.denylist = '';
    state.km = { format: 'txt', perAppModes: true };
    exec.mockReset();
    exec.mockImplementation(async (cmd: string) => execImpl(cmd));
    cfgGet.mockClear();
    fetchJson.mockClear();
    showToast.mockClear();
    openModeDialog.mockClear();
    openRegenerateDialog.mockClear();
    openTeesimModeDialog.mockClear();
    window.isOverlayOpen = false;
  });

  it('loads user apps with states parsed from the target list suffixes', async () => {
    await openTargetAppsManager();

    expect(items().map(i => [i.pkg, i.state])).toEqual([
      ['com.a.app', 'force'],
      ['com.b.app', 'conditional'],
      ['com.c.app', 'bare'],
      ['com.d.app', 'unchecked'],
    ]);
    expect((document.querySelector('#ta-loading') as HTMLElement).style.display).toBe('none');
    // force renders "!" and conditional "?" in the state circle
    expect(itemByPkg('com.a.app').el.querySelector('.ta-state-text')?.textContent).toBe('!');
    expect(itemByPkg('com.b.app').el.querySelector('.ta-state-text')?.textContent).toBe('?');
  });

  it('toggles apps with item clicks and cycles modes with circle clicks', async () => {
    await openTargetAppsManager();

    click(itemByPkg('com.d.app').el);
    expect(itemByPkg('com.d.app').state).toBe('bare');
    click(itemByPkg('com.d.app').el);
    expect(itemByPkg('com.d.app').state).toBe('unchecked');

    const circleOf = (pkg: string) => itemByPkg(pkg).el.querySelector('.ta-state-circle')!;
    click(circleOf('com.a.app')); // force -> bare (wrap)
    expect(itemByPkg('com.a.app').state).toBe('bare');
    click(circleOf('com.a.app')); // bare -> conditional
    expect(itemByPkg('com.a.app').state).toBe('conditional');
    click(circleOf('com.a.app')); // conditional -> force
    expect(itemByPkg('com.a.app').state).toBe('force');
    click(circleOf('com.c.app')); // bare -> conditional; item handler must not also fire
    expect(itemByPkg('com.c.app').state).toBe('conditional');
  });

  it('filters by search text and by the selected/not-selected chips', async () => {
    await openTargetAppsManager();

    const search = document.querySelector('#ta-search') as unknown as HTMLElement & { value: string };
    search.value = 'b.app';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(items().map(i => i.pkg)).toEqual(['com.b.app']);

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    click(document.querySelector('#ta-filter-selected')!);
    expect(items().map(i => i.pkg)).toEqual(['com.a.app', 'com.b.app', 'com.c.app']);

    click(document.querySelector('#ta-filter-not-selected')!);
    expect(items().map(i => i.pkg)).toEqual(['com.d.app']);

    click(document.querySelector('#ta-filter-all')!);
    expect(items()).toHaveLength(4);
  });

  it('selects and deselects all from the menu', async () => {
    await openTargetAppsManager();

    click(document.querySelector('#ta-deselect-all')!);
    expect(items().every(i => i.state === 'unchecked')).toBe(true);

    click(document.querySelector('#ta-select-all')!);
    expect(items().every(i => i.state === 'bare')).toBe(true);
  });

  it('applies the target list through the staging write with mode suffixes', async () => {
    await openTargetAppsManager();

    click(document.querySelector('#ta-apply')!);
    await vi.waitFor(() => {
      expect(execCalls().some(cmd => cmd.includes('--set'))).toBe(true);
    });
    const staging = execCalls().find(cmd => cmd.includes('base64 -d'))!;
    const b64 = staging.match(/printf '%s' '([^']+)'/)![1]!;
    expect(atob(b64)).toBe('com.a.app!\ncom.b.app?\ncom.c.app');
    expect(showToast).toHaveBeenCalledWith('Target list saved', expect.objectContaining({ type: 'success' }));
  });

  it('switches to blacklist mode, edits it, saves it and switches back', async () => {
    await openTargetAppsManager();

    click(document.querySelector('#ta-toggle-mode')!);
    await vi.waitFor(() => {
      expect(document.querySelector('.ta-title')?.textContent).toBe('Blacklist');
    });
    expect(itemByPkg('com.b.app').state).toBe('blacklisted');
    expect(itemByPkg('com.a.app').state).toBe('unchecked');

    click(itemByPkg('com.a.app').el);
    expect(itemByPkg('com.a.app').state).toBe('blacklisted');

    click(document.querySelector('#ta-apply')!);
    await vi.waitFor(() => {
      expect(execCalls().some(cmd => cmd.includes('blacklist.txt') && cmd.includes('base64 -d'))).toBe(true);
    });
    const write = execCalls().find(cmd => cmd.includes('blacklist.txt') && cmd.includes('base64 -d'))!;
    const b64 = write.match(/printf '%s' "([^"]+)"/)![1]!;
    expect(atob(b64)).toBe('com.a.app\ncom.b.app');
    expect(showToast).toHaveBeenCalledWith('Blacklist saved', expect.objectContaining({ type: 'success' }));

    click(document.querySelector('#ta-toggle-mode')!);
    await vi.waitFor(() => {
      expect(document.querySelector('.ta-title')?.textContent).toBe('App Targeting');
      expect(itemByPkg('com.a.app').state).toBe('force');
    });
    expect(itemByPkg('com.b.app').state).toBe('conditional');
  });

  it('shows and hides system apps from the menu', async () => {
    await openTargetAppsManager();
    expect(itemByPkg('com.sys.one')).toBeUndefined();

    click(document.querySelector('#ta-toggle-system')!);
    await vi.waitFor(() => expect(itemByPkg('com.sys.one')).toBeDefined());
    expect(document.querySelector('#ta-toggle-system [slot="headline"]')?.textContent).toBe('Hide system apps');

    click(document.querySelector('#ta-toggle-system')!);
    expect(itemByPkg('com.sys.one')).toBeUndefined();
  });

  it('imports DenyList entries and reports an unreadable DenyList', async () => {
    state.denylist = 'com.d.app\n';
    await openTargetAppsManager();

    click(document.querySelector('#ta-import-denylist')!);
    await vi.waitFor(() => expect(itemByPkg('com.d.app').state).toBe('bare'));
    expect(showToast).toHaveBeenCalledWith('DenyList apps selected', expect.objectContaining({ type: 'success' }));

    state.denylist = '';
    showToast.mockClear();
    click(document.querySelector('#ta-import-denylist')!);
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Failed to read DenyList', expect.objectContaining({ type: 'error' }));
    });
  });

  it('routes the mode and regenerate menu entries to their dialogs', async () => {
    await openTargetAppsManager();

    click(document.querySelector('#ta-mode')!);
    expect(openModeDialog).toHaveBeenCalledTimes(1);
    expect(openTeesimModeDialog).not.toHaveBeenCalled();

    click(document.querySelector('#ta-regenerate')!);
    expect(openRegenerateDialog).toHaveBeenCalledTimes(1);

    const listRawCalls = () => execCalls().filter(cmd => cmd.includes('--list-raw')).length;
    const before = listRawCalls();
    click(document.querySelector('#ta-refresh')!);
    await vi.waitFor(() => expect(listRawCalls()).toBe(before + 1));
  });

  it('uses the TEESimulator mode dialog and binary toggling in json mode', async () => {
    state.km = { format: 'json' };
    await openTargetAppsManager();

    // Without per-app modes the "!" suffix is not honored: the app loads bare.
    expect(itemByPkg('com.a.app').state).toBe('bare');
    expect(document.querySelector('#ta-mode [slot="headline"]')?.textContent).toBe('Operation Mode');

    click(document.querySelector('#ta-mode')!);
    expect(openTeesimModeDialog).toHaveBeenCalledTimes(1);
    expect(openModeDialog).not.toHaveBeenCalled();

    const circle = itemByPkg('com.a.app').el.querySelector('.ta-state-circle')!;
    click(circle);
    expect(itemByPkg('com.a.app').state).toBe('unchecked');
  });

  it('shows a load error when the target list cannot be read', async () => {
    state.listRawFails = true;
    await openTargetAppsManager();

    expect(document.querySelector('#ta-loading')?.textContent).toContain('Failed to load apps');
    expect(items()).toHaveLength(0);
  });

  it('ignores a second open while the overlay exists', async () => {
    await openTargetAppsManager();
    await openTargetAppsManager();

    expect(document.querySelectorAll('.ta-overlay')).toHaveLength(1);
    expect(execCalls().filter(cmd => cmd.includes('--list-raw'))).toHaveLength(1);
  });
});
