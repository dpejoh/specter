import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  runScript: vi.fn(),
  spawnScript: vi.fn(),
  appendToOutput: vi.fn(),
  getModulesSnapshot: vi.fn(),
  showToast: vi.fn(),
  afterPaint: vi.fn((fn: () => void) => fn()),
}));

vi.mock('./bridge.js', () => ({
  runScript: state.runScript,
  spawnScript: state.spawnScript,
}));

vi.mock('./utils.js', async () => {
  const actual = await vi.importActual<typeof import('./utils.js')>('./utils.js');
  return { ...actual, fetchJson: state.fetchJson, afterPaint: state.afterPaint };
});

vi.mock('./terminal.js', () => ({ appendToOutput: state.appendToOutput }));
vi.mock('./modules.js', () => ({ getModulesSnapshot: state.getModulesSnapshot }));
vi.mock('./toast.js', () => ({ showToast: state.showToast }));

import {
  initDevice, refreshDevice, refreshKeyboxStatus, recomputeKeyboxStatus,
  refreshKeystoreManager, applyKeyboxStatus, reapplyKeyboxStatus,
  refreshConflictStatus, wireKeyboxRefreshButton,
} from './device.js';

const INFO_URL = '/json/info.json';
const KEYBOX_URL = './json/keybox_info.json';
const KSM_URL = '/json/keystore_manager.json';

const INFO = { security_patch: '2025-01-05', pif_model: 'Pixel 9 Pro' };
const RAWBIN_KB = {
  installed: true, source: 'rawbin', text: 'CoolBox', source_version: '2.0',
  rkp: false, up_to_date: false, cert_validity: 'valid',
};

let routes: Record<string, unknown> = {};

function dom() {
  document.body.innerHTML = `
    <button id="kb-refresh-btn"></button>
    <button id="omk-restart-btn"></button>
    <button id="omk-trust-btn"></button>
    <span id="sp-backend"></span>
    <span id="sp-date"></span>
    <span id="sp-pif"></span>
    <span id="keybox-name"></span>
    <span id="keybox-by"></span>
    <span id="keybox-source"></span>
    <span id="keybox-version"></span>
    <span id="keybox-status"></span>
    <span id="keybox-type"></span>
    <span id="kb-version-badge"></span>
  `;
}

