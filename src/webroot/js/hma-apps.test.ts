import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  listRawFails: false,
  scopeList: 'com.a.app\ncom.b.app\n',
  blacklistFile: 'com.b.app\n',
  denylist: '',
  sysPkgs: 'com.sys.one\n',
  userPkgs: null as string | null,
  deferPaint: false,
  paintCallback: null as (() => void) | null,
  ksu: undefined as any,
  moduleDir: '/data/adb/modules/specter' as string | null,
  dataDir: '/data/adb/specter' as string | null,
  translations: {} as Record<string, string>,
  stagingFails: false,
  commitFails: false,
  blacklistWriteFails: false,
  blacklistCatFails: false,
  packageListFails: false,
  regenFails: false,
  lastDialog: null as (HTMLElement & { close: () => void }) | null,
}));

const {
  exec, showToast, showLoadingToast, updateToast, appendToOutput, showDialog,
} = vi.hoisted(() => {
  const showToast = vi.fn();
  return {
    exec: vi.fn(),
    showToast,
    showLoadingToast: vi.fn(() => document.createElement('div')),
    updateToast: vi.fn((_toast: HTMLElement, msg: string, opts?: unknown) => {
      showToast(msg, opts as any);
    }),
    appendToOutput: vi.fn(),
    showDialog: vi.fn(),
  };
});

