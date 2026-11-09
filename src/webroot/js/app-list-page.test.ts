import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  exec: vi.fn(),
  showToast: vi.fn(),
  showLoadingToast: vi.fn(() => document.createElement('div')),
  updateToast: vi.fn((_toast: HTMLElement, message: string, options?: unknown) => {
    h.showToast(message, options);
  }),
  appendToOutput: vi.fn(),
}));

vi.mock('./bridge.js', () => ({
  exec: h.exec,
  spawnCommand: h.exec,
  getModuleDir: () => '/data/adb/modules/specter',
  getDataDir: () => '/data/adb/specter',
}));
vi.mock('./utils.js', () => ({
  shellEscape: (value: string) => `'${value}'`,
  escapeHtml: (value: string) => value,
  afterPaint: (fn: () => void) => fn(),
}));
vi.mock('./toast.js', () => ({
  showToast: h.showToast,
  showLoadingToast: h.showLoadingToast,
  updateToast: h.updateToast,
}));
vi.mock('./terminal.js', () => ({ appendToOutput: h.appendToOutput }));
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

import {
  openAppListPage,
  selectAllAction,
  deselectAllAction,
  refreshAction,
  toggleModeAction,
  type AppListPageAdapter,
} from './app-list-page.js';
import type { AppListShellSpec } from './app-list-shell.js';
import type { AppLabel, StateVisual } from './app-list-model.js';

const LABEL = (key: string, fallback: string): AppLabel => ({ key, fallback });

const VISUALS: Record<string, StateVisual> = {
  unchecked: { icon: '', text: '', labelKey: 'tx_state_unchecked', labelFallback: 'Not selected' },
  targeted: { icon: 'done', text: '', labelKey: 'tx_state_targeted', labelFallback: 'Selected' },
};

const SHELL: AppListShellSpec = {
  title: { id: 'tx-title', label: LABEL('tx_title', 'Test Apps') },
  back: { id: 'tx-back', label: LABEL('common_back', 'Back') },
  search: {
    inputId: 'tx-search',
    clearId: 'tx-search-clear',
    buttonId: 'tx-search-btn',
    placeholder: LABEL('ta_search_placeholder', 'Search apps'),
    clearLabel: LABEL('ta_search_clear', 'Clear search'),
  },
  menu: {
    buttonId: 'tx-menu-btn',
    id: 'tx-menu',
    buttonLabel: LABEL('ta_menu_more', 'More options'),
    items: [
      { id: 'tx-refresh', label: LABEL('ta_refresh', 'Refresh'), slotClass: 'first' },
      { id: 'tx-select-all', label: LABEL('ta_select_all', 'Select All') },
      { id: 'tx-deselect-all', label: LABEL('ta_deselect_all', 'Deselect All') },
      { id: 'tx-toggle-system', label: LABEL('ta_show_system', 'Show system apps') },
      { id: 'tx-toggle-mode', label: LABEL('ta_edit_blacklist', 'Edit blacklist') },
      { id: 'tx-import-denylist', label: LABEL('ta_import_denylist', 'Import from DenyList'), slotClass: 'last' },
    ],
  },
  filtersId: 'tx-filters',
  listId: 'tx-list',
  loading: { id: 'tx-loading', label: LABEL('ta_loading', 'Loading apps...') },
  apply: { id: 'tx-apply', label: LABEL('ta_apply', 'Apply') },
  ptr: { indicatorId: 'tx-ptr-indicator', arrowId: 'tx-ptr-arrow' },
};

