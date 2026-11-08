import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  listRawFails: false,
  blacklistFile: 'com.b.app\n',
  denylist: '',
  userPkgs: null as string | null,
  deferPaint: false,
  paintCallback: null as (() => void) | null,
}));

const {
  exec, showToast, appendToOutput, showDialog,
} = vi.hoisted(() => ({
  exec: vi.fn(),
  showToast: vi.fn(),
  appendToOutput: vi.fn(),
  showDialog: vi.fn(),
}));

vi.mock('./bridge.js', () => ({
  exec,
  getModuleDir: () => '/data/adb/modules/specter',
  getDataDir: () => '/data/adb/specter',
}));
vi.mock('./utils.js', () => ({
  shellEscape: (value: string) => `'${value}'`,
  escapeHtml: (value: string) => value,
  afterPaint: (fn: () => void) => {
    if (state.deferPaint) { state.paintCallback = fn; return; }
    fn();
  },
}));
vi.mock('./toast.js', () => ({ showToast }));
vi.mock('./terminal.js', () => ({ appendToOutput }));
vi.mock('./dialog.js', () => ({
  showDialog: (...args: unknown[]) => {
    showDialog(...args);
    const d = document.createElement('div') as unknown as HTMLElement & { close: () => void };
    d.innerHTML = `
      <button class="dialog-action-close">Cancel</button>
      <button id="ha-regenerate-confirm">Regenerate</button>
    `;
    d.close = vi.fn();
    return d;
  },
}));
vi.mock('./i18n.js', () => ({ getTranslation: () => '' }));
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
vi.mock('./overlay-a11y.js', () => ({ setupOverlayA11y: () => () => {} }));
vi.mock('./menu-utils.js', () => ({ closeMenu: vi.fn(), wireMenuTrigger: vi.fn() }));
vi.mock('./material-subpages.js', () => ({}));

import { openHmaAppsManager } from './hma-apps.js';

const SCOPE_LIST = 'com.a.app\ncom.b.app\n';
const USER_PKGS = 'package:com.a.app\npackage:com.b.app\npackage:com.c.app\n';

async function execImpl(cmd: string) {
  if (cmd.includes('--list-raw')) {
    return state.listRawFails
      ? { stdout: '', stderr: 'boom', code: 1 }
      : { stdout: SCOPE_LIST, stderr: '', code: 0 };
  }
  if (cmd.includes('cmd package list packages')) return { stdout: state.userPkgs ?? USER_PKGS, stderr: '', code: 0 };
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

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const items = () =>
  [...document.querySelectorAll<HTMLElement>('.ta-item')].map(el => ({
    pkg: el.dataset.package,
    state: el.dataset.state,
    el,
  }));
const itemByPkg = (pkg: string) => items().find(i => i.pkg === pkg)!;
const execCalls = () => exec.mock.calls.map(([cmd]) => String(cmd));
const click = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));

describe('HMA-OSS apps manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    state.listRawFails = false;
    state.blacklistFile = 'com.b.app\n';
    state.denylist = '';
    state.userPkgs = null;
    state.deferPaint = false;
    state.paintCallback = null;
    exec.mockReset();
    showToast.mockReset();
    appendToOutput.mockReset();
    showDialog.mockReset();
    exec.mockImplementation(execImpl);
  });

  it('loads user apps with states parsed from HMA scope list', async () => {
    await openHmaAppsManager();
    expect(items()).toEqual([
      expect.objectContaining({ pkg: 'com.a.app', state: 'targeted' }),
      expect.objectContaining({ pkg: 'com.b.app', state: 'targeted' }),
      expect.objectContaining({ pkg: 'com.c.app', state: 'unchecked' }),
    ]);
  });

  it('toggles apps with item clicks and circle clicks', async () => {
    await openHmaAppsManager();
    const a = itemByPkg('com.a.app');
    click(a.el);
    expect(a.el.dataset.state).toBe('unchecked');
    click(a.el);
    expect(a.el.dataset.state).toBe('targeted');

    const circle = a.el.querySelector('.ta-state-circle')!;
    click(circle);
    expect(a.el.dataset.state).toBe('unchecked');
  });

  it('selects and deselects all from the menu', async () => {
    await openHmaAppsManager();
    click(document.getElementById('ha-select-all')!);
    expect(items().every(i => i.state === 'targeted')).toBe(true);

    click(document.getElementById('ha-deselect-all')!);
    expect(items().every(i => i.state === 'unchecked')).toBe(true);
  });

  it('filters apps by search query', async () => {
    await openHmaAppsManager();
    const input = document.getElementById('ha-search') as HTMLInputElement;
    input.value = 'com.c';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(items().map(i => i.pkg)).toEqual(['com.c.app']);
  });

  it('applies the HMA scope list via staging write and features/hma.sh --set', async () => {
    await openHmaAppsManager();
    click(itemByPkg('com.c.app').el); // select com.c.app
    click(document.getElementById('ha-apply')!);

    await tick();
    const stagingCall = execCalls().find(c => c.includes('.hma_scope_staging'));
    expect(stagingCall).toBeDefined();

    const commitCall = execCalls().find(c => c.includes('features/hma.sh') && c.includes('--set'));
    expect(commitCall).toBeDefined();
    expect(showToast).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'success' }));
  });

  it('switches to blacklist mode, edits it, saves it and switches back', async () => {
    await openHmaAppsManager();
    click(document.getElementById('ha-toggle-mode')!);
    await tick();

    expect(items()).toEqual([
      expect.objectContaining({ pkg: 'com.b.app', state: 'blacklisted' }),
      expect.objectContaining({ pkg: 'com.a.app', state: 'unchecked' }),
      expect.objectContaining({ pkg: 'com.c.app', state: 'unchecked' }),
    ]);

    // Toggle com.a.app to blacklisted
    click(itemByPkg('com.a.app').el);
    expect(itemByPkg('com.a.app').el.dataset.state).toBe('blacklisted');

    // Apply blacklist
    click(document.getElementById('ha-apply')!);
    await tick();
    expect(execCalls().some(c => c.includes('blacklist.txt'))).toBe(true);

    // Switch back to scope
    click(document.getElementById('ha-toggle-mode')!);
    await tick();
    expect(itemByPkg('com.a.app').el.dataset.state).toBe('targeted');
  });

  it('shows and hides system apps from the menu', async () => {
    await openHmaAppsManager();
    click(document.getElementById('ha-toggle-system')!);
    await tick();
    expect(items().some(i => i.pkg === 'com.sys.one')).toBe(true);

    click(document.getElementById('ha-toggle-system')!);
    await tick();
    expect(items().some(i => i.pkg === 'com.sys.one')).toBe(false);
  });

  it('imports DenyList entries', async () => {
    state.denylist = 'com.c.app\n';
    await openHmaAppsManager();
    click(document.getElementById('ha-import-denylist')!);
    await tick();
    expect(itemByPkg('com.c.app').el.dataset.state).toBe('targeted');
  });

  it('re-runs hma.sh on regenerate confirmation', async () => {
    await openHmaAppsManager();
    click(document.getElementById('ha-regenerate')!);
    expect(showDialog).toHaveBeenCalled();
  });
});