function fakeChild(event: 'exit' | 'error') {
  return {
    on(ev: string, fn: (e?: unknown) => void) {
      if (ev === event) setTimeout(() => fn(new Error('child fail')), 0);
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  routes = {};
  state.fetchJson.mockReset().mockImplementation(async (url: string) => routes[url] ?? null);
  state.runScript.mockReset().mockResolvedValue({ success: true, output: '', rawOutput: '' });
  state.spawnScript.mockReset().mockReturnValue(fakeChild('exit'));
  state.appendToOutput.mockReset();
  state.getModulesSnapshot.mockReset().mockResolvedValue(null);
  state.showToast.mockReset();
  state.afterPaint.mockClear();
  delete (window as any).__infoPromise;
  delete (window as any).__keyboxInfoPromise;
  delete (window as any).__keystoreManagerPromise;
  dom();
});

describe('initDevice', () => {
  it('refreshes device, keybox and keystore manager and applies them', async () => {
    routes = { [INFO_URL]: INFO, [KEYBOX_URL]: RAWBIN_KB, [KSM_URL]: { id: 'omk', name: 'OhMyKeymint' } };
    await initDevice();
    expect(document.getElementById('sp-date')!.textContent).toBe('2025-01-05');
    expect(document.getElementById('sp-pif')!.textContent).toBe('Pixel 9 Pro');
    expect(document.getElementById('sp-backend')!.textContent).toBe('OhMyKeymint');
    expect((document.getElementById('omk-restart-btn') as HTMLElement).hidden).toBe(false);
    expect(document.getElementById('keybox-name')!.textContent).toBe('CoolBox');
    expect(document.getElementById('keybox-status')!.textContent).toBe('Active');
    expect(document.getElementById('kb-refresh-btn')!.dataset.spWired).toBe('1');
  });
});

describe('refreshDevice', () => {
  it('uses the preloaded info promise and skips the fetch', async () => {
    (window as any).__infoPromise = Promise.resolve(INFO);
    const data = await refreshDevice();
    expect(data).toEqual(INFO);
    expect(state.fetchJson).not.toHaveBeenCalledWith(INFO_URL);
    expect(state.afterPaint).not.toHaveBeenCalled();
    expect(document.getElementById('sp-date')!.textContent).toBe('2025-01-05');
  });

  it('schedules a script refresh after paint when asked', async () => {
    (window as any).__infoPromise = Promise.resolve(INFO);
    routes = { [INFO_URL]: INFO };
    state.runScript.mockResolvedValue({ success: true, output: 'line a\nline b', rawOutput: '' });
    await refreshDevice(true);
    expect(state.afterPaint).toHaveBeenCalledTimes(1);
    expect(state.runScript).toHaveBeenCalledWith('device-info.sh', 'common');
    expect(state.appendToOutput).toHaveBeenCalledWith('[device-info] line a');
    expect(state.appendToOutput).toHaveBeenCalledWith('[device-info] line b');
  });

  it('falls back to the script when the snapshot is missing', async () => {
    let infoCalls = 0;
    state.fetchJson.mockImplementation(async (url: string) => {
      if (url !== INFO_URL) return null;
      infoCalls++;
      return infoCalls > 1 ? INFO : null;
    });
    const data = await refreshDevice();
    expect(data).toEqual(INFO);
    expect(state.runScript).toHaveBeenCalledWith('device-info.sh', 'common');
  });

  it('still fetches after a script failure and returns null when nothing loads', async () => {
    state.runScript.mockRejectedValue(new Error('script boom'));
    const data = await refreshDevice();
    expect(data).toBeNull();
    expect(state.fetchJson).toHaveBeenCalledWith(INFO_URL);
  });

  it('returns null for a concurrent refresh while one is in flight', async () => {
    let release!: (v: unknown) => void;
    state.runScript.mockReturnValue(new Promise(r => { release = r; }));
    const first = refreshDevice();
    const second = await refreshDevice();
    expect(second).toBeNull();
    release({ success: true, output: '', rawOutput: '' });
    routes = { [INFO_URL]: INFO };
    await expect(first).resolves.toEqual(INFO);
  });

  it('applies the build patch fallback and dashes when no patch is known', async () => {
    (window as any).__infoPromise = Promise.resolve({ build_patch: '2024-11-05' });
    await refreshDevice();
    expect(document.getElementById('sp-date')!.textContent).toBe('2024-11-05');
    expect(document.getElementById('sp-pif')!.textContent).toBe('—');

    (window as any).__infoPromise = Promise.resolve({});
    await refreshDevice();
    expect(document.getElementById('sp-date')!.textContent).toBe('—');
  });

  it('tolerates a missing sp-date element', async () => {
    document.getElementById('sp-date')!.remove();
    (window as any).__infoPromise = Promise.resolve(INFO);
    await expect(refreshDevice()).resolves.toEqual(INFO);
  });
});

describe('refreshKeyboxStatus', () => {
  it('consumes the preload once, then reads from disk', async () => {
    (window as any).__keyboxInfoPromise = Promise.resolve(RAWBIN_KB);
    const first = await refreshKeyboxStatus();
    expect(first).toEqual(RAWBIN_KB);
    expect((window as any).__keyboxInfoPromise).toBeNull();
    expect(state.fetchJson).not.toHaveBeenCalledWith(KEYBOX_URL);

    routes = { [KEYBOX_URL]: { ...RAWBIN_KB, text: 'DiskBox' } };
    const second = await refreshKeyboxStatus();
    expect(second?.text).toBe('DiskBox');
    expect(document.getElementById('keybox-name')!.textContent).toBe('DiskBox');
  });

  it('returns null when no snapshot exists', async () => {
    await expect(refreshKeyboxStatus()).resolves.toBeNull();
  });
});

describe('recomputeKeyboxStatus', () => {
  it('runs the info script and re-reads the snapshot on exit', async () => {
    routes = { [KEYBOX_URL]: RAWBIN_KB };
    const data = await recomputeKeyboxStatus();
    expect(state.spawnScript).toHaveBeenCalledWith('keybox_info.sh', 'feature');
    expect(data).toEqual(RAWBIN_KB);
  });

  it('rejects when the info script errors', async () => {
    state.spawnScript.mockReturnValue(fakeChild('error'));
    await expect(recomputeKeyboxStatus()).rejects.toThrow('child fail');
  });
});

describe('keybox refresh button', () => {
  it('recomputes on click and restores the button', async () => {
    routes = { [KEYBOX_URL]: RAWBIN_KB };
    wireKeyboxRefreshButton();
    wireKeyboxRefreshButton(); // dataset guard: wired once
    const btn = document.getElementById('kb-refresh-btn')!;
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => {
      expect(state.spawnScript).toHaveBeenCalledTimes(1);
      expect(btn.hasAttribute('disabled')).toBe(false);
      expect(btn.classList.contains('kb-refresh-btn--busy')).toBe(false);
    });
  });

  it('toasts and restores the button when the recompute fails', async () => {
    state.spawnScript.mockReturnValue(fakeChild('error'));
    wireKeyboxRefreshButton();
    const btn = document.getElementById('kb-refresh-btn')!;
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => {
      expect(state.showToast).toHaveBeenCalledWith('Failed to update', expect.objectContaining({ type: 'error' }));
      expect(btn.hasAttribute('disabled')).toBe(false);
    });
  });

  it('does nothing without the button', () => {
    document.body.innerHTML = '';
    expect(() => wireKeyboxRefreshButton()).not.toThrow();
  });
});