function makeAdapter(overrides: Partial<AppListPageAdapter> = {}): AppListPageAdapter {
  const read = vi.fn(async () => 'com.a.app\ncom.b.app\ncom.c.app\n');
  const writeMain = vi.fn(async () => {});
  const afterPrimarySave = vi.fn();
  const adapter: AppListPageAdapter = {
    overlay: {
      className: 'ta-overlay tx-overlay',
      guardSelector: '.tx-overlay',
      historyKey: 'test-apps',
      primaryModeName: 'test',
      idPrefix: 'tx',
    },
    primaryFilterId: 'tx-state-filter',
    shell: SHELL,
    labels: {
      primaryTitle: LABEL('tx_title', 'Test Apps'),
      blacklistTitle: LABEL('bl_title', 'Blacklist'),
      editBlacklist: LABEL('ta_edit_blacklist', 'Edit blacklist'),
      backToPrimary: LABEL('tx_back', 'Back to test'),
      showSystem: LABEL('ta_show_system', 'Show system apps'),
      hideSystem: LABEL('ta_hide_system', 'Hide system apps'),
      filterAll: LABEL('ta_filter_all', 'All'),
      filterSelected: LABEL('ta_filter_selected', 'Selected'),
      filterNotSelected: LABEL('ta_filter_not_selected', 'Not Selected'),
      filterSelectedBlacklist: LABEL('bl_filter_blacklisted', 'Blacklisted'),
      filterNotSelectedBlacklist: LABEL('bl_filter_not_blacklisted', 'Not Blacklisted'),
      filterAria: LABEL('ta_filter_aria', 'Filter apps by selection'),
      apply: LABEL('ta_apply', 'Apply'),
      applying: LABEL('ta_applying', 'Applying…'),
      applied: LABEL('ta_applied', 'Applied'),
      loadError: LABEL('ta_load_error', 'Failed to load apps'),
      noResults: LABEL('ta_no_results', 'No apps match your filter'),
    },
    visuals: VISUALS,
    terms: {
      logPrefix: '[TEST]',
      overlayName: 'Test Apps',
      primaryMode: 'test',
      primaryScope: 'test scope',
      failedPrimarySave: 'Failed to save test list',
    },
    state: {
      defaultPrimaryState: () => 'targeted',
      rowNext: (app, ctx) => ctx.mode === 'blacklist'
        ? (app.state === 'unchecked' ? 'blacklisted' : 'unchecked')
        : (app.state === 'targeted' ? 'unchecked' : 'targeted'),
      circleNext: (app, ctx) => ctx.mode === 'blacklist'
        ? (app.state === 'unchecked' ? 'blacklisted' : 'unchecked')
        : (app.state === 'targeted' ? 'unchecked' : 'targeted'),
      selectAllState: ctx => ctx.mode === 'blacklist' ? 'blacklisted' : 'targeted',
      importState: ctx => ctx.mode === 'blacklist' ? 'blacklisted' : 'targeted',
    },
    source: {
      read,
      writeMain,
      parse: raw => new Map(raw.split('\n').filter(Boolean).map(pkg => [pkg, 'targeted'])),
      serializeMain: apps => apps.filter(a => a.state === 'targeted').map(a => a.packageName).sort().join('\n'),
      linePackage: line => line,
      mainListName: 'test list',
      primarySavedLog: count => `Wrote test list (${count} targets)`,
      primarySavedToast: LABEL('tx_saved', 'Test list saved'),
      afterPrimarySave,
    },
    menuActions: {
      'tx-refresh': refreshAction,
      'tx-select-all': selectAllAction,
      'tx-deselect-all': deselectAllAction,
      'tx-toggle-mode': toggleModeAction,
    },
  };
  return { ...adapter, ...overrides };
}

const items = () =>
  [...document.querySelectorAll<HTMLElement>('.ta-item')].map(el => ({
    pkg: el.dataset.package,
    state: el.dataset.state,
    el,
  }));

const click = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));

function pickFilter(id: string, value: string): void {
  const root = document.querySelector(`[data-filter-id="${id}"]`)!;
  click(root.querySelector('.filter-trigger')!);
  click(root.querySelector(`.filter-option[data-value="${value}"]`)!);
}

