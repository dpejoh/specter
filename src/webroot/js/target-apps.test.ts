import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  listRawFails: false,
  blacklistFile: 'com.b.app\n',
  denylist: '',
  userPkgs: null as string | null,
  deferPaint: false,
  paintCallback: null as (() => void) | null,
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
  afterPaint: (fn: () => void) => {
    if (state.deferPaint) { state.paintCallback = fn; return; }
    fn();
  },
}));
vi.mock('./toast.js', () => ({ showToast }));
vi.mock('./terminal.js', () => ({ appendToOutput }));
vi.mock('./i18n.js', () => ({ getTranslation: () => '', t: (_key: string, fallback = '') => fallback }));
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
  openModeDialog, openModeSubpage: openModeDialog, openRegenerateDialog, openTeesimModeDialog,
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
    state.userPkgs = null;
    state.deferPaint = false;
    state.paintCallback = null;
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

  it('paints the page and skeleton before loading the list', async () => {
    state.deferPaint = true;
    const opening = openTargetAppsManager();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.querySelector('.ta-overlay')).not.toBeNull();
    expect(document.querySelector('#ta-loading sp-settings-section')).not.toBeNull();
    expect(items()).toHaveLength(0);
    expect(execCalls().some(cmd => cmd.includes('cmd package list packages'))).toBe(false);
    expect(state.paintCallback).not.toBeNull();

    state.paintCallback!();
    await opening;
    expect(items()).toHaveLength(4);
  });

  it('shows a skeleton list while loading, then swaps in the apps', async () => {
    await openTargetAppsManager();

    const loading = document.querySelector('#ta-loading') as HTMLElement;
    const section = loading.querySelector('sp-settings-section');
    expect(section).not.toBeNull();
    expect(section!.querySelectorAll('.ta-skeleton-row')).toHaveLength(8);
    expect(section!.querySelector('.ta-skeleton-row [slot="leading"]')?.tagName).toBe('SP-SKELETON');
    expect(section!.querySelector('.ta-skeleton-row [slot="trailing"]')?.getAttribute('variant')).toBe('circular');
    expect(loading.style.display).toBe('none');

    const list = document.querySelector('#ta-list') as HTMLElement;
    expect(list.style.display).toBe('');
    expect(items()).toHaveLength(4);
  });

  it('lazy-loads the list in chunks as the sentinel approaches', async () => {
    const RealIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    try {
      state.userPkgs = Array.from({ length: 60 }, (_, i) => `package:com.x${i}.app`).join('\n') + '\n';
      await openTargetAppsManager();

      expect(items()).toHaveLength(48);
      const list = document.querySelector('#ta-list') as HTMLElement;
      expect(list.querySelector('.ta-sentinel')).not.toBeNull();

      list.dispatchEvent(new Event('scroll'));
      // 60 user packages plus the 3 target-list entries not among them.
      expect(items()).toHaveLength(63);
      expect(list.querySelector('.ta-sentinel')).toBeNull();
    } finally {
      globalThis.IntersectionObserver = RealIO;
    }
  });

  it('renders apps as settings rows in a grouped section', async () => {
    await openTargetAppsManager();

    const section = document.querySelector('#ta-list sp-settings-section');
    expect(section).not.toBeNull();
    const rows = [...section!.querySelectorAll<HTMLElement>('sp-settings-row.ta-item')];
    expect(rows.length).toBe(items().length);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.getAttribute('variant')).toBe('custom');
      expect(row.querySelector('[slot="leading"]')).not.toBeNull();
      expect(row.querySelector('[slot="headline"]')?.textContent).not.toBe('');
      expect(row.querySelector('[slot="supporting"]')?.textContent).toBe(row.dataset.package);
      expect(row.querySelector('[slot="trailing"]')?.classList.contains('ta-state-circle')).toBe(true);
    }
  });

  it('filters by search text and by the selection dropdown', async () => {
    await openTargetAppsManager();

    const pickFilter = (value: string) => {
      const root = document.querySelector('[data-filter-id="ta-state-filter"]')!;
      click(root.querySelector('.filter-trigger')!);
      click(root.querySelector(`.filter-option[data-value="${value}"]`)!);
    };

    const search = document.querySelector('#ta-search') as unknown as HTMLElement & { value: string };
    search.value = 'b.app';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(items().map(i => i.pkg)).toEqual(['com.b.app']);

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    pickFilter('selected');
    expect(items().map(i => i.pkg)).toEqual(['com.a.app', 'com.b.app', 'com.c.app']);

    pickFilter('not_selected');
    expect(items().map(i => i.pkg)).toEqual(['com.d.app']);

    pickFilter('all');
    expect(items()).toHaveLength(4);
  });

  it('filters by mode using the mode filter dropdown', async () => {
    await openTargetAppsManager();

    const pickModeFilter = (value: string) => {
      const root = document.querySelector('[data-filter-id="ta-mode-filter"]')!;
      click(root.querySelector('.filter-trigger')!);
      click(root.querySelector(`.filter-option[data-value="${value}"]`)!);
    };

    pickModeFilter('bare');
    expect(items().map(i => i.pkg)).toEqual(['com.c.app']);

    pickModeFilter('conditional');
    expect(items().map(i => i.pkg)).toEqual(['com.b.app']);

    pickModeFilter('force');
    expect(items().map(i => i.pkg)).toEqual(['com.a.app']);

    pickModeFilter('all');
    expect(items()).toHaveLength(4);
  });

  it('keeps the search field collapsed until the header search icon is tapped', async () => {
    await openTargetAppsManager();

    const container = document.querySelector('.ta-search-container') as HTMLElement;
    const header = document.querySelector('.ta-header') as HTMLElement;
    const searchBtn = document.querySelector('#ta-search-btn') as HTMLElement;
    expect(container.hidden).toBe(true);
    expect(header.classList.contains('ta-header--searching')).toBe(false);

    click(searchBtn);
    expect(container.hidden).toBe(false);
    expect(header.classList.contains('ta-header--searching')).toBe(true);
    expect(searchBtn.getAttribute('aria-expanded')).toBe('true');
  });

  it('collapses an open search on Back before closing the overlay', async () => {
    await openTargetAppsManager();
    // The open class lands in a requestAnimationFrame callback.
    await vi.waitFor(() => {
      expect((document.querySelector('.ta-overlay') as HTMLElement).classList.contains('ta-overlay--open')).toBe(true);
    });

    click(document.querySelector('#ta-search-btn')!);
    const search = document.querySelector('#ta-search') as unknown as HTMLElement & { value: string };
    search.value = 'b.app';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(items().map(i => i.pkg)).toEqual(['com.b.app']);

    window.dispatchEvent(new Event('popstate'));
    const overlay = document.querySelector('.ta-overlay') as HTMLElement;
    expect(overlay.classList.contains('ta-overlay--open')).toBe(true);
    expect((document.querySelector('.ta-search-container') as HTMLElement).hidden).toBe(true);
    expect(search.value).toBe('');
    expect(items()).toHaveLength(4);

    window.dispatchEvent(new Event('popstate'));
    expect(overlay.classList.contains('ta-overlay--open')).toBe(false);
  });

  it('clears the query from the field clear button', async () => {
    await openTargetAppsManager();

    click(document.querySelector('#ta-search-btn')!);
    const search = document.querySelector('#ta-search') as unknown as HTMLElement & { value: string };
    const clearBtn = document.querySelector('#ta-search-clear') as HTMLElement;
    expect(clearBtn.style.display).toBe('none');

    search.value = 'b.app';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(clearBtn.style.display).toBe('');
    expect(items().map(i => i.pkg)).toEqual(['com.b.app']);

    click(clearBtn);
    expect(search.value).toBe('');
    expect(clearBtn.style.display).toBe('none');
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

  describe('pull to refresh', () => {
    const ptr = () => {
      const list = document.querySelector('#ta-list') as HTMLElement;
      return {
        list,
        indicator: document.querySelector('#ptr-indicator') as HTMLElement,
        arrow: document.querySelector('#ptr-arrow') as HTMLElement,
      };
    };
    const listRawCalls = () => execCalls().filter(cmd => cmd.includes('--list-raw')).length;
    const pointer = (type: string, y: number) => {
      const e = new window.MouseEvent(type, { bubbles: true }) as PointerEvent;
      Object.defineProperty(e, 'clientY', { value: y });
      Object.defineProperty(e, 'pointerId', { value: 1 });
      return e;
    };
    const touch = (type: string, ys: number[]) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'touches', { value: ys.map(clientY => ({ clientY })) });
      return e;
    };

    beforeEach(() => {
      delete (window as any).ontouchstart;
      (HTMLElement.prototype as any).setPointerCapture = vi.fn();
    });

    it('pointer: a full pull past the threshold refreshes the list', async () => {
      await openTargetAppsManager();
      const { list, indicator, arrow } = ptr();
      const before = listRawCalls();

      list.dispatchEvent(pointer('pointerdown', 100));
      expect(indicator.classList.contains('ptr-dragging')).toBe(true);

      list.dispatchEvent(pointer('pointermove', 260));
      expect(indicator.style.transform).toBe('translateY(0px)');
      expect(indicator.style.opacity).toBe('1');
      expect(arrow.style.transform).toBe('rotate(360deg)');

      // The pull distance is capped.
      list.dispatchEvent(pointer('pointermove', 900));
      expect(indicator.style.transform).toBe('translateY(120px)');

      list.dispatchEvent(pointer('pointerup', 900));
      await vi.waitFor(() => {
        expect(listRawCalls()).toBe(before + 1);
        expect(indicator.style.transform).toBe('');
        expect(indicator.style.opacity).toBe('0');
        expect(arrow.style.display).toBe('');
      });
    });

    it('pointer: a short pull just resets the indicator', async () => {
      await openTargetAppsManager();
      const { list, indicator, arrow } = ptr();
      const before = listRawCalls();

      list.dispatchEvent(pointer('pointerdown', 100));
      list.dispatchEvent(pointer('pointermove', 140));
      expect(indicator.style.transform).toBe('translateY(-60px)');
      list.dispatchEvent(pointer('pointerup', 140));

      expect(indicator.style.transform).toBe('');
      expect(indicator.style.opacity).toBe('0');
      expect(arrow.style.transform).toBe('');
      expect(listRawCalls()).toBe(before);
    });

    it('pointer: pulling back up or cancelling aborts the gesture', async () => {
      await openTargetAppsManager();
      const { list, indicator } = ptr();

      list.dispatchEvent(pointer('pointerdown', 200));
      list.dispatchEvent(pointer('pointermove', 120));
      expect(indicator.classList.contains('ptr-dragging')).toBe(false);
      expect(indicator.style.opacity).toBe('0');

      list.dispatchEvent(pointer('pointerdown', 100));
      expect(indicator.classList.contains('ptr-dragging')).toBe(true);
      list.dispatchEvent(pointer('pointercancel', 100));
      expect(indicator.classList.contains('ptr-dragging')).toBe(false);
    });

    it('pointer: no gesture starts while the list is scrolled or before pointerdown', async () => {
      await openTargetAppsManager();
      const { list, indicator } = ptr();

      list.dispatchEvent(pointer('pointermove', 300));
      expect(indicator.classList.contains('ptr-dragging')).toBe(false);

      list.scrollTop = 40;
      list.dispatchEvent(pointer('pointerdown', 100));
      expect(indicator.classList.contains('ptr-dragging')).toBe(false);
      list.scrollTop = 0;
    });

    it('touch: drag, release past the threshold and refresh', async () => {
      (window as any).ontouchstart = null;
      await openTargetAppsManager();
      const { list, indicator, arrow } = ptr();
      const before = listRawCalls();

      list.dispatchEvent(touch('touchstart', [100]));
      list.dispatchEvent(touch('touchmove', [220]));
      expect(indicator.classList.contains('ptr-dragging')).toBe(true);
      // Multi-touch moves are ignored.
      list.dispatchEvent(touch('touchmove', [400, 420]));
      expect(indicator.style.transform).toBe('');
      list.dispatchEvent(touch('touchmove', [420]));
      expect(indicator.style.transform).toBe('translateY(80px)');
      expect(arrow.style.transform).toBe('rotate(360deg)');

      list.dispatchEvent(touch('touchend', []));
      await vi.waitFor(() => {
        expect(listRawCalls()).toBe(before + 1);
        expect(indicator.style.transform).toBe('');
      });
    });

    it('touch: reversing direction or cancelling aborts, and scrolled starts are ignored', async () => {
      (window as any).ontouchstart = null;
      await openTargetAppsManager();
      const { list, indicator } = ptr();

      list.scrollTop = 30;
      list.dispatchEvent(touch('touchstart', [100]));
      list.dispatchEvent(touch('touchmove', [300]));
      expect(indicator.classList.contains('ptr-dragging')).toBe(false);
      list.scrollTop = 0;

      list.dispatchEvent(touch('touchstart', [200]));
      list.dispatchEvent(touch('touchmove', [260]));
      expect(indicator.classList.contains('ptr-dragging')).toBe(true);
      list.dispatchEvent(touch('touchmove', [120]));
      expect(indicator.classList.contains('ptr-dragging')).toBe(false);

      list.dispatchEvent(touch('touchstart', [100]));
      list.dispatchEvent(touch('touchmove', [200]));
      expect(indicator.classList.contains('ptr-dragging')).toBe(true);
      list.dispatchEvent(touch('touchcancel', []));
      expect(indicator.classList.contains('ptr-dragging')).toBe(false);
      expect(indicator.style.opacity).toBe('0');
    });
  });
});