describe('refreshKeystoreManager', () => {
  it('uses the preload and shows OMK actions only for omk', async () => {
    (window as any).__keystoreManagerPromise = Promise.resolve({ id: 'omk', name: 'OhMyKeymint' });
    const data = await refreshKeystoreManager();
    expect(data?.id).toBe('omk');
    expect((document.getElementById('omk-trust-btn') as HTMLElement).hidden).toBe(false);
  });

  it('falls back to the script when the snapshot is missing', async () => {
    let calls = 0;
    state.fetchJson.mockImplementation(async (url: string) => {
      if (url !== KSM_URL) return null;
      calls++;
      return calls > 1 ? { id: 'te', name: 'TEESimulator' } : null;
    });
    const data = await refreshKeystoreManager();
    expect(state.runScript).toHaveBeenCalledWith('keystore_info.sh', 'feature');
    expect(data?.id).toBe('te');
    expect((document.getElementById('omk-restart-btn') as HTMLElement).hidden).toBe(true);
    expect(document.getElementById('sp-backend')!.textContent).toBe('TEESimulator');
  });

  it('returns null when the script also fails to produce data', async () => {
    state.runScript.mockRejectedValue(new Error('ksm boom'));
    await expect(refreshKeystoreManager()).resolves.toBeNull();
  });

  it('labels the backend from id, or Not Installed for none', async () => {
    (window as any).__keystoreManagerPromise = Promise.resolve({ id: 'ts' });
    await refreshKeystoreManager();
    expect(document.getElementById('sp-backend')!.textContent).toBe('ts');

    (window as any).__keystoreManagerPromise = Promise.resolve({ id: 'none' });
    await refreshKeystoreManager();
    expect(document.getElementById('sp-backend')!.textContent).toBe('Not Installed');
  });
});

