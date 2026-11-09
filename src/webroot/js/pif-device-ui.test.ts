import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  cfg: new Map<string, string>(),
  subpageConfig: null as unknown,
  fileBrowserCallback: null as null | ((path: string) => void),
  confirmResult: true,
  dataDir: '/data/adb/specter' as string | null,
}));

const {
  exec, cfgGet, cfgSet, openSubPage, openFileBrowser,
  showConfirm, showToast, showLoadingToast, updateToast, refreshPifChooseDesc,
} = vi.hoisted(() => {
  const showToast = vi.fn();
  return {
    exec: vi.fn(),
    cfgGet: vi.fn(async (key: string, def = '') => store.cfg.get(key) ?? def),
    cfgSet: vi.fn(async (key: string, value: string) => {
      store.cfg.set(key, value);
    }),
    openSubPage: vi.fn(async (config: unknown) => {
      store.subpageConfig = config;
      return {
        overlay: document.createElement('div'),
        close: vi.fn(),
        isMasterEnabled: () => true,
      };
    }),
    openFileBrowser: vi.fn((cb: (path: string) => void) => {
      store.fileBrowserCallback = cb;
    }),
    showConfirm: vi.fn(async () => store.confirmResult),
    showToast,
    showLoadingToast: vi.fn(() => document.createElement('div')),
    updateToast: vi.fn((_toast: HTMLElement, message: string, options?: unknown) => {
      showToast(message, options);
    }),
    refreshPifChooseDesc: vi.fn(async () => {}),
  };
});

vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils.js')>();
  return {
    ...actual,
    // Run the paint callback on the next tick so loads still start
    // strictly after the page render.
    afterPaint: (fn: () => void) => { setTimeout(fn, 0); },
  };
});
vi.mock('./bridge.js', () => ({ exec, getDataDir: () => store.dataDir }));
vi.mock('./cfg.js', () => ({ cfgGet, cfgSet }));
vi.mock('./subpage.js', () => ({ openSubPage }));
vi.mock('./file-browser.js', () => ({ openFileBrowser }));
vi.mock('./dialog.js', () => ({ showConfirm }));
vi.mock('./toast.js', () => ({ showToast, showLoadingToast, updateToast }));
vi.mock('./pif-choose-desc.js', () => ({ refreshPifChooseDesc }));
vi.mock('./menu-utils.js', () => ({ closeMenu: vi.fn(), wireMenuTrigger: vi.fn() }));
vi.mock('@material/web/button/filled-button.js', () => ({}));
vi.mock('@material/web/button/text-button.js', () => ({}));
vi.mock('@material/web/iconbutton/icon-button.js', () => ({}));
vi.mock('@material/web/icon/icon.js', () => ({}));
vi.mock('@material/web/radio/radio.js', () => ({}));
vi.mock('@material/web/checkbox/checkbox.js', () => ({}));
vi.mock('@material/web/menu/menu.js', () => ({}));
vi.mock('@material/web/menu/menu-item.js', () => ({}));
vi.mock('@material/web/textfield/outlined-text-field.js', () => ({}));
vi.mock('@material/web/fab/fab.js', () => ({}));

import { openPifDeviceSubpage, wirePifDevice } from './pif-device-ui.js';
import './ui/sp-settings-row.js';
import './ui/sp-settings-section.js';

// The Material radio/checkbox modules are mocked out above, so register
// minimal stand-ins that reflect value/checked the way the real Lit
// components do — the chooser reads radio.value and writes .checked.
class StubCheckable extends HTMLElement {
  get value(): string {
    return this.getAttribute('value') ?? '';
  }
  set value(v: string) {
    this.setAttribute('value', v);
  }
  get checked(): boolean {
    return this.hasAttribute('checked');
  }
  set checked(v: boolean) {
    this.toggleAttribute('checked', !!v);
  }
}
class StubRadio extends StubCheckable {}
class StubCheckbox extends StubCheckable {}
if (!customElements.get('md-radio')) customElements.define('md-radio', StubRadio);
if (!customElements.get('md-checkbox')) customElements.define('md-checkbox', StubCheckbox);

const CANARY = [
  { model: 'Pixel 10 Pro', product: 'frankel' },
  { model: 'Pixel 10', product: 'blazer' },
  { model: 'Pixel 9', product: 'tokay' },
  { model: 'Broken Entry' },
];

