import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  cfg: new Map<string, string>(),
  subpageConfig: null as unknown,
  fileBrowserCallback: null as null | ((path: string) => void),
  confirmResult: true,
}));

const {
  exec, cfgGet, cfgSet, openSubPage, openFileBrowser,
  showConfirm, showToast, refreshPifChooseDesc,
} = vi.hoisted(() => ({
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
  showToast: vi.fn(),
  refreshPifChooseDesc: vi.fn(async () => {}),
}));

vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils.js')>();
  return {
    ...actual,
    // Run the paint callback on the next tick so loads still start
    // strictly after the page render.
    afterPaint: (fn: () => void) => { setTimeout(fn, 0); },
  };
});
vi.mock('./bridge.js', () => ({ exec, getDataDir: () => '/data/adb/specter' }));
vi.mock('./cfg.js', () => ({ cfgGet, cfgSet }));
vi.mock('./subpage.js', () => ({ openSubPage }));
vi.mock('./file-browser.js', () => ({ openFileBrowser }));
vi.mock('./dialog.js', () => ({ showConfirm }));
vi.mock('./toast.js', () => ({ showToast }));
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

describe('pif device chooser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    store.cfg.clear();
    store.subpageConfig = null;
    store.fileBrowserCallback = null;
    store.confirmResult = true;
    exec.mockReset();
    exec.mockImplementation(async (cmd: string) => execImpl(cmd));
    cfgGet.mockClear();
    cfgSet.mockClear();
    openSubPage.mockClear();
    openFileBrowser.mockClear();
    showConfirm.mockClear();
    showToast.mockClear();
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
    click(fabHost.querySelector('#pif-apply')!);
    await vi.waitFor(() => {
      expect(store.cfg.get('pif_preferred_devices')).toBe('Pixel 10 Pro|frankel');
    });
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Pixel 10 Pro applied', expect.objectContaining({ type: 'success' }));
    });
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
    click(fabHost.querySelector('#pif-apply')!);
    await vi.waitFor(() => {
      expect(store.cfg.get('pif_blacklist')).toBe('Pixel 10|blazer');
    });
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Blacklist saved (1 excluded)', expect.objectContaining({ type: 'success' }));
    });
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
});
