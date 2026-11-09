import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACTIVE = 'a1'.repeat(32);
const CACHED = 'b2'.repeat(32);
const SAVED = 'c3'.repeat(32);

const mocks = vi.hoisted(() => ({
  config: null as any,
  moduleDir: '/data/adb/modules/specter' as string | null,
  exec: vi.fn(async (command: string) => {
    if (command.startsWith('resetprop ro.boot.vbmeta.digest')) return { stdout: `${'a1'.repeat(32)}\n`, stderr: '', code: 0 };
    if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: `${'b2'.repeat(32)}\n`, stderr: '', code: 0 };
    return { stdout: '', stderr: '', code: 0 };
  }),
  spawnCommand: vi.fn(async (command: string) => {
    if (command.startsWith('resetprop ro.boot.vbmeta.digest')) return { stdout: `${'a1'.repeat(32)}\n`, stderr: '', code: 0 };
    if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: `${'b2'.repeat(32)}\n`, stderr: '', code: 0 };
    return { stdout: '', stderr: '', code: 0 };
  }),
  cfgGet: vi.fn(async (key: string, fallback = '') => (key === 'custom_boot_hash' ? 'c3'.repeat(32) : fallback)),
  cfgSet: vi.fn(async (_key: string, _value?: string | null) => undefined),
  showToast: vi.fn(),
  showLoadingToast: vi.fn((_message: string) => document.createElement('div')),
  updateToast: vi.fn(),
  paintCallback: null as (() => void) | null,
  afterPaint: vi.fn((fn: () => void) => { mocks.paintCallback = fn; }),
}));

vi.mock('./subpage.js', () => ({
  openSubPage: vi.fn(async (config: any) => {
    mocks.config = config;
    return { overlay: document.createElement('div'), close: vi.fn(), isMasterEnabled: () => true };
  }),
}));
vi.mock('./bridge.js', () => ({
  exec: mocks.exec,
  spawnCommand: mocks.spawnCommand,
  getModuleDir: () => mocks.moduleDir,
}));
vi.mock('./cfg.js', () => ({ cfgGet: mocks.cfgGet, cfgSet: mocks.cfgSet }));
vi.mock('./toast.js', () => ({
  showToast: mocks.showToast,
  showLoadingToast: mocks.showLoadingToast,
  updateToast: mocks.updateToast,
}));
vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils.js')>();
  return { ...actual, afterPaint: mocks.afterPaint };
});

import { openBootHashSubpage } from './boot-hash-ui.js';
import { t } from './i18n.js';
import './ui/sp-settings-row.js';

function renderAll(): HTMLElement {
  const section = document.createElement('div');
  for (const group of mocks.config.groups) {
    for (const item of group.items) {
      const host = document.createElement('div');
      section.append(host);
      item.render(host, () => true);
    }
  }
  return section;
}

function mountFab() {
  const container = document.createElement('div');
  const close = vi.fn();
  mocks.config.fab(container, { overlay: document.createElement('div'), close, isMasterEnabled: () => true });
  return { container, close, fab: container.querySelector('#bh-save-fab') as HTMLElement };
}

function mountHeader() {
  const container = document.createElement('div');
  mocks.config.headerAction(container, {
    overlay: document.createElement('div'),
    close: vi.fn(),
    isMasterEnabled: () => true,
  });
  return { container, clear: container.querySelector('#bh-clear-btn') as HTMLElement };
}

async function flushStatusLoad(): Promise<void> {
  expect(mocks.paintCallback).not.toBeNull();
  mocks.paintCallback!();
  mocks.paintCallback = null;
  await settle();
}

const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

const paint = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await settle();
};

function deferred(): { promise: Promise<undefined>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<undefined>(res => { resolve = () => res(undefined); });
  return { promise, resolve };
}

const toastMessages = () => mocks.showToast.mock.calls.map(([message]) => message as string);