describe('shared app-list controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.isOverlayOpen = false;
    history.replaceState(null, '');
    h.exec.mockReset();
    h.showToast.mockReset();
    h.appendToOutput.mockReset();
    h.exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('blacklist.txt')) return { stdout: 'com.b.app\n', stderr: '', code: 0 };
      if (cmd.includes('magisk --denylist')) return { stdout: '', stderr: '', code: 0 };
      if (cmd.includes('base64 -w0')) return { stdout: '', stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });
  });

  it('mounts the shell, loads apps, resolves states and replaces the skeleton', async () => {
    const handle = await openAppListPage(makeAdapter());
    expect(handle).not.toBeNull();
    expect(handle!.context.apps).toHaveLength(3);
    expect(items().map(i => [i.pkg, i.state])).toEqual([
      ['com.a.app', 'targeted'],
      ['com.b.app', 'targeted'],
      ['com.c.app', 'targeted'],
    ]);
    expect((document.getElementById('tx-loading') as HTMLElement).style.display).toBe('none');
    expect((document.getElementById('tx-list') as HTMLElement).style.display).toBe('');
    expect(document.querySelectorAll('#tx-loading .ta-skeleton-row')).toHaveLength(8);
    expect(h.appendToOutput).toHaveBeenCalledWith('[TEST] Loaded 3 user apps, 3 in test scope');
  });

  it('ignores a second open while the overlay exists', async () => {
    expect(await openAppListPage(makeAdapter())).not.toBeNull();
    expect(await openAppListPage(makeAdapter())).toBeNull();
    expect(document.querySelectorAll('.tx-overlay')).toHaveLength(1);
  });

  it('renders an empty state when nothing matches', async () => {
    const adapter = makeAdapter();
    adapter.source.read = vi.fn(async () => '');
    await openAppListPage(adapter);
    expect(items()).toHaveLength(0);
    expect(document.querySelector('#tx-list .ta-empty')?.textContent).toBe('No apps match your filter');
  });

  it('filters by search and by the selection dropdown', async () => {
    await openAppListPage(makeAdapter());

    const search = document.getElementById('tx-search') as HTMLElement & { value: string };
    search.value = 'b.app';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(items().map(i => i.pkg)).toEqual(['com.b.app']);

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    pickFilter('tx-state-filter', 'selected');
    expect(items().map(i => i.pkg)).toEqual(['com.a.app', 'com.b.app', 'com.c.app']);

    pickFilter('tx-state-filter', 'not_selected');
    expect(items()).toHaveLength(0);
  });

  it('selects and deselects all using adapter state', async () => {
    await openAppListPage(makeAdapter());
    click(document.getElementById('tx-deselect-all')!);
    expect(items().every(i => i.state === 'unchecked')).toBe(true);
    click(document.getElementById('tx-select-all')!);
    expect(items().every(i => i.state === 'targeted')).toBe(true);
  });

  it('opens and collapses search through history', async () => {
    await openAppListPage(makeAdapter());
    const container = document.querySelector('.ta-search-container') as HTMLElement;
    const header = document.querySelector('.ta-header') as HTMLElement;
    expect(container.hidden).toBe(true);

    click(document.getElementById('tx-search-btn')!);
    expect(container.hidden).toBe(false);
    expect(header.classList.contains('ta-header--searching')).toBe(true);

    const search = document.getElementById('tx-search') as HTMLElement & { value: string };
    search.value = 'a.app';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(items().map(i => i.pkg)).toEqual(['com.a.app']);

    window.dispatchEvent(new PopStateEvent('popstate', { state: { overlay: 'test-apps' } }));
    expect(container.hidden).toBe(true);
    expect(header.classList.contains('ta-header--searching')).toBe(false);
    expect(items()).toHaveLength(3);
  });

  it('switches to blacklist mode, saves it and prunes the main list', async () => {
    const adapter = makeAdapter();
    adapter.source.read = vi.fn(async () => 'com.a.app\ncom.b.app\ncom.c.app\n');
    await openAppListPage(adapter);

    click(document.getElementById('tx-toggle-mode')!);
    await vi.waitFor(() => expect(document.querySelector('.ta-title')?.textContent).toBe('Blacklist'));
    expect(items().find(i => i.pkg === 'com.b.app')?.state).toBe('blacklisted');

    click(items().find(i => i.pkg === 'com.a.app')!.el);
    expect(items().find(i => i.pkg === 'com.a.app')?.state).toBe('blacklisted');

    click(document.getElementById('tx-apply')!);
    await vi.waitFor(() => expect(adapter.source.writeMain).toHaveBeenCalled());

    expect(h.appendToOutput).toHaveBeenCalledWith('[TEST] Wrote 2 entries to blacklist.txt');
    expect(h.appendToOutput).toHaveBeenCalledWith('[TEST] Pruned 2 blacklisted entries from test list');
    expect(adapter.source.writeMain).toHaveBeenCalledWith('com.c.app');
    expect(h.showToast).toHaveBeenCalledWith('Blacklist saved', expect.objectContaining({ type: 'success' }));
  });

  it('fails the blacklist apply when writing blacklist.txt exits non-zero', async () => {
    h.exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('base64 -d >') && cmd.includes('blacklist.txt')) {
        return { stdout: '', stderr: 'read-only file system', code: 1 };
      }
      if (cmd.includes('blacklist.txt')) return { stdout: 'com.b.app\n', stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });
    const adapter = makeAdapter();
    await openAppListPage(adapter);
    const apply = document.getElementById('tx-apply') as HTMLElement & { disabled: boolean; label?: string };

    click(document.getElementById('tx-toggle-mode')!);
    await vi.waitFor(() => expect(document.querySelector('.ta-title')?.textContent).toBe('Blacklist'));

    click(apply);
    await vi.waitFor(() => expect(apply.disabled).toBe(false));

    expect(h.appendToOutput).toHaveBeenCalledWith('[TEST] Failed to save blacklist: Error: read-only file system', true);
    expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining('read-only file system'), expect.objectContaining({ type: 'error' }));
    expect(h.showToast).not.toHaveBeenCalledWith('Blacklist saved', expect.anything());
    expect(adapter.source.writeMain).not.toHaveBeenCalled();
    expect(apply.label).toBe('Apply');
  });

  it('fails the blacklist apply when enabling the blacklist exits non-zero', async () => {
    h.exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('touch') && cmd.includes('blacklist_enabled')) {
        return { stdout: '', stderr: '', code: 1 };
      }
      if (cmd.includes('blacklist.txt')) return { stdout: 'com.b.app\n', stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });
    const adapter = makeAdapter();
    await openAppListPage(adapter);
    const apply = document.getElementById('tx-apply') as HTMLElement & { disabled: boolean; label?: string };

    click(document.getElementById('tx-toggle-mode')!);
    await vi.waitFor(() => expect(document.querySelector('.ta-title')?.textContent).toBe('Blacklist'));

    click(apply);
    await vi.waitFor(() => expect(apply.disabled).toBe(false));

    expect(h.appendToOutput).toHaveBeenCalledWith('[TEST] Failed to save blacklist: Error: failed to enable blacklist', true);
    expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining('failed to enable blacklist'), expect.objectContaining({ type: 'error' }));
    expect(h.showToast).not.toHaveBeenCalledWith('Blacklist saved', expect.anything());
    expect(adapter.source.writeMain).not.toHaveBeenCalled();
    expect(apply.label).toBe('Apply');
  });

  it('applies the primary list, restores the button, and runs the post-save hook', async () => {
    vi.useFakeTimers();
    try {
      const adapter = makeAdapter();
      await openAppListPage(adapter);
      const apply = document.getElementById('tx-apply') as HTMLElement & { disabled: boolean; label?: string };

      click(apply);
      expect(apply.disabled).toBe(true);
      expect(apply.label).toBe('Applying…');
      click(apply);
      await vi.runAllTimersAsync();

      expect(adapter.source.writeMain).toHaveBeenCalledTimes(1);
      expect(adapter.source.writeMain).toHaveBeenCalledWith('com.a.app\ncom.b.app\ncom.c.app');
      expect(adapter.source.afterPrimarySave).toHaveBeenCalledTimes(1);
      expect(h.showToast).toHaveBeenCalledWith('Test list saved', expect.objectContaining({ type: 'success' }));
      expect(apply.disabled).toBe(false);
      expect(apply.label).toBe('Apply');
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes on a backdrop tap and popstate', async () => {
    await openAppListPage(makeAdapter());
    const overlay = document.querySelector('.tx-overlay') as HTMLElement;
    history.replaceState(null, '');
    click(overlay);
    expect(overlay.classList.contains('ta-overlay--open')).toBe(false);

    document.body.innerHTML = '';
    history.replaceState(null, '');
    await openAppListPage(makeAdapter());
    const second = document.querySelector('.tx-overlay') as HTMLElement;
    await vi.waitFor(() => expect(second.classList.contains('ta-overlay--open')).toBe(true));
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(second.classList.contains('ta-overlay--open')).toBe(false);
  });

  describe('chunked rendering', () => {
    it('renders 48 rows and appends more from the observer and scroll', async () => {
      const RealIO = globalThis.IntersectionObserver;
      let callback: IntersectionObserverCallback | null = null;
      globalThis.IntersectionObserver = class {
        constructor(cb: IntersectionObserverCallback) { callback = cb; }
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof IntersectionObserver;
      try {
        const adapter = makeAdapter();
        adapter.source.read = vi.fn(async () =>
          Array.from({ length: 100 }, (_, i) => `com.x${i}.app`).join('\n') + '\n');
        await openAppListPage(adapter);

        const list = document.getElementById('tx-list') as HTMLElement;
        expect(items()).toHaveLength(48);
        expect(list.querySelector('.ta-sentinel')).not.toBeNull();

        callback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        expect(items()).toHaveLength(96);

        list.dispatchEvent(new Event('scroll'));
        expect(items()).toHaveLength(100);
        expect(list.querySelector('.ta-sentinel')).toBeNull();

        list.dispatchEvent(new Event('scroll'));
        expect(items()).toHaveLength(100);
      } finally {
        globalThis.IntersectionObserver = RealIO;
      }
    });

    it('appends via scroll when IntersectionObserver is unavailable', async () => {
      const RealIO = globalThis.IntersectionObserver;
      (globalThis as any).IntersectionObserver = undefined;
      try {
        const adapter = makeAdapter();
        adapter.source.read = vi.fn(async () =>
          Array.from({ length: 60 }, (_, i) => `com.y${i}.app`).join('\n') + '\n');
        await openAppListPage(adapter);

        const list = document.getElementById('tx-list') as HTMLElement;
        expect(items()).toHaveLength(48);
        list.dispatchEvent(new Event('scroll'));
        expect(items()).toHaveLength(60);
      } finally {
        globalThis.IntersectionObserver = RealIO;
      }
    });
  });

  describe('pull to refresh', () => {
    const ptr = () => ({
      list: document.getElementById('tx-list') as HTMLElement,
      indicator: document.getElementById('tx-ptr-indicator') as HTMLElement,
      arrow: document.getElementById('tx-ptr-arrow') as HTMLElement,
    });
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
      const adapter = makeAdapter();
      await openAppListPage(adapter);
      const { list, indicator, arrow } = ptr();
      const read = adapter.source.read as ReturnType<typeof vi.fn>;
      const before = read.mock.calls.length;

      list.dispatchEvent(pointer('pointerdown', 100));
      expect(indicator.classList.contains('ptr-dragging')).toBe(true);

      list.dispatchEvent(pointer('pointermove', 260));
      expect(indicator.style.transform).toBe('translateY(0px)');
      expect(indicator.style.opacity).toBe('1');
      expect(arrow.style.transform).toBe('rotate(360deg)');

      list.dispatchEvent(pointer('pointermove', 900));
      expect(indicator.style.transform).toBe('translateY(120px)');

      list.dispatchEvent(pointer('pointerup', 900));
      await vi.waitFor(() => {
        expect(read.mock.calls.length).toBe(before + 1);
        expect(indicator.style.transform).toBe('');
        expect(indicator.style.opacity).toBe('0');
        expect(arrow.style.display).toBe('');
      });
    });

    it('pointer: a short pull just resets the indicator', async () => {
      const adapter = makeAdapter();
      await openAppListPage(adapter);
      const { list, indicator, arrow } = ptr();
      const read = adapter.source.read as ReturnType<typeof vi.fn>;
      const before = read.mock.calls.length;

      list.dispatchEvent(pointer('pointerdown', 100));
      list.dispatchEvent(pointer('pointermove', 140));
      expect(indicator.style.transform).toBe('translateY(-60px)');
      list.dispatchEvent(pointer('pointerup', 140));

      expect(indicator.style.transform).toBe('');
      expect(indicator.style.opacity).toBe('0');
      expect(arrow.style.transform).toBe('');
      expect(read.mock.calls.length).toBe(before);
    });

    it('pointer: pulling back up or cancelling aborts the gesture', async () => {
      await openAppListPage(makeAdapter());
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
      await openAppListPage(makeAdapter());
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
      const adapter = makeAdapter();
      await openAppListPage(adapter);
      const { list, indicator, arrow } = ptr();
      const read = adapter.source.read as ReturnType<typeof vi.fn>;
      const before = read.mock.calls.length;

      list.dispatchEvent(touch('touchstart', [100]));
      list.dispatchEvent(touch('touchmove', [220]));
      expect(indicator.classList.contains('ptr-dragging')).toBe(true);
      list.dispatchEvent(touch('touchmove', [400, 420]));
      expect(indicator.style.transform).toBe('');
      list.dispatchEvent(touch('touchmove', [420]));
      expect(indicator.style.transform).toBe('translateY(80px)');
      expect(arrow.style.transform).toBe('rotate(360deg)');

      list.dispatchEvent(touch('touchend', []));
      await vi.waitFor(() => {
        expect(read.mock.calls.length).toBe(before + 1);
        expect(indicator.style.transform).toBe('');
      });
    });

    it('touch: reversing direction or cancelling aborts, and scrolled starts are ignored', async () => {
      (window as any).ontouchstart = null;
      await openAppListPage(makeAdapter());
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