describe('applyKeyboxStatus', () => {
  const name = () => document.getElementById('keybox-name')!;
  const status = () => document.getElementById('keybox-status')!;
  const badge = () => document.getElementById('kb-version-badge')!;
  const type = () => document.getElementById('keybox-type')!;

  it('returns silently when the hero elements are missing', () => {
    document.body.innerHTML = '';
    expect(() => applyKeyboxStatus(RAWBIN_KB as any)).not.toThrow();
  });

  it('renders the not-installed state', () => {
    applyKeyboxStatus({ installed: false } as any);
    expect(name().textContent).toBe('Not Installed');
    expect(name().classList.contains('kb-hero-keybox-name--neutral')).toBe(true);
    expect(status().textContent).toBe('—');
    expect(type().textContent).toBe('—');
    expect(badge().textContent).toBe('');
    expect(document.getElementById('keybox-by')!.style.display).toBe('none');
  });

  it('renders a private keybox without a source', () => {
    applyKeyboxStatus({ installed: true, is_private: true, cert_validity: 'valid' } as any);
    expect(name().textContent).toBe('Private Keybox');
    expect(document.getElementById('keybox-source')!.style.display).toBe('none');
    expect(status().textContent).toBe('Active');

    applyKeyboxStatus({ installed: true, source: 'Private', cert_validity: 'valid' } as any);
    expect(name().textContent).toBe('Private Keybox');
  });

  it('renders a provider keybox with version prefix and RKP type, no version badge', () => {
    applyKeyboxStatus({
      installed: true, source: 'rawbin', source_version: '2.0',
      rkp: true, up_to_date: true, cert_validity: 'valid',
    } as any);
    expect(name().textContent).toBe('v2.0');
    expect(document.getElementById('keybox-by')!.style.display).toBe('');
    expect(document.getElementById('keybox-source')!.textContent).toBe('rawbin');
    expect(type().textContent).toBe('RKP');
    expect(type().className).toContain('kb-hero-type-text');
    expect(badge().textContent).toBe('');
    expect(badge().className).toBe('kb-version-badge');
  });

  it('keeps an existing v prefix and falls back to the provider name alone', () => {
    applyKeyboxStatus({ installed: true, source: 'rawbin', source_version: 'v3', cert_validity: 'valid' } as any);
    expect(name().textContent).toBe('v3');
    expect(type().textContent).toBe('Normal');

    applyKeyboxStatus({ installed: true, source: 'rawbin', cert_validity: 'valid' } as any);
    expect(name().textContent).toBe('rawbin');
    expect(document.getElementById('keybox-by')!.style.display).toBe('none');
  });

  it('renders a generic keybox with a Generic badge', () => {
    applyKeyboxStatus({ installed: true, source: 'unknown', source_version: '9', cert_validity: 'valid' } as any);
    expect(name().textContent).toBe('Generic');
    expect(badge().textContent).toBe('Generic');
    expect(badge().className).toContain('kb-version-badge--outdated');

    applyKeyboxStatus({ installed: true, source: 'unknown', text: 'Bundled', cert_validity: 'valid' } as any);
    expect(name().textContent).toBe('Bundled');
    expect(badge().textContent).toBe('');
  });

  it('maps every status flag', () => {
    const base = { installed: true, source: 'rawbin', cert_validity: 'valid' };
    applyKeyboxStatus({ ...base, revoked: true } as any);
    expect(status().textContent).toBe('Revoked');
    applyKeyboxStatus({ ...base, cert_validity: 'not_yet_valid' } as any);
    expect(status().textContent).toBe('Not yet valid');
    applyKeyboxStatus({ ...base, expired: true } as any);
    expect(status().textContent).toBe('Expired');
    applyKeyboxStatus({ ...base, softbanned: true } as any);
    expect(status().textContent).toBe('Softbanned');
    expect(status().className).toContain('kb-hero-status-text--softbanned');
    applyKeyboxStatus({ ...base, cert_validity: 'weird' } as any);
    expect(status().textContent).toBe('Certificate validity unknown');
    applyKeyboxStatus(base as any);
    expect(status().textContent).toBe('Active');
    expect(status().className).toContain('kb-hero-status-text--active');
  });

  it('reapplies the last snapshot', () => {
    applyKeyboxStatus(RAWBIN_KB as any);
    name().textContent = 'changed';
    reapplyKeyboxStatus();
    expect(name().textContent).toBe('CoolBox');
  });
});

describe('hero clip behaviour', () => {
  it('makes an overflowing hero value expandable by click and keyboard', () => {
    const source = document.getElementById('keybox-source')!;
    Object.defineProperty(source, 'scrollWidth', { value: 240, configurable: true });
    Object.defineProperty(source, 'clientWidth', { value: 60, configurable: true });
    applyKeyboxStatus(RAWBIN_KB as any);

    expect(source.classList.contains('hero-clip')).toBe(true);
    expect(source.getAttribute('aria-expanded')).toBe('false');
    expect(source.title).toBe('rawbin');

    source.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(source.classList.contains('hero-clip--open')).toBe(true);
    expect(source.getAttribute('aria-expanded')).toBe('true');

    source.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(source.classList.contains('hero-clip--open')).toBe(false);

    source.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(source.classList.contains('hero-clip--open')).toBe(false);

    // A non-clipped element ignores clicks entirely.
    const version = document.getElementById('keybox-version')!;
    version.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(version.classList.contains('hero-clip--open')).toBe(false);
  });
});

describe('refreshConflictStatus', () => {
  it('prefers the modules snapshot', async () => {
    state.getModulesSnapshot.mockResolvedValue({ conflicts: [{ id: 'a' }] });
    await expect(refreshConflictStatus()).resolves.toEqual([{ id: 'a' }]);
    expect(state.runScript).not.toHaveBeenCalled();
  });

  it('falls back to the conflicts script output', async () => {
    state.runScript.mockResolvedValue({ success: true, output: '[{"id":"b"}]', rawOutput: '' });
    await expect(refreshConflictStatus()).resolves.toEqual([{ id: 'b' }]);

    state.runScript.mockResolvedValue({ success: true, output: '', rawOutput: '[{"id":"c"}]' });
    await expect(refreshConflictStatus()).resolves.toEqual([{ id: 'c' }]);

    state.runScript.mockResolvedValue({ success: true, output: '{"nope":1}', rawOutput: '' });
    await expect(refreshConflictStatus()).resolves.toEqual([]);
  });

  it('returns an empty list when the script fails', async () => {
    state.runScript.mockRejectedValue(new Error('conflict boom'));
    await expect(refreshConflictStatus()).resolves.toEqual([]);
  });
});