const IMPORTED_PROP = 'MODEL=Imported One\nFINGERPRINT=google/imported/imported:16/BP/123:user/release-keys\n';
const NEW_PROP = 'MODEL=New Device\nFINGERPRINT=google/new/new:16/BP/124:user/release-keys\n';

function execImpl(cmd: string) {
  if (cmd.includes('ls -1') && cmd.includes('pif_imported')) {
    return { stdout: '/data/adb/specter/pif_imported/abc123.prop\n', stderr: '', code: 0 };
  }
  if (cmd.includes('cat') && cmd.includes('abc123.prop')) {
    return { stdout: IMPORTED_PROP, stderr: '', code: 0 };
  }
  if (cmd.includes('cat') && cmd.includes('new.prop')) {
    return { stdout: NEW_PROP, stderr: '', code: 0 };
  }
  if (cmd.includes('cat') && cmd.includes('bad.prop')) {
    return { stdout: 'random garbage without props', stderr: '', code: 0 };
  }
  return { stdout: '', stderr: '', code: 0 };
}

interface PifConfig {
  headerAction: (container: HTMLElement, instance: unknown) => void;
  fab: (container: HTMLElement) => void;
  groups: { items: { render: (host: HTMLElement) => void }[] }[];
}

const click = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));

async function openAndRender() {
  await openPifDeviceSubpage();
  const config = store.subpageConfig as PifConfig;
  const host = document.createElement('div');
  document.body.appendChild(host);
  config.groups[0]!.items[0]!.render(host);
  return { config, host };
}

const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.pif-device-row')];
const rowByProduct = (host: HTMLElement, product: string) =>
  rows(host).find(r => r.dataset.product === product);

function makeInstance(withChrome = false) {
  const overlay = document.createElement('div');
  if (withChrome) {
    overlay.innerHTML = `
      <h1 class="subpage-title">Choose PIF Device</h1>
      <p class="subpage-top-desc">Pick which Pixel Canary models Specter may fetch</p>
      <button id="subpage-back">Back</button>
    `;
  }
  document.body.appendChild(overlay);
  return { overlay, close: vi.fn(), isMasterEnabled: () => true };
}

function openHeader(config: PifConfig, withChrome = false) {
  const headerHost = document.createElement('div');
  document.body.appendChild(headerHost);
  const instance = makeInstance(withChrome);
  config.headerAction(headerHost, instance);
  return { headerHost, instance };
}

function triggerImport(config: PifConfig, path: string) {
  const { headerHost } = openHeader(config);
  click(headerHost.querySelector('#pif-menu-import')!);
  store.fileBrowserCallback!(path);
}