vi.mock('./bridge.js', () => ({
  exec,
  spawnCommand: exec,
  getModuleDir: () => state.moduleDir,
  getDataDir: () => state.dataDir,
}));
vi.mock('./utils.js', () => ({
  shellEscape: (value: string) => `'${value}'`,
  escapeHtml: (value: string) => value,
  afterPaint: (fn: () => void) => {
    if (state.deferPaint) { state.paintCallback = fn; return; }
    fn();
  },
}));
vi.mock('./toast.js', () => ({ showToast, showLoadingToast, updateToast }));
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
    state.lastDialog = d;
    return d;
  },
}));
vi.mock('./i18n.js', () => ({
  getTranslation: (key: string) => state.translations[key] ?? '',
  t: (_key: string, fallback = '') => fallback,
}));
vi.mock('./target-apps-icons.js', () => ({
  ksuGlobal: () => state.ksu,
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
  if (state.regenFails && /features\/hma\.sh'$/.test(cmd)) throw new Error('regen boom');
  if (cmd.includes('--list-raw')) {
    return state.listRawFails
      ? { stdout: '', stderr: 'boom', code: 1 }
      : { stdout: state.scopeList, stderr: '', code: 0 };
  }
  if (state.stagingFails && cmd.includes('.hma_scope_staging')) {
    return { stdout: '', stderr: 'stage boom', code: 1 };
  }
  if (state.commitFails && cmd.includes('--set')) {
    return { stdout: '', stderr: 'commit boom', code: 1 };
  }
  if (state.blacklistWriteFails && cmd.includes('blacklist.txt') && cmd.includes('base64 -d')) {
    throw new Error('blacklist boom');
  }
  if (state.blacklistCatFails && cmd.startsWith('cat ') && cmd.includes('blacklist.txt')) {
    throw new Error('cat boom');
  }
  if (state.packageListFails && (cmd.includes('cmd package list packages') || cmd.includes('pm list packages -3'))) {
    throw new Error('package boom');
  }
  if (cmd.includes('cmd package list packages')) return { stdout: state.userPkgs ?? USER_PKGS, stderr: '', code: 0 };
  if (cmd.startsWith('cat ') && cmd.includes('blacklist.txt')) {
    return { stdout: state.blacklistFile, stderr: '', code: 0 };
  }
  if (cmd.includes('magisk --denylist')) return { stdout: state.denylist, stderr: '', code: 0 };
  if (cmd.includes('pm list packages -s')) return { stdout: state.sysPkgs, stderr: '', code: 0 };
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
const listRawCalls = () => execCalls().filter(cmd => cmd.includes('--list-raw')).length;
const click = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));
const searchInput = () =>
  document.getElementById('ha-search') as unknown as HTMLElement & { value: string };
const title = () => document.querySelector('.ha-title')?.textContent;
const pickFilter = (value: string) => {
  const root = document.querySelector('[data-filter-id="ha-state-filter"]')!;
  click(root.querySelector('.filter-trigger')!);
  click(root.querySelector(`.filter-option[data-value="${value}"]`)!);
};
const selectMode = async () => {
  click(document.getElementById('ha-toggle-mode')!);
  await vi.waitFor(() => expect(title()).toBe('Blacklist'));
};

describe('HMA-OSS apps manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    state.listRawFails = false;
    state.scopeList = SCOPE_LIST;
    state.blacklistFile = 'com.b.app\n';
    state.denylist = '';
    state.sysPkgs = 'com.sys.one\n';
    state.userPkgs = null;
    state.deferPaint = false;
    state.paintCallback = null;
    state.ksu = undefined;
    state.moduleDir = '/data/adb/modules/specter';
    state.dataDir = '/data/adb/specter';
    state.translations = {};
    state.stagingFails = false;
    state.commitFails = false;
    state.blacklistWriteFails = false;
    state.blacklistCatFails = false;
    state.packageListFails = false;
    state.regenFails = false;
    state.lastDialog = null;
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

  it('shows a load error when the scope list cannot be read', async () => {
    state.listRawFails = true;
    await openHmaAppsManager();

    expect(document.querySelector('#ha-loading')?.textContent).toContain('Failed to load apps');
    expect(items()).toHaveLength(0);
    expect(appendToOutput).toHaveBeenCalledWith(
      expect.stringContaining('[HMA] Failed to load app data'),
      true,
    );
  });

  it('shows a load error when the module directory is unavailable', async () => {
    state.moduleDir = null;
    await openHmaAppsManager();

    expect(document.querySelector('#ha-loading')?.textContent).toContain('Failed to load apps');
    expect(items()).toHaveLength(0);
  });

  it('renders an empty state when there are no apps and no scope entries', async () => {
    state.scopeList = '';
    state.userPkgs = '';
    await openHmaAppsManager();

    expect(items()).toHaveLength(0);
    expect(document.querySelector('#ha-list .ta-empty')?.textContent).toBe('No apps match your filter');
    expect(appendToOutput).toHaveBeenCalledWith('[HMA] Loaded 0 user apps, 0 in HMA scope');
    expect((document.getElementById('ha-list') as HTMLElement).style.display).toBe('');
  });

  it('keeps scope entries that are no longer installed', async () => {
    state.scopeList = 'com.a.app\ncom.extra.app\n';
    await openHmaAppsManager();

    expect(itemByPkg('com.extra.app').el.dataset.state).toBe('targeted');
    expect(itemByPkg('com.extra.app').el.querySelector('.ta-item-name')?.textContent).toBe('com.extra.app');
  });

  it('loads apps and labels from the KSU bridge without shell package listing', async () => {
    const cacheAllPackageIcons = vi.fn();
    state.scopeList = 'com.z.app\n';
    state.ksu = {
      listUserPackages: () => JSON.stringify(['com.x.app', 'com.y.app', 'com.z.app']),
      getPackagesInfo: (json: string) => {
        const pkgs = JSON.parse(json) as string[];
        return JSON.stringify(pkgs.slice(0, 2).map(pkg => ({
          packageName: pkg,
          appLabel: pkg === 'com.x.app' ? 'X App' : pkg,
        })));
      },
      cacheAllPackageIcons,
    };
    await openHmaAppsManager();

    expect(cacheAllPackageIcons).toHaveBeenCalledWith(48);
    expect(itemByPkg('com.x.app').el.querySelector('.ta-item-name')?.textContent).toBe('X App');
    expect(itemByPkg('com.y.app').el.querySelector('.ta-item-name')?.textContent).toBe('com.y.app');
    expect(itemByPkg('com.z.app').el.dataset.state).toBe('targeted');
    expect(execCalls().some(cmd => cmd.includes('cmd package list packages'))).toBe(false);

    searchInput().value = 'x app';
    searchInput().dispatchEvent(new Event('input', { bubbles: true }));
    expect(items().map(i => i.pkg)).toEqual(['com.x.app']);
  });

  it('falls back to listPackages when listUserPackages is unavailable', async () => {
    state.scopeList = '';
    state.ksu = { listPackages: () => JSON.stringify(['com.lp.app']) };
    await openHmaAppsManager();

    expect(items().map(i => i.pkg)).toEqual(['com.lp.app']);
    expect(execCalls().some(cmd => cmd.includes('cmd package list packages'))).toBe(false);
  });

  it('falls back to the shell package list when KSU returns invalid JSON', async () => {
    state.scopeList = '';
    state.ksu = { listUserPackages: () => 'not json' };
    await openHmaAppsManager();

    expect(items().map(i => i.pkg)).toEqual(['com.a.app', 'com.b.app', 'com.c.app']);
    expect(execCalls().some(cmd => cmd.includes('cmd package list packages'))).toBe(true);
  });

  it('falls back to the shell package list when listPackages throws', async () => {
    state.scopeList = '';
    state.ksu = { listPackages: () => { throw new Error('no packages'); } };
    await openHmaAppsManager();

    expect(items()).toHaveLength(3);
    expect(execCalls().some(cmd => cmd.includes('cmd package list packages'))).toBe(true);
  });

  it('falls back to package names when package info is unreadable', async () => {
    state.scopeList = '';
    state.ksu = {
      listUserPackages: () => JSON.stringify(['com.q.app']),
      getPackagesInfo: () => { throw new Error('bad info'); },
      cacheAllPackageIcons: () => { throw new Error('bad cache'); },
    };
    await openHmaAppsManager();

    expect(itemByPkg('com.q.app').el.querySelector('.ta-item-name')?.textContent).toBe('com.q.app');
  });

  it('falls back to scope entries when the user package listing fails', async () => {
    state.packageListFails = true;
    state.scopeList = 'com.a.app\n';
    await openHmaAppsManager();

    expect(itemByPkg('com.a.app').el.dataset.state).toBe('targeted');
    expect(appendToOutput).toHaveBeenCalledWith('[HMA] Loaded 1 user apps, 1 in HMA scope');
  });

  it('uses translations when available', async () => {
    state.translations = { ha_title: 'Custom HMA Scope' };
    await openHmaAppsManager();

    expect(title()).toBe('Custom HMA Scope');
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

  it('adds and removes the state icon and supports keyboard activation', async () => {
    await openHmaAppsManager();
    const a = itemByPkg('com.a.app');
    const circle = a.el.querySelector('.ta-state-circle')!;
    expect(circle.querySelector('.ta-state-icon')?.textContent).toBe('done');

    click(a.el);
    expect(circle.querySelector('.ta-state-icon')).toBeNull();

    a.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(a.el.dataset.state).toBe('targeted');
    expect(circle.querySelector('.ta-state-icon')?.textContent).toBe('done');

    a.el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(a.el.dataset.state).toBe('unchecked');

    a.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(a.el.dataset.state).toBe('unchecked');

    click(circle);
    expect(a.el.dataset.state).toBe('targeted');
  });

  it('filters apps by the selection dropdown and shows an empty result state', async () => {
    await openHmaAppsManager();

    pickFilter('selected');
    expect(items().map(i => i.pkg)).toEqual(['com.a.app', 'com.b.app']);

    pickFilter('not_selected');
    expect(items().map(i => i.pkg)).toEqual(['com.c.app']);

    pickFilter('all');
    expect(items()).toHaveLength(3);

    click(document.getElementById('ha-deselect-all')!);
    pickFilter('selected');
    expect(items()).toHaveLength(0);
    expect(document.querySelector('#ha-list .ta-empty')).not.toBeNull();
  });

  it('filters apps in blacklist mode with blacklist labels', async () => {
    await openHmaAppsManager();
    await selectMode();

    expect(itemByPkg('com.b.app').el.querySelector('.ta-state-icon')?.textContent).toBe('block');

    const root = document.querySelector('[data-filter-id="ha-state-filter"]')!;
    click(root.querySelector('.filter-trigger')!);
    expect([...root.querySelectorAll('.filter-option-label')].map(el => el.textContent)).toEqual([
      'All', 'Blacklisted', 'Not Blacklisted',
    ]);
    click(root.querySelector('.filter-option[data-value="selected"]')!);
    expect(items().map(i => i.pkg)).toEqual(['com.b.app']);

    pickFilter('not_selected');
    expect(items().map(i => i.pkg)).toEqual(['com.a.app', 'com.c.app']);

    pickFilter('all');
    expect(items()).toHaveLength(3);
  });

  it('selects and deselects all apps in scope and blacklist modes', async () => {
    await openHmaAppsManager();
    click(document.getElementById('ha-select-all')!);
    expect(items().every(i => i.state === 'targeted')).toBe(true);

    click(document.getElementById('ha-deselect-all')!);
    expect(items().every(i => i.state === 'unchecked')).toBe(true);

    await selectMode();
    click(document.getElementById('ha-select-all')!);
    expect(items().every(i => i.state === 'blacklisted')).toBe(true);

    click(document.getElementById('ha-deselect-all')!);
    expect(items().every(i => i.state === 'unchecked')).toBe(true);
  });

  it('filters apps by search query', async () => {
    await openHmaAppsManager();
    const input = searchInput();
    input.value = 'com.c';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(items().map(i => i.pkg)).toEqual(['com.c.app']);

    input.value = 'nothing-matches';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(items()).toHaveLength(0);
    expect(document.querySelector('#ha-list .ta-empty')).not.toBeNull();
  });

  it('opens search, clears it, and collapses it on Back', async () => {
    await openHmaAppsManager();
    const container = document.querySelector('.ha-search-container') as HTMLElement;
    const header = document.querySelector('.ha-header') as HTMLElement;
    const searchBtn = document.getElementById('ha-search-btn') as HTMLElement;
    const clearBtn = document.getElementById('ha-search-clear') as HTMLElement;
    expect(container.hidden).toBe(true);

    click(searchBtn);
    expect(container.hidden).toBe(false);
    expect(header.classList.contains('ta-header--searching')).toBe(true);
    expect(searchBtn.getAttribute('aria-expanded')).toBe('true');

    const input = searchInput();
    input.value = 'b.app';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(items().map(i => i.pkg)).toEqual(['com.b.app']);
    expect(clearBtn.style.display).toBe('');

    click(clearBtn);
    expect(input.value).toBe('');
    expect(clearBtn.style.display).toBe('none');
    expect(items()).toHaveLength(3);

    input.value = 'c.app';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(items().map(i => i.pkg)).toEqual(['com.c.app']);

    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    expect(input.dispatchEvent(escape)).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();

    window.dispatchEvent(new PopStateEvent('popstate', { state: { overlay: 'hma-apps' } }));
    expect(container.hidden).toBe(true);
    expect(header.classList.contains('ta-header--searching')).toBe(false);
    expect(searchBtn.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('');
    expect(items()).toHaveLength(3);

    // Reopening and going Back without a query only hides the field.
    click(searchBtn);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { overlay: 'hma-apps' } }));
    expect(container.hidden).toBe(true);
    expect(items()).toHaveLength(3);
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

  it('disables Apply while saving, ignores a second tap, and restores it afterwards', async () => {
    vi.useFakeTimers();
    try {
      await openHmaAppsManager();
      const apply = document.getElementById('ha-apply') as HTMLElement & { disabled: boolean; label?: string };

      click(apply);
      expect(apply.disabled).toBe(true);
      expect(apply.label).toBe('Applying…');

      click(apply);
      await vi.runAllTimersAsync();

      expect(execCalls().filter(c => c.includes('--set'))).toHaveLength(1);
      expect(showToast).toHaveBeenCalledWith('HMA-OSS scope saved', expect.objectContaining({ type: 'success' }));
      expect(apply.disabled).toBe(false);
      expect(apply.label).toBe('Apply');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a staging failure when applying the scope list', async () => {
    state.stagingFails = true;
    await openHmaAppsManager();
    click(document.getElementById('ha-apply')!);

    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed: Error: stage boom'),
        expect.objectContaining({ type: 'error' }),
      );
    });
    expect(appendToOutput).toHaveBeenCalledWith(
      expect.stringContaining('[HMA] Failed to save HMA scope list'),
      true,
    );
    expect((document.getElementById('ha-apply') as HTMLElement & { disabled: boolean }).disabled).toBe(false);
  });

  it('reports a commit failure when applying the scope list', async () => {
    state.commitFails = true;
    await openHmaAppsManager();
    click(document.getElementById('ha-apply')!);

    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed: Error: commit boom'),
        expect.objectContaining({ type: 'error' }),
      );
    });
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

    // Toggle com.b.app off and on via its state circle.
    const bCircle = itemByPkg('com.b.app').el.querySelector('.ta-state-circle')!;
    click(bCircle);
    expect(itemByPkg('com.b.app').el.dataset.state).toBe('unchecked');
    expect(bCircle.querySelector('.ta-state-icon')).toBeNull();
    click(bCircle);
    expect(itemByPkg('com.b.app').el.dataset.state).toBe('blacklisted');
    expect(bCircle.querySelector('.ta-state-icon')?.textContent).toBe('block');

    // Toggle com.a.app to blacklisted
    click(itemByPkg('com.a.app').el);
    expect(itemByPkg('com.a.app').el.dataset.state).toBe('blacklisted');
    expect(itemByPkg('com.a.app').el.querySelector('.ta-state-icon')?.textContent).toBe('block');

    // Toggle it back off to cover removing the blacklist icon.
    click(itemByPkg('com.a.app').el);
    expect(itemByPkg('com.a.app').el.dataset.state).toBe('unchecked');
    expect(itemByPkg('com.a.app').el.querySelector('.ta-state-icon')).toBeNull();
    click(itemByPkg('com.a.app').el);

    // Apply blacklist
    click(document.getElementById('ha-apply')!);
    await tick();
    expect(execCalls().some(c => c.includes('blacklist.txt'))).toBe(true);

    // Switch back to scope
    click(document.getElementById('ha-toggle-mode')!);
    await tick();
    expect(itemByPkg('com.a.app').el.dataset.state).toBe('unchecked');
  });

  it('prunes blacklisted entries from the scope list immediately on apply', async () => {
    state.scopeList = 'com.a.app\ncom.b.app\ncom.c.app\n';
    await openHmaAppsManager();
    await selectMode();

    click(itemByPkg('com.a.app').el);
    click(document.getElementById('ha-apply')!);

    await vi.waitFor(() => {
      expect(appendToOutput).toHaveBeenCalledWith('[HMA] Pruned 2 blacklisted entries from scope list');
    });
    const staging = execCalls().find(c => c.includes('.hma_scope_staging'))!;
    const b64 = staging.match(/printf '%s' '([^']*)'/s)![1]!;
    expect(atob(b64)).toBe('com.c.app');
    expect(showToast).toHaveBeenCalledWith('Blacklist saved', expect.objectContaining({ type: 'success' }));
  });

  it('warns but still saves when the scope list cannot be pruned', async () => {
    state.scopeList = 'com.a.app\ncom.b.app\ncom.c.app\n';
    await openHmaAppsManager();
    await selectMode();
    state.listRawFails = true;

    click(document.getElementById('ha-apply')!);
    await vi.waitFor(() => {
      expect(appendToOutput).toHaveBeenCalledWith(
        expect.stringContaining('[HMA] Warning: could not prune scope list'),
        true,
      );
    });
    expect(showToast).toHaveBeenCalledWith('Blacklist saved', expect.objectContaining({ type: 'success' }));
  });

  it('saves an empty blacklist without pruning the scope list', async () => {
    await openHmaAppsManager();
    await selectMode();
    click(document.getElementById('ha-deselect-all')!);

    click(document.getElementById('ha-apply')!);
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Blacklist saved', expect.objectContaining({ type: 'success' }));
    });
    expect(execCalls().some(c => c.includes('.hma_scope_staging'))).toBe(false);
    const write = execCalls().find(c => c.includes('blacklist.txt') && c.includes('base64 -d'))!;
    const b64 = write.match(/printf '%s' "([^"]*)"/)![1]!;
    expect(atob(b64)).toBe('');
  });

  it('reports a blacklist write failure and re-enables Apply', async () => {
    await openHmaAppsManager();
    await selectMode();
    state.blacklistWriteFails = true;

    click(document.getElementById('ha-apply')!);
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed: Error: blacklist boom'),
        expect.objectContaining({ type: 'error' }),
      );
    });
    expect(appendToOutput).toHaveBeenCalledWith(
      expect.stringContaining('[HMA] Failed to save blacklist'),
      true,
    );
    expect((document.getElementById('ha-apply') as HTMLElement & { disabled: boolean }).disabled).toBe(false);
  });

  it('routes the header back button through history in scope mode', async () => {
    await openHmaAppsManager();
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});

    click(document.getElementById('ha-back')!);
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('returns to scope from blacklist with the header back button', async () => {
    await openHmaAppsManager();
    await selectMode();
    const overlay = document.querySelector('.ha-overlay') as HTMLElement;

    click(document.getElementById('ha-back')!);
    await vi.waitFor(() => expect(title()).toBe('HMA-OSS Scope'));
    expect(overlay.classList.contains('ta-overlay--open')).toBe(true);
  });

  it('reloads scope states when switching back from blacklist', async () => {
    await openHmaAppsManager();
    await selectMode();
    state.scopeList = 'com.c.app\n';

    click(document.getElementById('ha-toggle-mode')!);
    await vi.waitFor(() => expect(itemByPkg('com.c.app').el.dataset.state).toBe('targeted'));
    expect(itemByPkg('com.a.app').el.dataset.state).toBe('unchecked');
    expect(appendToOutput).toHaveBeenCalledWith('[HMA] Reloading scope states...');
  });

  it('still reloads scope states when the blacklist file cannot be read', async () => {
    await openHmaAppsManager();
    await selectMode();
    state.blacklistCatFails = true;

    click(document.getElementById('ha-toggle-mode')!);
    await vi.waitFor(() => expect(itemByPkg('com.a.app').el.dataset.state).toBe('targeted'));
    expect(title()).toBe('HMA-OSS Scope');
  });

  it('reports a scope reload failure when switching back', async () => {
    await openHmaAppsManager();
    await selectMode();
    state.listRawFails = true;

    click(document.getElementById('ha-toggle-mode')!);
    await vi.waitFor(() => {
      expect(appendToOutput).toHaveBeenCalledWith(
        expect.stringContaining('[HMA] Failed to reload scope states'),
        true,
      );
    });
  });

  it('navigates back to scope from blacklist on popstate without closing overlay', async () => {
    await openHmaAppsManager();
    const overlay = document.querySelector('.ta-overlay') as HTMLElement;
    await vi.waitFor(() => {
      expect(overlay.classList.contains('ta-overlay--open')).toBe(true);
    });

    // Subpage states keep the overlay open.
    window.dispatchEvent(new PopStateEvent('popstate', { state: { subpage: 'settings' } }));
    expect(overlay.classList.contains('ta-overlay--open')).toBe(true);

    // Switch to blacklist mode
    click(document.getElementById('ha-toggle-mode')!);
    await tick();
    expect(document.querySelector('.ta-title')?.textContent).toBe('Blacklist');

    // A popstate that still belongs to blacklist mode is ignored.
    window.dispatchEvent(new PopStateEvent('popstate', { state: { overlay: 'hma-apps', mode: 'blacklist' } }));
    expect(document.querySelector('.ta-title')?.textContent).toBe('Blacklist');

    // Pop state back from blacklist mode (simulating phone back button)
    window.dispatchEvent(new PopStateEvent('popstate', { state: { overlay: 'hma-apps' } }));
    await tick();
    expect(document.querySelector('.ta-title')?.textContent).toBe('HMA-OSS Scope');
    expect(overlay.classList.contains('ta-overlay--open')).toBe(true);

    // Pop state from scope (leaving whole page)
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(overlay.classList.contains('ta-overlay--open')).toBe(false);

    // A second close is a no-op.
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(overlay.classList.contains('ta-overlay--open')).toBe(false);
  });

  it('closes on a backdrop tap when there is no overlay history state', async () => {
    await openHmaAppsManager();
    const overlay = document.querySelector('.ha-overlay') as HTMLElement;
    history.replaceState(null, '');

    click(overlay);
    expect(overlay.classList.contains('ta-overlay--open')).toBe(false);
  });

  it('routes a backdrop tap through history when the overlay state is active', async () => {
    await openHmaAppsManager();
    const overlay = document.querySelector('.ha-overlay') as HTMLElement;
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});

    click(overlay);
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
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

  it('resolves system app labels and caches the system package list', async () => {
    state.scopeList = 'com.a.app\ncom.b.app\n';
    state.ksu = {
      getPackagesInfo: (json: string) => {
        const pkgs = JSON.parse(json) as string[];
        return JSON.stringify(pkgs.map(pkg => ({
          packageName: pkg,
          appLabel: pkg === 'com.sys.one' ? 'System One' : pkg,
        })));
      },
    };
    await openHmaAppsManager();
    expect(itemByPkg('com.sys.one')).toBeUndefined();

    click(document.getElementById('ha-toggle-system')!);
    await vi.waitFor(() => expect(itemByPkg('com.sys.one')).toBeDefined());
    expect(itemByPkg('com.sys.one').el.dataset.state).toBe('unchecked');
    expect(itemByPkg('com.sys.one').el.querySelector('.ta-item-name')?.textContent).toBe('System One');
    expect(execCalls().filter(c => c.includes('pm list packages -s'))).toHaveLength(1);

    // Hiding system apps leaves selected system apps visible.
    click(itemByPkg('com.sys.one').el);
    expect(itemByPkg('com.sys.one').el.dataset.state).toBe('targeted');
    click(document.getElementById('ha-toggle-system')!);
    expect(itemByPkg('com.sys.one')).toBeDefined();

    // Showing them again reuses the cached package list.
    click(document.getElementById('ha-toggle-system')!);
    await tick();
    expect(itemByPkg('com.sys.one')).toBeDefined();
    expect(execCalls().filter(c => c.includes('pm list packages -s'))).toHaveLength(1);
  });

  it('uses blacklist states for system apps in blacklist mode', async () => {
    state.blacklistFile = 'com.b.app\ncom.sys.one\n';
    state.sysPkgs = 'com.sys.one\ncom.sys.two\n';
    await openHmaAppsManager();
    await selectMode();

    click(document.getElementById('ha-toggle-system')!);
    await vi.waitFor(() => expect(itemByPkg('com.sys.one')).toBeDefined());
    expect(itemByPkg('com.sys.one').el.dataset.state).toBe('blacklisted');
    expect(itemByPkg('com.sys.two').el.dataset.state).toBe('unchecked');
    expect(document.getElementById('ha-toggle-system')?.querySelector('[slot="headline"]')?.textContent)
      .toBe('Hide system apps');

    // Hiding keeps the blacklisted system app visible but drops the unchecked one.
    click(document.getElementById('ha-toggle-system')!);
    expect(itemByPkg('com.sys.one')).toBeDefined();
    expect(itemByPkg('com.sys.two')).toBeUndefined();

    // Re-show the system apps and enter blacklist mode again with the toggle on.
    click(document.getElementById('ha-toggle-mode')!);
    await vi.waitFor(() => expect(title()).toBe('HMA-OSS Scope'));
    click(document.getElementById('ha-toggle-system')!);
    click(document.getElementById('ha-toggle-mode')!);
    await vi.waitFor(() => expect(title()).toBe('Blacklist'));
    expect(document.getElementById('ha-toggle-system')?.querySelector('[slot="headline"]')?.textContent)
      .toBe('Hide system apps');
  });

  it('imports DenyList entries', async () => {
    state.denylist = 'com.c.app\n';
    await openHmaAppsManager();
    click(document.getElementById('ha-import-denylist')!);
    await tick();
    expect(itemByPkg('com.c.app').el.dataset.state).toBe('targeted');
  });

  it('imports DenyList entries as blacklisted in blacklist mode', async () => {
    state.denylist = 'com.a.app\ncom.c.app\n';
    await openHmaAppsManager();
    await selectMode();

    click(document.getElementById('ha-import-denylist')!);
    await vi.waitFor(() => expect(itemByPkg('com.a.app').el.dataset.state).toBe('blacklisted'));
    expect(itemByPkg('com.c.app').el.dataset.state).toBe('blacklisted');
    expect(appendToOutput).toHaveBeenCalledWith('[HMA] Imported 2 apps from DenyList');
    expect(showToast).toHaveBeenCalledWith('DenyList apps selected', expect.objectContaining({ type: 'success' }));
  });

  it('reports an unreadable DenyList', async () => {
    state.denylist = '';
    await openHmaAppsManager();
    click(document.getElementById('ha-import-denylist')!);

    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Failed to read DenyList', expect.objectContaining({ type: 'error' }));
    });
    expect(appendToOutput).toHaveBeenCalledWith('[HMA] DenyList: failed to read', true);
  });

  it('re-runs hma.sh on regenerate confirmation', async () => {
    await openHmaAppsManager();
    const before = listRawCalls();
    click(document.getElementById('ha-regenerate')!);
    expect(showDialog).toHaveBeenCalled();

    click(state.lastDialog!.querySelector('#ha-regenerate-confirm')!);
    await vi.waitFor(() => {
      expect(appendToOutput).toHaveBeenCalledWith('[HMA] Regeneration complete');
    });
    expect(execCalls().some(cmd => /features\/hma\.sh'$/.test(cmd))).toBe(true);
    expect(showToast).toHaveBeenCalledWith(
      'HMA-OSS configuration regenerated',
      expect.objectContaining({ type: 'success' }),
    );
    await vi.waitFor(() => expect(listRawCalls()).toBe(before + 1));
    expect((document.getElementById('ha-loading') as HTMLElement).style.display).toBe('none');
    expect((document.getElementById('ha-list') as HTMLElement).style.display).toBe('');
  });

  it('reports a regenerate failure', async () => {
    state.regenFails = true;
    await openHmaAppsManager();
    click(document.getElementById('ha-regenerate')!);

    click(state.lastDialog!.querySelector('#ha-regenerate-confirm')!);
    await vi.waitFor(() => {
      expect(appendToOutput).toHaveBeenCalledWith(
        expect.stringContaining('[HMA] Regeneration failed'),
        true,
      );
    });
    expect(showToast).not.toHaveBeenCalled();
    expect((document.getElementById('ha-loading') as HTMLElement).style.display).toBe('none');
    expect((document.getElementById('ha-list') as HTMLElement).style.display).toBe('');
  });

  it('closes the regenerate dialog from the cancel action', async () => {
    await openHmaAppsManager();
    click(document.getElementById('ha-regenerate')!);
    const dialog = state.lastDialog!;

    click(dialog.querySelector('.dialog-action-close')!);
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  it('refreshes the list from the menu and reports refresh failures', async () => {
    await openHmaAppsManager();
    const before = listRawCalls();
    state.scopeList = 'com.b.app\n';

    click(document.getElementById('ha-refresh')!);
    await vi.waitFor(() => expect(itemByPkg('com.a.app').el.dataset.state).toBe('unchecked'));
    expect(listRawCalls()).toBe(before + 1);
    expect(appendToOutput).toHaveBeenCalledWith('[HMA] Refreshed 3 user apps, 1 in HMA scope');

    state.listRawFails = true;
    click(document.getElementById('ha-refresh')!);
    await vi.waitFor(() => {
      expect(appendToOutput).toHaveBeenCalledWith(
        expect.stringContaining('[HMA] Refresh failed'),
        true,
      );
    });
    expect(itemByPkg('com.a.app').el.dataset.state).toBe('unchecked');
  });

  it('uses the default data directory when none is configured', async () => {
    state.dataDir = null;
    await openHmaAppsManager();
    await selectMode();

    expect(execCalls().some(cmd => cmd.startsWith('cat /data/adb/specter/blacklist.txt'))).toBe(true);
  });

  it('ignores a second open while the overlay exists', async () => {
    await openHmaAppsManager();
    await openHmaAppsManager();

    expect(document.querySelectorAll('.ha-overlay')).toHaveLength(1);
    expect(listRawCalls()).toBe(1);
  });
});