describe('boot hash subpage', () => {
  beforeEach(() => {
    mocks.config = null;
    mocks.moduleDir = '/data/adb/modules/specter';
    mocks.exec.mockReset();
    mocks.exec.mockImplementation(async (command: string) => {
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) return { stdout: `${ACTIVE}\n`, stderr: '', code: 0 };
      if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: `${CACHED}\n`, stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });
    mocks.spawnCommand.mockReset();
    mocks.spawnCommand.mockImplementation(async (command: string) => {
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) return { stdout: `${ACTIVE}\n`, stderr: '', code: 0 };
      if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: `${CACHED}\n`, stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });
    mocks.cfgGet.mockReset();
    mocks.cfgGet.mockImplementation(async (key: string, fallback = '') => (key === 'custom_boot_hash' ? SAVED : fallback));
    mocks.cfgSet.mockReset();
    mocks.cfgSet.mockResolvedValue(undefined);
    mocks.showToast.mockClear();
    mocks.showLoadingToast.mockClear();
    mocks.updateToast.mockClear();
    mocks.afterPaint.mockClear();
    mocks.paintCallback = null;
  });

  it('renders every card as an sp-settings-row with no legacy list items', async () => {
    await openBootHashSubpage();
    const section = renderAll();

    // Skeleton status rows first; the reads have not started yet.
    expect(section.querySelectorAll('.sp-skeleton-row')).toHaveLength(2);
    expect(section.querySelector('#bh-active-val')).toBeNull();
    expect(mocks.exec).not.toHaveBeenCalled();

    await flushStatusLoad();

    const rows = section.querySelectorAll('sp-settings-row');
    expect(rows).toHaveLength(3);
    expect(section.querySelector('.list-item')).toBeNull();

    const input = section.querySelector('#bh-input') as HTMLInputElement;
    expect(input.value).toBe(SAVED);
    expect(section.querySelector('#bh-active-val')?.textContent).toBe(ACTIVE);
    expect(section.querySelector('#bh-cache-val')?.textContent).toBe(CACHED);
    expect(section.querySelector('#bh-clear-cache-btn')?.hasAttribute('disabled')).toBe(false);
  });

  it('uses the subpage config expected by the control page', async () => {
    await openBootHashSubpage();

    expect(mocks.config.id).toBe('boot-hash');
    expect(mocks.config.title).toBe('Boot Hash');
    expect(mocks.config.masterToggle).toMatchObject({
      key: 'toggle_boot_hash',
      defaultVal: '1',
      syncSwitchId: 'toggle-boot_hash',
    });
    expect(mocks.config.infoCard.icon).toBe('info');
    expect(mocks.config.groups[0].title).toBe('Custom Hash');
    expect(mocks.config.groups[1].title).toBe('Status');
  });

  it('escapes the saved custom hash before rendering it', async () => {
    mocks.cfgGet.mockResolvedValue('"><img src=x onerror=alert(1)>');

    await openBootHashSubpage();
    const section = renderAll();

    const input = section.querySelector('#bh-input') as HTMLInputElement;
    expect(input.value).toBe('"><img src=x onerror=alert(1)>');
    expect(section.querySelector('img')).toBeNull();
  });

  it('fills the custom hash with zeros from the zero button', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();

    (section.querySelector('#bh-zero-btn') as HTMLElement).click();
    expect((section.querySelector('#bh-input') as HTMLInputElement).value).toBe('0'.repeat(64));
  });

  it('pastes a trimmed hash from the clipboard', async () => {
    const readText = vi.fn(async () => '  abcd  ');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText },
    });

    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();

    (section.querySelector('#bh-paste-btn') as HTMLElement).click();
    await settle();

    expect(readText).toHaveBeenCalledTimes(1);
    expect((section.querySelector('#bh-input') as HTMLInputElement).value).toBe('abcd');
  });

  it('ignores an empty clipboard and warns when the clipboard read fails', async () => {
    const readText = vi.fn(async () => '');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const input = section.querySelector('#bh-input') as HTMLInputElement;

    (section.querySelector('#bh-paste-btn') as HTMLElement).click();
    await settle();
    expect(input.value).toBe(SAVED);

    readText.mockRejectedValue(new Error('denied'));
    (section.querySelector('#bh-paste-btn') as HTMLElement).click();
    await settle();
    expect(input.value).toBe(SAVED);
    expect(warn).toHaveBeenCalledWith('Clipboard read failed:', expect.any(Error));

    warn.mockRestore();
  });

  it('shows empty placeholders and disables clear when no status is stored', async () => {
    mocks.exec.mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    await openBootHashSubpage();
    const section = renderAll();
    await flushStatusLoad();

    expect(section.querySelector('#bh-active-val')?.textContent).toBe('None');
    expect(section.querySelector('#bh-cache-val')?.textContent).toBe('None');
    expect(section.querySelector('#bh-clear-cache-btn')?.hasAttribute('disabled')).toBe(true);
  });

  it('tolerates status read failures', async () => {
    mocks.exec.mockRejectedValue(new Error('bridge down'));

    await openBootHashSubpage();
    const section = renderAll();
    await flushStatusLoad();

    expect(section.querySelector('#bh-active-val')?.textContent).toBe('None');
    expect(section.querySelector('#bh-cache-val')?.textContent).toBe('None');
  });

  it('loads status even when the status cards were never mounted', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();

    expect(mocks.exec).toHaveBeenCalledTimes(2);
    expect(mocks.paintCallback).toBeNull();
  });

  it('clears the cached hash and disables the clear button', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();

    (section.querySelector('#bh-clear-cache-btn') as HTMLElement).click();
    await settle();

    expect(section.querySelector('#bh-cache-val')?.textContent).toBe('None');
    expect(section.querySelector('#bh-clear-cache-btn')?.hasAttribute('disabled')).toBe(true);
    expect(mocks.exec.mock.calls.some(([cmd]) => String(cmd).includes('--clear-cache'))).toBe(true);
    expect(toastMessages()).toContain(t('boot_hash_cache_cleared', 'Cache cleared'));
  });

  it('clears the cached hash without a module directory', async () => {
    mocks.moduleDir = null;

    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const callsBefore = mocks.exec.mock.calls.length;

    (section.querySelector('#bh-clear-cache-btn') as HTMLElement).click();
    await settle();

    expect(mocks.exec).toHaveBeenCalledTimes(callsBefore);
    expect(section.querySelector('#bh-cache-val')?.textContent).toBe('None');
    expect(section.querySelector('#bh-clear-cache-btn')?.hasAttribute('disabled')).toBe(true);
    expect(toastMessages()).toContain(t('boot_hash_cache_cleared', 'Cache cleared'));
  });

  it('trims a long hash field on save', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { fab } = mountFab();
    const input = section.querySelector('#bh-input') as HTMLInputElement;

    input.value = ` ${SAVED} `;
    fab.click();

    // The disabled FAB and loading toast paint before the shell work starts.
    expect(fab.hasAttribute('disabled')).toBe(true);
    expect(mocks.showLoadingToast).toHaveBeenCalledTimes(1);
    expect(mocks.spawnCommand).not.toHaveBeenCalled();

    await paint();

    expect(mocks.cfgSet).toHaveBeenCalledWith('custom_boot_hash', SAVED);
    expect(mocks.updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('boot_hash_saved', 'Saved'),
      expect.objectContaining({ icon: 'check_circle', type: 'success' }),
    );
  });

  it('clears the custom hash from the header action', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { clear } = mountHeader();

    mocks.exec.mockImplementation(async (command: string) => {
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) return { stdout: 'd4'.repeat(32), stderr: '', code: 0 };
      if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: `${'e5'.repeat(32)}\n`, stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });

    clear.click();
    await settle();

    expect(mocks.cfgSet).toHaveBeenCalledWith('custom_boot_hash', '');
    expect((section.querySelector('#bh-input') as HTMLInputElement).value).toBe('');
    expect(section.querySelector('#bh-active-val')?.textContent).toBe('d4'.repeat(32));
    expect(section.querySelector('#bh-cache-val')?.textContent).toBe('e5'.repeat(32));
    expect(section.querySelector('#bh-clear-cache-btn')?.hasAttribute('disabled')).toBe(false);
    expect(toastMessages()).toContain(t('boot_hash_cleared', 'Custom hash cleared'));
  });

  it('awaits the config write before refreshing from the header clear action', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { clear } = mountHeader();
    const gate = deferred();
    mocks.cfgSet.mockImplementation(() => gate.promise);

    clear.click();
    await settle();

    expect(mocks.cfgSet).toHaveBeenCalledWith('custom_boot_hash', '');
    expect(mocks.exec.mock.calls.some(([cmd]) => String(cmd).includes('--refresh'))).toBe(false);
    expect((section.querySelector('#bh-input') as HTMLInputElement).value).toBe(SAVED);

    gate.resolve();
    await settle();

    expect(mocks.exec.mock.calls.some(([cmd]) => String(cmd).includes('--refresh'))).toBe(true);
    expect((section.querySelector('#bh-input') as HTMLInputElement).value).toBe('');
    expect(toastMessages()).toContain(t('boot_hash_cleared', 'Custom hash cleared'));
  });

  it('shows an error and skips the refresh when the header config write fails', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { clear } = mountHeader();
    mocks.cfgSet.mockRejectedValue(new Error('config down'));

    clear.click();
    await settle();

    expect(mocks.showToast).toHaveBeenCalledWith(
      t('simple_toast_error', 'Failed'),
      expect.objectContaining({ icon: 'error', type: 'error' }),
    );
    expect(mocks.exec.mock.calls.some(([cmd]) => String(cmd).includes('--refresh'))).toBe(false);
    expect((section.querySelector('#bh-input') as HTMLInputElement).value).toBe(SAVED);
  });

  it('shows an error when the header clear refresh fails', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    renderAll();
    const { clear } = mountHeader();

    mocks.exec.mockImplementation(async (command: string) => {
      if (command.includes('--refresh')) throw new Error('refresh down');
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) return { stdout: `${ACTIVE}\n`, stderr: '', code: 0 };
      if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: `${CACHED}\n`, stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });

    clear.click();
    await settle();

    expect(mocks.cfgSet).toHaveBeenCalledWith('custom_boot_hash', '');
    expect(mocks.showToast).toHaveBeenCalledWith(
      t('simple_toast_error', 'Failed'),
      expect.objectContaining({ icon: 'error', type: 'error' }),
    );
    expect(toastMessages()).not.toContain(t('boot_hash_cleared', 'Custom hash cleared'));
  });

  it('disables clear from the header action when the refreshed cache is empty', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { clear } = mountHeader();

    mocks.exec.mockImplementation(async (command: string) => {
      if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: '', stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });

    clear.click();
    await settle();

    expect(section.querySelector('#bh-cache-val')?.textContent).toBe('None');
    expect(section.querySelector('#bh-clear-cache-btn')?.hasAttribute('disabled')).toBe(true);
  });

  it('keeps the previous status when header resetprop and cache reads fail', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { clear } = mountHeader();

    mocks.exec.mockImplementation(async (command: string) => {
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) throw new Error('resetprop down');
      if (command.startsWith('cat /data/adb/specter/boot_hash')) throw new Error('cat down');
      return { stdout: '', stderr: '', code: 0 };
    });

    clear.click();
    await settle();

    expect(section.querySelector('#bh-active-val')?.textContent).toBe(ACTIVE);
    expect(section.querySelector('#bh-cache-val')?.textContent).toBe(CACHED);
    expect(toastMessages()).toContain(t('boot_hash_cleared', 'Custom hash cleared'));
  });

  it('clears the custom hash from the header without a module directory', async () => {
    mocks.moduleDir = null;

    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { clear } = mountHeader();
    const callsBefore = mocks.exec.mock.calls.length;

    clear.click();
    await settle();

    expect(mocks.exec).toHaveBeenCalledTimes(callsBefore);
    expect(mocks.cfgSet).toHaveBeenCalledWith('custom_boot_hash', '');
    expect((section.querySelector('#bh-input') as HTMLInputElement).value).toBe('');
  });

  it('refreshes the status and re-enables the refresh button', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const refresh = section.querySelector('#bh-refresh-cache-btn') as HTMLElement;

    mocks.exec.mockImplementation(async (command: string) => {
      if (command.includes('--refresh')) return { stdout: '', stderr: '', code: 0 };
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) return { stdout: 'f6'.repeat(32), stderr: '', code: 0 };
      if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: 'a7'.repeat(32), stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });

    refresh.click();
    await settle();

    expect(section.querySelector('#bh-active-val')?.textContent).toBe('f6'.repeat(32));
    expect(section.querySelector('#bh-cache-val')?.textContent).toBe('a7'.repeat(32));
    expect(section.querySelector('#bh-clear-cache-btn')?.hasAttribute('disabled')).toBe(false);
    expect(refresh.hasAttribute('disabled')).toBe(false);
    expect(toastMessages()).toContain(t('boot_hash_refreshed', 'Refreshed'));
  });

  it('shows an error and re-enables refresh when the refresh command fails', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const refresh = section.querySelector('#bh-refresh-cache-btn') as HTMLElement;

    mocks.exec.mockImplementation(async (command: string) => {
      if (command.includes('--refresh')) throw new Error('refresh down');
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) return { stdout: `${ACTIVE}\n`, stderr: '', code: 0 };
      if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: `${CACHED}\n`, stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });

    refresh.click();
    await settle();

    expect(mocks.showToast).toHaveBeenCalledWith(
      t('simple_toast_error', 'Failed'),
      expect.objectContaining({ icon: 'error', type: 'error' }),
    );
    expect(toastMessages()).not.toContain(t('boot_hash_refreshed', 'Refreshed'));
    expect(refresh.hasAttribute('disabled')).toBe(false);
  });

  it('tolerates status read failures during refresh', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const refresh = section.querySelector('#bh-refresh-cache-btn') as HTMLElement;

    mocks.exec.mockImplementation(async (command: string) => {
      if (command.includes('--refresh')) return { stdout: '', stderr: '', code: 0 };
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) throw new Error('resetprop down');
      if (command.startsWith('cat /data/adb/specter/boot_hash')) throw new Error('cat down');
      return { stdout: '', stderr: '', code: 0 };
    });

    refresh.click();
    await settle();

    expect(section.querySelector('#bh-active-val')?.textContent).toBe(ACTIVE);
    expect(section.querySelector('#bh-cache-val')?.textContent).toBe(CACHED);
    expect(refresh.hasAttribute('disabled')).toBe(false);
    expect(toastMessages()).toContain(t('boot_hash_refreshed', 'Refreshed'));
  });

  it('rejects a non-hex custom hash without writing config', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { fab } = mountFab();

    (section.querySelector('#bh-input') as HTMLInputElement).value = 'not-a-hash';
    fab.click();
    await settle();

    expect(mocks.showToast).toHaveBeenCalledWith(
      t('boot_hash_invalid', 'Must be 64 hex characters'),
      expect.objectContaining({ icon: 'error', type: 'error' }),
    );
    expect(mocks.cfgSet).not.toHaveBeenCalledWith('custom_boot_hash', 'not-a-hash');
    expect(fab.hasAttribute('disabled')).toBe(false);
  });

  it('saves a lowercased custom hash and updates the status rows', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { fab, close } = mountFab();
    const upper = 'AB'.repeat(32);

    (section.querySelector('#bh-input') as HTMLInputElement).value = upper;
    mocks.spawnCommand.mockImplementation(async (command: string) => {
      if (command.startsWith('resetprop -n ro.boot.vbmeta.digest')) return { stdout: '', stderr: '', code: 0 };
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) return { stdout: `${ACTIVE}\n`, stderr: '', code: 0 };
      if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: `${CACHED}\n`, stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });

    fab.click();
    await paint();

    expect(mocks.cfgSet).toHaveBeenCalledWith('custom_boot_hash', upper.toLowerCase());
    expect(mocks.spawnCommand.mock.calls.some(([cmd]) => String(cmd).includes(`resetprop -n ro.boot.vbmeta.digest '${upper.toLowerCase()}'`))).toBe(true);
    expect(section.querySelector('#bh-active-val')?.textContent).toBe(ACTIVE);
    expect(section.querySelector('#bh-cache-val')?.textContent).toBe(CACHED);
    expect(section.querySelector('#bh-clear-cache-btn')?.hasAttribute('disabled')).toBe(false);
    expect(mocks.updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('boot_hash_saved', 'Saved'),
      expect.objectContaining({ icon: 'check_circle', type: 'success' }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(fab.hasAttribute('disabled')).toBe(false);
  });

  it('disables the cache clear button when a save finds an empty cache', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { fab } = mountFab();

    mocks.spawnCommand.mockImplementation(async (command: string) => {
      if (command.includes('resetprop -n ro.boot.vbmeta.digest')) return { stdout: '', stderr: '', code: 0 };
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) return { stdout: `${ACTIVE}\n`, stderr: '', code: 0 };
      if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: '', stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });

    (section.querySelector('#bh-input') as HTMLInputElement).value = ACTIVE;
    fab.click();
    await paint();

    expect(section.querySelector('#bh-cache-val')?.textContent).toBe('None');
    expect(section.querySelector('#bh-clear-cache-btn')?.hasAttribute('disabled')).toBe(true);
    expect(mocks.updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('boot_hash_saved', 'Saved'),
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('saves an empty hash by refreshing instead of writing a property', async () => {    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { fab, close } = mountFab();

    (section.querySelector('#bh-input') as HTMLInputElement).value = '   ';
    fab.click();
    await paint();

    const commands = mocks.spawnCommand.mock.calls.map(([cmd]) => String(cmd));
    expect(mocks.cfgSet).toHaveBeenCalledWith('custom_boot_hash', '');
    expect(commands.some(cmd => cmd.includes('--refresh'))).toBe(true);
    expect(commands.some(cmd => cmd.includes('resetprop -n'))).toBe(false);
    expect(mocks.updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('boot_hash_saved', 'Saved'),
      expect.objectContaining({ type: 'success' }),
    );
    expect(close).not.toHaveBeenCalled();
  });

  it('awaits the config write before refreshing an empty saved hash', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { fab, close } = mountFab();
    const gate = deferred();
    mocks.cfgSet.mockImplementation(() => gate.promise);

    (section.querySelector('#bh-input') as HTMLInputElement).value = '   ';
    fab.click();
    await paint();

    expect(mocks.cfgSet).toHaveBeenCalledWith('custom_boot_hash', '');
    expect(mocks.spawnCommand.mock.calls.some(([cmd]) => String(cmd).includes('--refresh'))).toBe(false);
    expect(close).not.toHaveBeenCalled();

    gate.resolve();
    await settle();

    expect(mocks.spawnCommand.mock.calls.some(([cmd]) => String(cmd).includes('--refresh'))).toBe(true);
    expect(mocks.updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('boot_hash_saved', 'Saved'),
      expect.objectContaining({ type: 'success' }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(fab.hasAttribute('disabled')).toBe(false);
  });

  it('shows an error and skips the refresh when saving the config fails', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { fab, close } = mountFab();
    mocks.cfgSet.mockRejectedValue(new Error('config down'));

    (section.querySelector('#bh-input') as HTMLInputElement).value = '   ';
    fab.click();
    await paint();

    expect(mocks.updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('simple_toast_error', 'Failed'),
      expect.objectContaining({ icon: 'error', type: 'error' }),
    );
    expect(mocks.spawnCommand.mock.calls.some(([cmd]) => String(cmd).includes('--refresh'))).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(fab.hasAttribute('disabled')).toBe(false);
  });

  it('saves without a module directory', async () => {
    mocks.moduleDir = null;

    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { fab, close } = mountFab();

    (section.querySelector('#bh-input') as HTMLInputElement).value = ACTIVE;
    fab.click();
    await paint();

    expect(mocks.cfgSet).toHaveBeenCalledWith('custom_boot_hash', ACTIVE);
    expect(mocks.spawnCommand).not.toHaveBeenCalled();
    expect(mocks.updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('boot_hash_saved', 'Saved'),
      expect.objectContaining({ type: 'success' }),
    );
    expect(close).not.toHaveBeenCalled();
  });

  it('still saves when status reads fail after writing the property', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { fab, close } = mountFab();

    mocks.spawnCommand.mockImplementation(async (command: string) => {
      if (command.startsWith('resetprop -n ro.boot.vbmeta.digest')) return { stdout: '', stderr: '', code: 0 };
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) throw new Error('resetprop down');
      if (command.startsWith('cat /data/adb/specter/boot_hash')) throw new Error('cat down');
      return { stdout: '', stderr: '', code: 0 };
    });

    (section.querySelector('#bh-input') as HTMLInputElement).value = ACTIVE;
    fab.click();
    await paint();

    expect(section.querySelector('#bh-active-val')?.textContent).toBe(ACTIVE);
    expect(section.querySelector('#bh-cache-val')?.textContent).toBe(CACHED);
    expect(mocks.updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('boot_hash_saved', 'Saved'),
      expect.objectContaining({ type: 'success' }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(fab.hasAttribute('disabled')).toBe(false);
  });

  it('reports a save failure and keeps the page open when the property write throws', async () => {
    await openBootHashSubpage();
    await flushStatusLoad();
    const section = renderAll();
    const { fab, close } = mountFab();

    mocks.spawnCommand.mockImplementation(async (command: string) => {
      if (command.includes('resetprop -n ro.boot.vbmeta.digest')) throw new Error('resetprop down');
      if (command.startsWith('resetprop ro.boot.vbmeta.digest')) return { stdout: `${ACTIVE}\n`, stderr: '', code: 0 };
      if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: `${CACHED}\n`, stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });

    (section.querySelector('#bh-input') as HTMLInputElement).value = ACTIVE;
    fab.click();

    // The loading toast is painted before the failed shell write.
    expect(mocks.showLoadingToast).toHaveBeenCalledTimes(1);
    expect(mocks.spawnCommand).not.toHaveBeenCalled();

    await paint();

    expect(mocks.updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('simple_toast_error', 'Failed'),
      expect.objectContaining({ icon: 'error', type: 'error' }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(fab.hasAttribute('disabled')).toBe(false);
  });
});