describe('pif device chooser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    store.cfg.clear();
    store.subpageConfig = null;
    store.fileBrowserCallback = null;
    store.confirmResult = true;
    store.dataDir = '/data/adb/specter';
    exec.mockReset();
    exec.mockImplementation(async (cmd: string) => execImpl(cmd));
    cfgGet.mockClear();
    cfgSet.mockClear();
    openSubPage.mockClear();
    openFileBrowser.mockClear();
    showConfirm.mockClear();
    showToast.mockClear();
    showLoadingToast.mockClear();
    updateToast.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => CANARY,
    })));
  });

  it('lists Random, imported and canary devices, skipping malformed entries', async () => {
    const { host } = await openAndRender();

    expect(rowByProduct(host, '')).toBeDefined(); // Random Canary row
    expect(rowByProduct(host, 'imported:abc123')).toBeDefined();
    expect(rowByProduct(host, 'frankel')).toBeDefined();
    expect(rowByProduct(host, 'blazer')).toBeDefined();
    expect(rowByProduct(host, 'tokay')).toBeDefined();
    expect(host.textContent).toContain('Pixel Canary (3)');
    expect(host.textContent).toContain('Imported (1)');
    // Random is the default selection when nothing is saved
    const randomRadio = rowByProduct(host, '')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    expect(randomRadio.checked).toBe(true);
  });

  it('restores the saved preferred device as the checked radio', async () => {
    store.cfg.set('pif_preferred_devices', 'Pixel 9|tokay');
    const { host } = await openAndRender();

    const radio = rowByProduct(host, 'tokay')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    expect(radio.checked).toBe(true);
    const randomRadio = rowByProduct(host, '')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    expect(randomRadio.checked).toBe(false);
  });

  it('selects a device by row activation and persists it on Apply', async () => {
    const { config, host } = await openAndRender();

    rowByProduct(host, 'frankel')!.dispatchEvent(new Event('sp-activate', { bubbles: true }));
    const radio = rowByProduct(host, 'frankel')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    expect(radio.checked).toBe(true);

    const fabHost = document.createElement('div');
    config.fab(fabHost);
    const apply = fabHost.querySelector('#pif-apply') as HTMLElement & { disabled: boolean };
    click(apply);
    expect(apply.disabled).toBe(true);
    expect(showLoadingToast).toHaveBeenCalledTimes(1);
    expect(updateToast).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(store.cfg.get('pif_preferred_devices')).toBe('Pixel 10 Pro|frankel');
    });
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Pixel 10 Pro applied', expect.objectContaining({ type: 'success' }));
    });
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(), 'Pixel 10 Pro applied', expect.objectContaining({ type: 'success' }));
    expect(apply.disabled).toBe(false);
  });

  it('filters devices by search text and clears the search', async () => {
    const { host } = await openAndRender();
    const search = host.querySelector('#pif-search') as unknown as HTMLElement & { value: string };

    search.value = 'frankel';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(rows(host)).toHaveLength(1);
    expect(rowByProduct(host, 'frankel')).toBeDefined();

    search.value = 'zzzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(host.querySelector('.pif-device-empty')).not.toBeNull();
    expect(host.textContent).toContain('No devices matching "zzzz"');

    (host.querySelector('#pif-search-clear') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(rows(host).length).toBeGreaterThan(1);
  });

  it('blacklist mode toggles devices and Apply saves the encoded blacklist', async () => {
    const { config, host } = await openAndRender();

    const headerHost = document.createElement('div');
    const instance = { overlay: document.createElement('div'), close: vi.fn(), isMasterEnabled: () => true };
    config.headerAction(headerHost, instance);
    click(headerHost.querySelector('#pif-menu-mode')!);

    const blRows = () => [...host.querySelectorAll<HTMLElement>('.pif-blacklist-row')];
    expect(blRows().length).toBe(4); // imported + 3 canary
    const blazerRow = blRows().find(r => r.dataset.product === 'blazer')!;
    const checkbox = blazerRow.querySelector('md-checkbox') as HTMLElement & { checked: boolean };
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      expect(blRows().find(r => r.dataset.product === 'blazer')!
        .classList.contains('pif-blacklist-row--excluded')).toBe(true);
    });

    const fabHost = document.createElement('div');
    config.fab(fabHost);
    const apply = fabHost.querySelector('#pif-apply') as HTMLElement & { disabled: boolean };
    click(apply);
    expect(apply.disabled).toBe(true);
    expect(showLoadingToast).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(store.cfg.get('pif_blacklist')).toBe('Pixel 10|blazer');
    });
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Blacklist saved (1 excluded)', expect.objectContaining({ type: 'success' }));
    });
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(), 'Blacklist saved (1 excluded)', expect.objectContaining({ type: 'success' }));
    expect(apply.disabled).toBe(false);
  });

  it('reset in target mode returns the selection to Random', async () => {
    store.cfg.set('pif_preferred_devices', 'Pixel 9|tokay');
    const { config, host } = await openAndRender();

    const headerHost = document.createElement('div');
    const instance = { overlay: document.createElement('div'), close: vi.fn(), isMasterEnabled: () => true };
    config.headerAction(headerHost, instance);
    click(headerHost.querySelector('#pif-menu-reset')!);

    const randomRadio = rowByProduct(host, '')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    expect(randomRadio.checked).toBe(true);
  });

  it('deletes an imported device after confirmation', async () => {
    const { host } = await openAndRender();
    const trash = rowByProduct(host, 'imported:abc123')!.querySelector('.pif-dev-trash')!;

    click(trash);
    await vi.waitFor(() => {
      expect(rowByProduct(host, 'imported:abc123')).toBeUndefined();
    });
    expect(showConfirm).toHaveBeenCalled();
    expect(exec.mock.calls.some(([cmd]) => String(cmd).includes('rm -f') && String(cmd).includes('abc123.prop'))).toBe(true);
  });

  it('keeps the imported device when deletion is not confirmed', async () => {
    store.confirmResult = false;
    const { host } = await openAndRender();
    const trash = rowByProduct(host, 'imported:abc123')!.querySelector('.pif-dev-trash')!;

    click(trash);
    await new Promise(r => setTimeout(r, 20));
    expect(rowByProduct(host, 'imported:abc123')).toBeDefined();
    expect(exec.mock.calls.some(([cmd]) => String(cmd).includes('rm -f'))).toBe(false);
  });

  it('imports a .prop file through the file browser and selects it', async () => {
    const { config, host } = await openAndRender();

    const headerHost = document.createElement('div');
    const instance = { overlay: document.createElement('div'), close: vi.fn(), isMasterEnabled: () => true };
    config.headerAction(headerHost, instance);
    click(headerHost.querySelector('#pif-menu-import')!);
    expect(openFileBrowser).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ extensions: ['.prop'] }));

    store.fileBrowserCallback!('/sdcard/new.prop');
    await vi.waitFor(() => {
      expect(host.querySelector('.pif-device-row[data-product^="imported:"]')).not.toBeNull();
      expect(host.textContent).toContain('New Device');
    });
    expect(exec.mock.calls.some(([cmd]) => String(cmd).includes('cp ') && String(cmd).includes('new.prop'))).toBe(true);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('New Device imported'), expect.objectContaining({ type: 'info' }));
  });

  it('refuses an invalid import file when the user declines the warning', async () => {
    const { config } = await openAndRender();
    store.confirmResult = false;

    const headerHost = document.createElement('div');
    const instance = { overlay: document.createElement('div'), close: vi.fn(), isMasterEnabled: () => true };
    config.headerAction(headerHost, instance);
    click(headerHost.querySelector('#pif-menu-import')!);

    store.fileBrowserCallback!('/sdcard/bad.prop');
    await new Promise(r => setTimeout(r, 20));
    expect(showConfirm).toHaveBeenCalledWith(
      'Invalid PIF file', expect.stringContaining('missing FINGERPRINT or MODEL'));
    expect(exec.mock.calls.some(([cmd]) => String(cmd).includes('cp '))).toBe(false);
  });

  it('wirePifDevice reveals the row and opens the chooser on click', async () => {
    const row = document.createElement('div');
    row.id = 'pif-choose-device';
    row.hidden = true;
    document.body.appendChild(row);

    await wirePifDevice();
    expect(row.hidden).toBe(false);

    click(row);
    await vi.waitFor(() => expect(openSubPage).toHaveBeenCalled());
  });

  it('wirePifDevice is a no-op without the row and opens on Enter or Space', async () => {
    await expect(wirePifDevice()).resolves.toBeUndefined();

    const row = document.createElement('div');
    row.id = 'pif-choose-device';
    row.hidden = true;
    document.body.appendChild(row);
    await wirePifDevice();
    expect(row.hidden).toBe(false);

    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(openSubPage).toHaveBeenCalledTimes(1);

    row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(openSubPage).toHaveBeenCalledTimes(2);

    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }));
    expect(openSubPage).toHaveBeenCalledTimes(2);
  });

  it('parses legacy preferred and blacklist entries', async () => {
    store.cfg.set('pif_preferred_devices', 'Not a device\nPixel 9|tokay\nEmpty|');
    store.cfg.set('pif_blacklist', 'legacyprod\nLabel|withpipe\nEmpty|');
    const { host } = await openAndRender();

    const radio = rowByProduct(host, 'tokay')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    expect(radio.checked).toBe(true);
    expect(host.textContent).toContain('2 excluded by blacklist');
  });

  it('loads imported devices from the data-dir fallback, skipping empty ids and missing MODEL', async () => {
    store.dataDir = null;
    exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('ls -1')) {
        return {
          stdout: '/data/adb/specter/pif_imported/.prop\n/data/adb/specter/pif_imported/onlyfp.prop\n',
          stderr: '',
          code: 0,
        };
      }
      if (cmd.includes('cat') && cmd.includes('onlyfp.prop')) {
        return { stdout: 'FINGERPRINT=google/x/y:16/BP/1:user/release-keys', stderr: '', code: 0 };
      }
      return { stdout: '', stderr: '', code: 0 };
    });

    const { host } = await openAndRender();
    expect(exec.mock.calls[0]![0]).toContain('/data/adb/specter/pif_imported');
    expect(rowByProduct(host, 'imported:onlyfp')).toBeDefined();
    expect(host.textContent).toContain('onlyfp');
  });

  it('handles a missing imported directory', async () => {
    exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('ls -1')) return { stdout: undefined as unknown as string, stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    });

    const { host } = await openAndRender();
    expect(host.textContent).toContain('Pixel Canary');
    expect(host.textContent).not.toContain('Imported (');
  });

  it('selects through a radio change event', async () => {
    const { config, host } = await openAndRender();
    const radio = rowByProduct(host, 'frankel')!.querySelector('md-radio') as HTMLElement & {
      checked: boolean;
    };

    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));

    const fabHost = document.createElement('div');
    config.fab(fabHost);
    click(fabHost.querySelector('#pif-apply')!);
    await vi.waitFor(() => {
      expect(store.cfg.get('pif_preferred_devices')).toBe('Pixel 10 Pro|frankel');
    });
  });

  it('ignores row activation that originates on a radio or a trash button', async () => {
    const { host } = await openAndRender();
    const frankel = rowByProduct(host, 'frankel')!;
    const radio = frankel.querySelector('md-radio') as HTMLElement & { checked: boolean };
    radio.dispatchEvent(new Event('sp-activate', { bubbles: true }));
    expect(radio.checked).toBe(false);

    const trash = rowByProduct(host, 'imported:abc123')!.querySelector('.pif-dev-trash')!;
    trash.dispatchEvent(new Event('sp-activate', { bubbles: true }));
    expect(showConfirm).not.toHaveBeenCalled();
    expect(rowByProduct(host, 'imported:abc123')).toBeDefined();
  });

  it('edits the blacklist from rows, ignores checkbox activation, clears and applies all-allowed', async () => {
    const { config, host } = await openAndRender();
    const { headerHost, instance } = openHeader(config, true);
    click(headerHost.querySelector('#pif-menu-mode')!);

    const title = instance.overlay.querySelector('.subpage-title') as HTMLElement;
    const desc = instance.overlay.querySelector('.subpage-top-desc') as HTMLElement;
    expect(title.textContent).toBe('Blacklist');
    expect(desc.textContent).toContain('never be picked');
    expect(headerHost.querySelector('#pif-menu-mode-text')!.textContent).toBe('Back to targeting');
    expect(headerHost.querySelector('#pif-menu-reset-text')!.textContent).toBe('Clear blacklist');

    const blRows = () => [...host.querySelectorAll<HTMLElement>('.pif-blacklist-row')];
    const rowFor = (product: string) => blRows().find(r => r.dataset.product === product)!;

    rowFor('blazer').dispatchEvent(new Event('sp-activate', { bubbles: true }));
    expect(rowFor('blazer').classList.contains('pif-blacklist-row--excluded')).toBe(true);
    expect(host.textContent).toContain('Pixel Canary (1 excluded)');
    expect(headerHost.querySelector('#pif-menu-reset-text')!.textContent).toBe('Clear blacklist (1)');

    // Activation coming from the checkbox itself must not double toggle.
    rowFor('blazer').querySelector('md-checkbox')!
      .dispatchEvent(new Event('sp-activate', { bubbles: true }));
    expect(rowFor('blazer').classList.contains('pif-blacklist-row--excluded')).toBe(true);

    rowFor('blazer').dispatchEvent(new Event('sp-activate', { bubbles: true }));
    expect(rowFor('blazer').classList.contains('pif-blacklist-row--excluded')).toBe(false);

    rowFor('blazer').dispatchEvent(new Event('sp-activate', { bubbles: true }));
    rowFor('tokay').dispatchEvent(new Event('sp-activate', { bubbles: true }));
    click(headerHost.querySelector('#pif-menu-reset')!);
    expect(blRows().some(r => r.classList.contains('pif-blacklist-row--excluded'))).toBe(false);
    expect(headerHost.querySelector('#pif-menu-reset-text')!.textContent).toBe('Clear blacklist');

    // Clearing an already empty blacklist is a no-op.
    click(headerHost.querySelector('#pif-menu-reset')!);

    const fabHost = document.createElement('div');
    config.fab(fabHost);
    click(fabHost.querySelector('#pif-apply')!);
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        'Blacklist saved (all allowed)', expect.objectContaining({ type: 'success' }));
    });

    click(headerHost.querySelector('#pif-menu-mode')!);
    expect(title.textContent).toBe('Choose PIF Device');
    expect(desc.textContent).toContain('Pick which Pixel Canary');
    expect(headerHost.querySelector('#pif-menu-mode-text')!.textContent).toBe('Edit blacklist');
    expect(headerHost.querySelector('#pif-menu-reset-text')!.textContent).toBe('Reset to Random');
  });

  it('returns to target mode from the back button while editing the blacklist', async () => {
    const { config } = await openAndRender();
    const { headerHost, instance } = openHeader(config, true);
    click(headerHost.querySelector('#pif-menu-mode')!);
    expect(instance.overlay.querySelector('.subpage-title')!.textContent).toBe('Blacklist');

    const back = instance.overlay.querySelector('#subpage-back')!;
    click(back);
    expect(instance.overlay.querySelector('.subpage-title')!.textContent).toBe('Choose PIF Device');

    // In target mode the back button is left alone.
    click(back);
    expect(instance.overlay.querySelector('.subpage-title')!.textContent).toBe('Choose PIF Device');
  });

  it('deletes a selected imported device and removes it from the blacklist', async () => {
    store.cfg.set('pif_blacklist', 'imported:abc123');
    const { host } = await openAndRender();

    rowByProduct(host, 'imported:abc123')!.dispatchEvent(new Event('sp-activate', { bubbles: true }));
    const trash = rowByProduct(host, 'imported:abc123')!.querySelector('.pif-dev-trash')!;
    click(trash);

    await vi.waitFor(() => {
      expect(rowByProduct(host, 'imported:abc123')).toBeUndefined();
    });
    expect(store.cfg.get('pif_blacklist')).toBe('');
    const randomRadio = rowByProduct(host, '')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    expect(randomRadio.checked).toBe(true);
  });

  it('ignores a trash button without an id', async () => {
    const { host } = await openAndRender();
    const trash = rowByProduct(host, 'imported:abc123')!.querySelector('.pif-dev-trash') as HTMLElement;
    delete trash.dataset.id;

    click(trash);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(showConfirm).not.toHaveBeenCalled();
    expect(rowByProduct(host, 'imported:abc123')).toBeDefined();
  });

  it('imports an invalid file after confirmation, using the file name as the model', async () => {
    const { config, host } = await openAndRender();
    triggerImport(config, '/sdcard/bad.prop');

    await vi.waitFor(() => {
      expect(host.textContent).toContain('bad');
    });
    expect(showConfirm).toHaveBeenCalledWith(
      'Invalid PIF file', expect.stringContaining('missing FINGERPRINT or MODEL'));
    expect(exec.mock.calls.some(([cmd]) => String(cmd).includes('cp ') && String(cmd).includes('bad.prop'))).toBe(true);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('bad imported'), expect.objectContaining({ type: 'info' }));
  });

  it('imports an invalid file that still has a MODEL value', async () => {
    exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('cat') && cmd.includes('modelonly.prop')) {
        return { stdout: 'MODEL=Only Model\n', stderr: '', code: 0 };
      }
      return execImpl(cmd);
    });
    const { config, host } = await openAndRender();
    triggerImport(config, '/sdcard/modelonly.prop');

    await vi.waitFor(() => {
      expect(host.textContent).toContain('Only Model');
    });
    expect(showConfirm).toHaveBeenCalled();
    expect(exec.mock.calls.some(([cmd]) => String(cmd).includes('cp '))).toBe(true);
  });

  it('imports an empty file after confirmation, hashing the path for the id', async () => {
    const { config, host } = await openAndRender();
    triggerImport(config, '/sdcard/empty.prop');

    await vi.waitFor(() => {
      expect(host.textContent).toContain('empty');
    });
    expect(showConfirm).toHaveBeenCalledWith(
      'Invalid PIF file', expect.stringContaining('missing FINGERPRINT or MODEL'));
    expect(host.querySelector('.pif-device-row[data-product^="imported:"]')).not.toBeNull();
  });

  it('reports a failed copy and does not add the imported device', async () => {
    exec.mockImplementation(async (cmd: string) => {
      if (cmd.includes('cp ') && cmd.includes('new.prop')) {
        return { stdout: '', stderr: 'disk full', code: 1 };
      }
      return execImpl(cmd);
    });
    const { config, host } = await openAndRender();
    triggerImport(config, '/sdcard/new.prop');

    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        'Failed to import file', expect.objectContaining({ type: 'error' }));
    });
    expect(host.textContent).not.toContain('New Device');
  });

  it('applies Random Canary by default and clears saved preference keys', async () => {
    store.cfg.set('pif_preferred_devices', 'Pixel 9|tokay');
    store.cfg.set('pif_preferred_product', 'tokay');
    store.cfg.set('pif_preferred_model', 'Pixel 9');
    const { config, host } = await openAndRender();

    rowByProduct(host, '')!.dispatchEvent(new Event('sp-activate', { bubbles: true }));
    const fabHost = document.createElement('div');
    config.fab(fabHost);
    click(fabHost.querySelector('#pif-apply')!);

    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        'Random Canary (Default) applied', expect.objectContaining({ type: 'success' }));
    });
    expect(store.cfg.get('pif_preferred_devices')).toBe('');
    expect(store.cfg.get('pif_preferred_product')).toBe('');
    expect(store.cfg.get('pif_preferred_model')).toBe('');
  });

  it('reports an apply failure and re-enables the button', async () => {
    const { config } = await openAndRender();
    cfgSet.mockImplementationOnce(async () => {
      throw new Error('disk full');
    });
    const fabHost = document.createElement('div');
    config.fab(fabHost);
    const apply = fabHost.querySelector('#pif-apply') as HTMLElement & { disabled: boolean };
    click(apply);

    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to apply: Error: disk full'),
        expect.objectContaining({ type: 'error' }));
    });
    expect(showLoadingToast).toHaveBeenCalledTimes(1);
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Failed to apply: Error: disk full'),
      expect.objectContaining({ type: 'error' }),
    );
    expect(apply.disabled).toBe(false);
  });

  it('ignores Apply while the button is disabled', async () => {
    const { config } = await openAndRender();
    const fabHost = document.createElement('div');
    config.fab(fabHost);
    const apply = fabHost.querySelector('#pif-apply') as HTMLElement & { disabled: boolean };
    apply.disabled = true;

    click(apply);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(cfgSet).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('keeps a selection made before the saved state finishes loading', async () => {
    store.cfg.set('pif_preferred_devices', 'Pixel 9|tokay');
    const opened = openPifDeviceSubpage();
    const config = store.subpageConfig as PifConfig;
    expect(config).not.toBeNull();

    const host = document.createElement('div');
    document.body.appendChild(host);
    config.groups[0]!.items[0]!.render(host);

    const preLoadRows = rows(host);
    const chosen = rowByProduct(host, 'panther_beta') ?? preLoadRows[1]!;
    chosen.dispatchEvent(new Event('sp-activate', { bubbles: true }));

    await opened;

    const randomRadio = rowByProduct(host, '')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    expect(randomRadio.checked).toBe(false);
    const tokayRadio = rowByProduct(host, 'tokay')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    expect(tokayRadio.checked).toBe(false);
  });

  it('applies the saved blacklist even when a target was selected before loading finishes', async () => {
    store.cfg.set('pif_blacklist', 'Pixel 9|tokay');
    const opened = openPifDeviceSubpage();
    const config = store.subpageConfig as PifConfig;
    const host = document.createElement('div');
    document.body.appendChild(host);
    config.groups[0]!.items[0]!.render(host);

    rowByProduct(host, 'panther_beta')!.dispatchEvent(new Event('sp-activate', { bubbles: true }));
    await opened;

    const fabHost = document.createElement('div');
    config.fab(fabHost);
    click(fabHost.querySelector('#pif-apply')!);

    await vi.waitFor(() => {
      expect(store.cfg.get('pif_blacklist')).toBe('Pixel 9|tokay');
    });
  });

  it('applies the saved blacklist even when a file is imported before loading finishes', async () => {
    store.cfg.set('pif_blacklist', 'Pixel 9|tokay');
    const opened = openPifDeviceSubpage();
    const config = store.subpageConfig as PifConfig;
    const host = document.createElement('div');
    document.body.appendChild(host);
    config.groups[0]!.items[0]!.render(host);

    triggerImport(config, '/sdcard/new.prop');
    await opened;

    expect(host.textContent).toContain('New Device');

    const fabHost = document.createElement('div');
    config.fab(fabHost);
    click(fabHost.querySelector('#pif-apply')!);

    await vi.waitFor(() => {
      expect(store.cfg.get('pif_blacklist')).toBe('Pixel 9|tokay');
    });
  });

  it('keeps explicit blacklist edits made before the saved blacklist loads', async () => {
    store.cfg.set('pif_blacklist', 'Pixel 9|tokay');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => [...CANARY, { model: 'Pixel 6', product: 'oriole_beta' }],
    })));
    vi.resetModules();
    const mod = await import('./pif-device-ui.js');
    const opened = mod.openPifDeviceSubpage();
    const config = store.subpageConfig as PifConfig;
    const host = document.createElement('div');
    document.body.appendChild(host);
    config.groups[0]!.items[0]!.render(host);
    const { headerHost } = openHeader(config);
    click(headerHost.querySelector('#pif-menu-mode')!);

    const orioleRow = [...host.querySelectorAll<HTMLElement>('.pif-blacklist-row')]
      .find(row => row.dataset.product === 'oriole_beta')!;
    orioleRow.dispatchEvent(new Event('sp-activate', { bubbles: true }));

    await opened;

    const fabHost = document.createElement('div');
    config.fab(fabHost);
    click(fabHost.querySelector('#pif-apply')!);

    await vi.waitFor(() => {
      expect(store.cfg.get('pif_blacklist')).toBe('Pixel 6|oriole_beta');
    });
  });

  it('persists a fallback device that is absent from the live list', async () => {
    const opened = openPifDeviceSubpage();
    const config = store.subpageConfig as PifConfig;
    const host = document.createElement('div');
    document.body.appendChild(host);
    config.groups[0]!.items[0]!.render(host);

    rowByProduct(host, 'oriole_beta')!.dispatchEvent(new Event('sp-activate', { bubbles: true }));
    await opened;
    expect(rowByProduct(host, 'oriole_beta')).toBeUndefined();

    const fabHost = document.createElement('div');
    config.fab(fabHost);
    click(fabHost.querySelector('#pif-apply')!);

    await vi.waitFor(() => {
      expect(store.cfg.get('pif_preferred_devices')).toBe('Pixel 6|oriole_beta');
    });
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Pixel 6 applied', expect.objectContaining({ type: 'success' }));
    });
  });

  it('falls back to the built-in canary list when every mirror fails', async () => {
    vi.resetModules();
    const fetchMock = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('fastly')) return { ok: false, json: async () => ({}) };
      if (u.includes('raw.githubusercontent')) return { ok: true, json: async () => ({ not: 'an array' }) };
      return { ok: true, json: async () => [{ model: 'No Product' }] };
    });
    vi.stubGlobal('fetch', fetchMock);

    const mod = await import('./pif-device-ui.js');
    const opened = mod.openPifDeviceSubpage();
    const config = store.subpageConfig as PifConfig;
    const host = document.createElement('div');
    document.body.appendChild(host);
    config.groups[0]!.items[0]!.render(host);
    await opened;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rowByProduct(host, 'oriole_beta')).toBeDefined();
    expect(host.textContent).toContain('Pixel 6');
  });

  it('shows the blacklist empty state for a search with no matches', async () => {
    const { config, host } = await openAndRender();
    const { headerHost } = openHeader(config);
    click(headerHost.querySelector('#pif-menu-mode')!);

    const search = host.querySelector('#pif-search') as unknown as HTMLElement & { value: string };
    search.value = 'zzzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    expect(host.querySelector('.pif-device-empty')).not.toBeNull();
    expect(host.textContent).toContain('No devices matching "zzzz"');
  });

  it('greys out blacklisted devices while Random is active', async () => {
    store.cfg.set('pif_blacklist', 'Pixel 6|tokay');
    const { host } = await openAndRender();

    expect(rowByProduct(host, 'tokay')!.classList.contains('pif-device-row--blacklisted')).toBe(true);
    expect(rowByProduct(host, '')!.textContent).toContain('1 excluded by blacklist');
  });

  it('matches the Random row by its label and hides the clear button after clearing', async () => {
    const { host } = await openAndRender();
    const search = host.querySelector('#pif-search') as unknown as HTMLElement & { value: string };
    const clear = host.querySelector('#pif-search-clear') as HTMLElement;

    search.value = 'random';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(rows(host)).toHaveLength(1);
    expect(rowByProduct(host, '')).toBeDefined();
    expect(clear.hasAttribute('hidden')).toBe(false);

    click(clear);
    expect(clear.style.display).toBe('none');
    expect(rows(host).length).toBeGreaterThan(1);
  });
});
