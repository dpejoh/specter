import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  openSubPage,
  exec,
  spawnCommand,
  getModuleDir,
  fetchJson,
  afterPaint,
  showToast,
  showLoadingToast,
  updateToast,
  closeToast,
  wireRowActivation,
  paintState,
  pageState,
} = vi.hoisted(() => {
  const paintState = { callback: null as (() => void) | null };
  const pageState = {
    overlay: null as HTMLElement | null,
    close: vi.fn(),
  };
  return {
    openSubPage: vi.fn(async (_config: object) => {
      const overlay = document.createElement('div');
      pageState.overlay = overlay;
      pageState.close = vi.fn();
      return { overlay, close: pageState.close, isMasterEnabled: () => true };
    }),
    exec: vi.fn(async (_command: string) => ({ stdout: '2026-10-05', stderr: '', code: 0 })),
    spawnCommand: vi.fn(async (_command: string) => ({ stdout: '2026-10-05', stderr: '', code: 0 })),
    getModuleDir: vi.fn(() => '/data/adb/modules/specter'),
    fetchJson: vi.fn(async () => ({ id: 'tricky_store' })),
    afterPaint: vi.fn((fn: () => void) => { paintState.callback = fn; }),
    showToast: vi.fn((message: string) => {
      const toast = document.createElement('div');
      toast.className = 'sp-snackbar';
      toast.textContent = message;
      return toast;
    }),
    showLoadingToast: vi.fn((message: string) => {
      const toast = document.createElement('div');
      toast.className = 'sp-snackbar sp-snackbar--loading';
      toast.textContent = message;
      return toast;
    }),
    updateToast: vi.fn(),
    closeToast: vi.fn(),
    wireRowActivation: vi.fn(),
    paintState,
    pageState,
  };
});

vi.mock('./subpage.js', () => ({ openSubPage }));
vi.mock('./bridge.js', () => ({ exec, spawnCommand, getModuleDir }));
vi.mock('./toast.js', () => ({ showToast, showLoadingToast, updateToast, closeToast }));
vi.mock('./utils.js', () => ({
  afterPaint,
  fetchJson,
  shellEscape: (value: string) => `'${value}'`,
  wireRowActivation,
}));

import { openSecurityPatchPage, wireSecurityPatch } from './security-patch-ui.js';
import { defaultSecurityPatch } from './constants.js';
import { t } from './i18n.js';
import './ui/sp-settings-row.js';

interface CustomItem {
  type: string;
  render: (container: HTMLElement, isEnabled: () => boolean) => void;
}

interface SecurityPatchConfig {
  title: string;
  groups: { items: CustomItem[] }[];
  fab?: (container: HTMLElement, page: {
    overlay: HTMLElement;
    close: () => void;
    isMasterEnabled: () => boolean;
  }) => void;
}

const config = () => openSubPage.mock.calls[
  openSubPage.mock.calls.length - 1
]![0] as unknown as SecurityPatchConfig;

const mountItem = (
  cfg: SecurityPatchConfig,
  groupIndex: number,
  itemIndex: number,
  section = false,
) => {
  const host = document.createElement(section ? 'sp-settings-section' : 'div');
  const container = document.createElement('div');
  host.append(container);
  cfg.groups[groupIndex]!.items[itemIndex]!.render(container, () => true);
  return { host, container };
};

const mountFab = (cfg: SecurityPatchConfig) => {
  const container = document.createElement('div');
  cfg.fab!(container, {
    overlay: pageState.overlay!,
    close: pageState.close,
    isMasterEnabled: () => true,
  });
  return container;
};

const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

const paint = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await settle();
};

const toastMessages = () => showToast.mock.calls.map(([message]) => message as string);

describe('security patch subpage', () => {
  const flushInitialLoad = async () => {
    expect(paintState.callback).not.toBeNull();
    paintState.callback!();
    paintState.callback = null;
    await settle();
  };

  beforeEach(() => {
    document.body.replaceChildren();
    openSubPage.mockClear();
    exec.mockReset();
    spawnCommand.mockReset();
    fetchJson.mockReset();
    afterPaint.mockReset();
    showToast.mockClear();
    showLoadingToast.mockClear();
    updateToast.mockClear();
    closeToast.mockClear();
    wireRowActivation.mockClear();
    paintState.callback = null;
    pageState.overlay = null;
    getModuleDir.mockReturnValue('/data/adb/modules/specter');
    exec.mockResolvedValue({ stdout: '2026-10-05', stderr: '', code: 0 });
    spawnCommand.mockResolvedValue({ stdout: '2026-10-05', stderr: '', code: 0 });
    fetchJson.mockResolvedValue({ id: 'tricky_store' });
    afterPaint.mockImplementation((fn: () => void) => { paintState.callback = fn; });
  });

  it('renders a text date field with auto-formatting and device/fetch actions', async () => {
    await openSecurityPatchPage();

    const cfg = config();
    const field = cfg.groups[0]!.items[0]!;
    const actions = cfg.groups[1]!.items;
    // In production the subpage framework appends the host to a section
    // before rendering, and the renderer replaces the host with the row.
    const { host } = mountItem(cfg, 0, 0, true);
    const device = mountItem(cfg, 1, 0, true);
    const fetch = mountItem(cfg, 1, 1, true);

    expect(host.querySelector('.sp-skeleton-row')).not.toBeNull();
    expect(host.querySelector('#sp-input')).toBeNull();
    expect(device.host.querySelector('.sp-skeleton-row')).not.toBeNull();
    expect(fetch.host.querySelector('.sp-skeleton-row')).not.toBeNull();
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(device.host.getAttribute('aria-hidden')).toBe('true');

    await flushInitialLoad();

    const input = host.querySelector('#sp-input') as HTMLInputElement;
    expect(cfg.title).toBe('Set Security Patch');
    expect(field.type).toBe('custom');
    expect(host.querySelector('sp-settings-row#sp-input-row')).not.toBeNull();
    expect(host.querySelector('.list-item')).toBeNull();
    expect(host.getAttribute('aria-hidden')).toBeNull();
    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.value).toBe('2026-10-05');
    expect(input.placeholder).toBe('YYYY-MM-DD');
    expect(host.querySelector('#sp-input-help')?.textContent).toBe('Use YYYY-MM-DD.');
    expect(host.querySelectorAll('.sp-quick-chip')).toHaveLength(0);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: 'custom' });
    expect(actions[1]).toMatchObject({ type: 'custom' });
    expect(device.host.querySelector('#sp-device-row')?.getAttribute('headline')).toBe('Use device date');
    expect(fetch.host.querySelector('#sp-fetch-row')?.getAttribute('headline')).toBe('Fetch latest date');
    expect(device.host.getAttribute('aria-hidden')).toBeNull();

    input.value = '20261005';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('2026-10-05');

    input.value = '2026';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('2026');

    input.value = '20261';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('2026-1');

    input.value = '2026-13-99';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('2026-13-99');
  });

  it('uses OMK text mode with auto and latest shortcuts', async () => {
    fetchJson.mockResolvedValue({ id: 'omk' });
    exec.mockResolvedValue({ stdout: 'auto', stderr: '', code: 0 });

    await openSecurityPatchPage();

    const cfg = config();
    const { host } = mountItem(cfg, 0, 0, true);

    expect(host.querySelector('.sp-skeleton-row')).not.toBeNull();
    expect(host.querySelector('#sp-input')).toBeNull();
    await flushInitialLoad();

    const input = host.querySelector('#sp-input') as HTMLInputElement;
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.sp-quick-chip')];

    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('text');
    expect(input.value).toBe('auto');
    expect(input.placeholder).toBe('YYYY-MM-DD');
    expect(input.getAttribute('aria-label')).toBe('Security Patch');
    expect(host.querySelector('#sp-input-help')?.textContent).toBe('auto, latest, or YYYY-MM-DD');
    expect(chips.map(chip => chip.textContent)).toEqual(['Auto', 'Latest']);
    expect(chips[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(chips[1]?.getAttribute('aria-pressed')).toBe('false');

    chips[1]!.click();
    expect(input.value).toBe('latest');
    expect(chips[0]?.getAttribute('aria-pressed')).toBe('false');
    expect(chips[1]?.getAttribute('aria-pressed')).toBe('true');

    chips[0]!.click();
    expect(input.value).toBe('auto');
    expect(chips[0]?.getAttribute('aria-pressed')).toBe('true');

    input.value = 'custom-value';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(chips.every(chip => chip.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('shows the skeleton first and starts loading only after paint', async () => {
    let resolveExec!: (value: { stdout: string; stderr: string; code: number }) => void;
    exec.mockImplementation(() => new Promise(resolve => { resolveExec = resolve; }));

    await openSecurityPatchPage();

    expect(openSubPage).toHaveBeenCalledTimes(1);
    expect(afterPaint).toHaveBeenCalledTimes(1);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();

    const cfg = config();
    const { host } = mountItem(cfg, 0, 0, true);

    expect(host.querySelector('.sp-skeleton-row')).not.toBeNull();
    expect(host.querySelector('#sp-input')).toBeNull();

    paintState.callback!();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.sp-skeleton-row')).not.toBeNull();
    expect(host.querySelector('#sp-input')).toBeNull();

    resolveExec({ stdout: '2026-10-05', stderr: '', code: 0 });
    await settle();

    expect(host.querySelector('.sp-skeleton-row')).toBeNull();
    expect((host.querySelector('#sp-input') as HTMLInputElement).value).toBe('2026-10-05');
  });

  it('bails out when the module directory is unavailable', async () => {
    getModuleDir.mockReturnValue(null as unknown as string);

    await openSecurityPatchPage();

    expect(openSubPage).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      t('simple_toast_error', 'Failed'),
      expect.objectContaining({ icon: 'error', type: 'error' }),
    );
  });

  it('keeps the default when the current value is invalid and the manager fetch fails', async () => {
    fetchJson.mockRejectedValue(new Error('offline'));
    exec.mockResolvedValue({ stdout: 'not-a-date', stderr: '', code: 0 });

    await openSecurityPatchPage();
    const cfg = config();
    const { host } = mountItem(cfg, 0, 0, true);
    await flushInitialLoad();

    const input = host.querySelector('#sp-input') as HTMLInputElement;
    expect(input.value).toBe(defaultSecurityPatch());
    expect(host.querySelectorAll('.sp-quick-chip')).toHaveLength(0);
    expect(fetchJson).toHaveBeenCalledWith('/json/keystore_manager.json', 0);
  });

  it('falls back to the default when the current-value script throws', async () => {
    exec.mockRejectedValue(new Error('bridge down'));

    await openSecurityPatchPage();
    const cfg = config();
    const { host } = mountItem(cfg, 0, 0, true);
    await flushInitialLoad();

    expect((host.querySelector('#sp-input') as HTMLInputElement).value).toBe(defaultSecurityPatch());
  });

  it('loads the device date and updates an existing field', async () => {
    await openSecurityPatchPage();
    const cfg = config();
    const { host } = mountItem(cfg, 0, 0, true);
    const device = mountItem(cfg, 1, 0, true);
    await flushInitialLoad();

    exec.mockImplementation(async (command: string) => {
      if (command.includes('--device')) return { stdout: '2026-11-05\n', stderr: '', code: 0 };
      return { stdout: '2026-10-05', stderr: '', code: 0 };
    });

    device.host.querySelector('#sp-device-row')!.dispatchEvent(new Event('sp-activate'));
    await settle();

    expect((host.querySelector('#sp-input') as HTMLInputElement).value).toBe('2026-11-05');
    expect(showToast).toHaveBeenCalledWith(
      t('sp_device_loaded', 'Loaded device security patch'),
      expect.objectContaining({ icon: 'check_circle', type: 'success' }),
    );
    expect(device.host.querySelector('#sp-device-row')?.hasAttribute('disabled')).toBe(false);
    expect(device.host.querySelector('#sp-device-row')?.getAttribute('aria-busy')).toBe('false');
  });

  it('reports unavailable device dates for a failed run, invalid output, and a thrown error', async () => {
    await openSecurityPatchPage();
    const cfg = config();
    const device = mountItem(cfg, 1, 0, true);
    await flushInitialLoad();
    const row = () => device.host.querySelector('#sp-device-row')!;

    exec.mockImplementation(async (command: string) => (
      command.includes('--device')
        ? { stdout: '2026-11-05', stderr: '', code: 1 }
        : { stdout: '2026-10-05', stderr: '', code: 0 }
    ));
    row().dispatchEvent(new Event('sp-activate'));
    await settle();
    expect(toastMessages()).toContain(t('sp_device_unavailable', 'Device security patch unavailable'));

    showToast.mockClear();
    exec.mockImplementation(async (command: string) => (
      command.includes('--device')
        ? { stdout: 'garbage', stderr: '', code: 0 }
        : { stdout: '2026-10-05', stderr: '', code: 0 }
    ));
    row().dispatchEvent(new Event('sp-activate'));
    await settle();
    expect(toastMessages()).toContain(t('sp_device_unavailable', 'Device security patch unavailable'));

    showToast.mockClear();
    exec.mockImplementation(async (command: string) => {
      if (command.includes('--device')) throw new Error('bridge down');
      return { stdout: '2026-10-05', stderr: '', code: 0 };
    });
    row().dispatchEvent(new Event('sp-activate'));
    await settle();
    expect(toastMessages()).toContain(t('sp_device_unavailable', 'Device security patch unavailable'));
    expect(row().getAttribute('aria-busy')).toBe('false');
    expect(row().hasAttribute('disabled')).toBe(false);
  });

  it('applies a device date when no input field is mounted', async () => {
    await openSecurityPatchPage();
    const cfg = config();
    const device = mountItem(cfg, 1, 0, true);
    await flushInitialLoad();

    exec.mockImplementation(async (command: string) => {
      if (command.includes('--device')) return { stdout: '2026-11-05', stderr: '', code: 0 };
      return { stdout: '2026-10-05', stderr: '', code: 0 };
    });

    device.host.querySelector('#sp-device-row')!.dispatchEvent(new Event('sp-activate'));
    await settle();

    expect(showToast).toHaveBeenCalledWith(
      t('sp_device_loaded', 'Loaded device security patch'),
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('does not start a fetch while a device read is busy', async () => {
    let resolveDevice!: (value: { stdout: string; stderr: string; code: number }) => void;
    exec.mockImplementation((command: string) => {
      if (command.includes('--device')) {
        return new Promise(resolve => { resolveDevice = resolve; });
      }
      return Promise.resolve({ stdout: '2026-10-05', stderr: '', code: 0 });
    });

    await openSecurityPatchPage();
    const cfg = config();
    const device = mountItem(cfg, 1, 0, true);
    const fetch = mountItem(cfg, 1, 1, true);
    await flushInitialLoad();

    device.host.querySelector('#sp-device-row')!.dispatchEvent(new Event('sp-activate'));
    await new Promise(resolve => setTimeout(resolve, 0));
    fetch.host.querySelector('#sp-fetch-row')!.dispatchEvent(new Event('sp-activate'));
    await settle();

    expect(exec.mock.calls.some(([command]) => String(command).includes('--fetch'))).toBe(false);
    expect(device.host.querySelector('#sp-device-row')?.getAttribute('aria-busy')).toBe('true');

    resolveDevice({ stdout: '2026-11-05', stderr: '', code: 0 });
    await settle();
    expect(device.host.querySelector('#sp-device-row')?.getAttribute('aria-busy')).toBe('false');
  });

  it('does not start a device read while a fetch is busy', async () => {
    let resolveFetch!: (value: { stdout: string; stderr: string; code: number }) => void;
    exec.mockImplementation((command: string) => {
      if (command.includes('--fetch')) {
        return new Promise(resolve => { resolveFetch = resolve; });
      }
      return Promise.resolve({ stdout: '2026-10-05', stderr: '', code: 0 });
    });

    await openSecurityPatchPage();
    const cfg = config();
    const device = mountItem(cfg, 1, 0, true);
    const fetch = mountItem(cfg, 1, 1, true);
    await flushInitialLoad();

    fetch.host.querySelector('#sp-fetch-row')!.dispatchEvent(new Event('sp-activate'));
    await new Promise(resolve => setTimeout(resolve, 0));
    device.host.querySelector('#sp-device-row')!.dispatchEvent(new Event('sp-activate'));
    await settle();

    expect(exec.mock.calls.some(([command]) => String(command).includes('--device'))).toBe(false);

    resolveFetch({ stdout: '2026-12-05', stderr: '', code: 0 });
    await settle();
    expect(fetch.host.querySelector('#sp-fetch-row')?.getAttribute('aria-busy')).toBe('false');
  });

  it('fetches the latest date, closing the progress toast', async () => {
    await openSecurityPatchPage();
    const cfg = config();
    const { host } = mountItem(cfg, 0, 0, true);
    const fetch = mountItem(cfg, 1, 1, true);
    await flushInitialLoad();

    const progressToast = document.createElement('div');
    showToast.mockReturnValueOnce(progressToast);
    exec.mockImplementation(async (command: string) => {
      if (command.includes('--fetch')) return { stdout: '2026-12-05\n', stderr: '', code: 0 };
      return { stdout: '2026-10-05', stderr: '', code: 0 };
    });

    fetch.host.querySelector('#sp-fetch-row')!.dispatchEvent(new Event('sp-activate'));
    await settle();

    expect(closeToast).toHaveBeenCalledWith(progressToast);
    expect((host.querySelector('#sp-input') as HTMLInputElement).value).toBe('2026-12-05');
    expect(showToast).toHaveBeenCalledWith(
      t('sp_fetched', 'Latest security patch fetched'),
      expect.objectContaining({ icon: 'check_circle', type: 'success' }),
    );
  });

  it('reports failure for invalid fetched values and script errors', async () => {
    await openSecurityPatchPage();
    const cfg = config();
    const { host } = mountItem(cfg, 0, 0, true);
    const fetch = mountItem(cfg, 1, 1, true);
    await flushInitialLoad();
    const row = () => fetch.host.querySelector('#sp-fetch-row')!;

    const progressToast = document.createElement('div');
    showToast.mockReturnValueOnce(progressToast);
    exec.mockImplementation(async (command: string) => {
      if (command.includes('--fetch')) return { stdout: 'garbage', stderr: '', code: 0 };
      return { stdout: '2026-10-05', stderr: '', code: 0 };
    });
    row().dispatchEvent(new Event('sp-activate'));
    await settle();
    expect(closeToast).toHaveBeenCalledWith(progressToast);
    expect(toastMessages()).toContain(t('simple_toast_error', 'Failed'));
    expect((host.querySelector('#sp-input') as HTMLInputElement).value).toBe('2026-10-05');

    showToast.mockClear();
    closeToast.mockClear();
    const failedToast = document.createElement('div');
    showToast.mockReturnValueOnce(failedToast);
    exec.mockImplementation(async (command: string) => {
      if (command.includes('--fetch')) throw new Error('bridge down');
      return { stdout: '2026-10-05', stderr: '', code: 0 };
    });
    row().dispatchEvent(new Event('sp-activate'));
    await settle();
    expect(closeToast).toHaveBeenCalledWith(failedToast);
    expect(toastMessages()).toContain(t('simple_toast_error', 'Failed'));
    expect(row().hasAttribute('disabled')).toBe(false);
  });

  it('validates real calendar dates before saving and clears the error on edit', async () => {
    await openSecurityPatchPage();
    const cfg = config();
    const { host } = mountItem(cfg, 0, 0, true);
    const fab = mountFab(cfg);
    await flushInitialLoad();

    const input = host.querySelector('#sp-input') as HTMLInputElement;
    const help = host.querySelector('#sp-input-help') as HTMLElement;
    const save = () => fab.querySelector('#sp-save-fab')!.dispatchEvent(new Event('click'));

    // Shape-invalid and well-formed but impossible calendar dates are both
    // rejected before the save script runs.
    for (const invalid of ['2026-1-5', '2026-02-31', '2026-99-99', '2026-13-01', '2025-02-29']) {
      showToast.mockClear();
      input.value = invalid;
      save();
      await settle();

      expect(showToast).toHaveBeenCalledWith(
        t('sp_invalid_date', 'Invalid date format (use YYYY-MM-DD)'),
        expect.objectContaining({ icon: 'error', type: 'error' }),
      );
      expect(input.classList.contains('subpage-inline-input--invalid')).toBe(true);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(help.classList.contains('supporting-text--error')).toBe(true);
      expect(help.textContent).toBe(t('sp_invalid_date', 'Invalid date format (use YYYY-MM-DD)'));
    }
    expect(spawnCommand.mock.calls.some(([command]) => String(command).includes('--set'))).toBe(false);
    expect(showLoadingToast).not.toHaveBeenCalled();

    input.value = '2026-11-05';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.classList.contains('subpage-inline-input--invalid')).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(help.classList.contains('supporting-text--error')).toBe(false);
    expect(help.textContent).toBe(t('sp_helper_date', 'Use YYYY-MM-DD.'));
  });

  it('accepts a real leap day and saves it', async () => {
    await openSecurityPatchPage();
    const cfg = config();
    const { host } = mountItem(cfg, 0, 0, true);
    const fab = mountFab(cfg);
    await flushInitialLoad();

    (host.querySelector('#sp-input') as HTMLInputElement).value = '2028-02-29';
    fab.querySelector('#sp-save-fab')!.dispatchEvent(new Event('click'));
    await paint();

    const commands = spawnCommand.mock.calls.map(([command]) => String(command));
    expect(commands).toContain("sh '/data/adb/modules/specter/features/security_patch.sh' --set '2028-02-29'");
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('sp_saved', 'Security patch date saved'),
      expect.objectContaining({ icon: 'check_circle', type: 'success' }),
    );
    expect(pageState.close).not.toHaveBeenCalled();
  });

  it('validates OMK values with the OMK error message', async () => {
    fetchJson.mockResolvedValue({ id: 'omk' });
    exec.mockResolvedValue({ stdout: 'auto', stderr: '', code: 0 });

    await openSecurityPatchPage();
    const cfg = config();
    const { host } = mountItem(cfg, 0, 0, true);
    const fab = mountFab(cfg);
    await flushInitialLoad();

    const input = host.querySelector('#sp-input') as HTMLInputElement;
    input.value = 'not-valid';
    fab.querySelector('#sp-save-fab')!.dispatchEvent(new Event('click'));
    await settle();

    expect(showToast).toHaveBeenCalledWith(
      t('sp_invalid_omk', 'Use auto, latest, or YYYY-MM-DD'),
      expect.objectContaining({ type: 'error' }),
    );
    expect(spawnCommand.mock.calls.some(([command]) => String(command).includes('--set'))).toBe(false);
  });

  it('saves a valid value, refreshes the description, and keeps the page open', async () => {
    await openSecurityPatchPage();
    const cfg = config();
    const { host } = mountItem(cfg, 0, 0, true);
    const fab = mountFab(cfg);
    await flushInitialLoad();

    const input = host.querySelector('#sp-input') as HTMLInputElement;
    input.value = '2026-11-05';
    spawnCommand.mockImplementation(async (command: string) => {
      if (command.includes('refresh_desc.sh')) return { stdout: '', stderr: '', code: 0 };
      return { stdout: '2026-10-05', stderr: '', code: 0 };
    });

    const saveFab = fab.querySelector('#sp-save-fab')!;
    saveFab.dispatchEvent(new Event('click'));

    // The busy state must be painted before the shell work starts.
    expect(saveFab.hasAttribute('disabled')).toBe(true);
    expect(showLoadingToast).toHaveBeenCalledTimes(1);
    expect(spawnCommand).not.toHaveBeenCalled();

    await paint();

    const commands = spawnCommand.mock.calls.map(([command]) => String(command));
    expect(commands).toContain("sh '/data/adb/modules/specter/features/security_patch.sh' --set '2026-11-05'");
    expect(commands.some(command => command.includes('refresh_desc.sh'))).toBe(true);
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('sp_saved', 'Security patch date saved'),
      expect.objectContaining({ icon: 'check_circle', type: 'success' }),
    );
    expect(showToast).not.toHaveBeenCalledWith(
      t('sp_saved', 'Security patch date saved'),
      expect.anything(),
    );
    expect(pageState.close).not.toHaveBeenCalled();
    expect(saveFab.hasAttribute('disabled')).toBe(false);
  });

  it('keeps the page open and shows script stderr when the save script fails', async () => {
    await openSecurityPatchPage();
    const cfg = config();
    mountItem(cfg, 0, 0, true);
    const fab = mountFab(cfg);
    await flushInitialLoad();

    spawnCommand.mockImplementation(async (command: string) => {
      if (command.includes('--set')) return { stdout: '', stderr: 'permission denied\n', code: 1 };
      return { stdout: '2026-10-05', stderr: '', code: 0 };
    });

    fab.querySelector('#sp-save-fab')!.dispatchEvent(new Event('click'));
    await paint();

    // The script's stderr is more useful than the generic translated message.
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(),
      'permission denied',
      expect.objectContaining({ icon: 'error', type: 'error' }),
    );
    expect(pageState.close).not.toHaveBeenCalled();
    expect(fab.querySelector('#sp-save-fab')?.hasAttribute('disabled')).toBe(false);
    expect(spawnCommand.mock.calls.some(([command]) => String(command).includes('refresh_desc.sh'))).toBe(false);

    updateToast.mockClear();
    spawnCommand.mockImplementation(async (command: string) => {
      if (command.includes('--set')) return { stdout: '', stderr: '  \n', code: 1 };
      return { stdout: '2026-10-05', stderr: '', code: 0 };
    });
    fab.querySelector('#sp-save-fab')!.dispatchEvent(new Event('click'));
    await paint();

    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('sp_save_error', 'Failed to save'),
      expect.objectContaining({ icon: 'error', type: 'error' }),
    );
    expect(pageState.close).not.toHaveBeenCalled();
    expect(fab.querySelector('#sp-save-fab')?.hasAttribute('disabled')).toBe(false);
  });

  it('shows the fallback error when the save script throws or refresh fails', async () => {
    await openSecurityPatchPage();
    const cfg = config();
    mountItem(cfg, 0, 0, true);
    const fab = mountFab(cfg);
    await flushInitialLoad();

    spawnCommand.mockImplementation(async (command: string) => {
      if (command.includes('--set')) throw new Error('bridge down');
      return { stdout: '2026-10-05', stderr: '', code: 0 };
    });
    fab.querySelector('#sp-save-fab')!.dispatchEvent(new Event('click'));
    await paint();
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('sp_save_error', 'Failed to save'),
      expect.objectContaining({ type: 'error' }),
    );
    expect(pageState.close).not.toHaveBeenCalled();

    updateToast.mockClear();
    spawnCommand.mockImplementation(async (command: string) => {
      if (command.includes('refresh_desc.sh')) throw new Error('refresh down');
      return { stdout: '2026-10-05', stderr: '', code: 0 };
    });
    fab.querySelector('#sp-save-fab')!.dispatchEvent(new Event('click'));
    await paint();
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(),
      t('sp_save_error', 'Failed to save'),
      expect.objectContaining({ type: 'error' }),
    );
    expect(pageState.close).not.toHaveBeenCalled();
    expect(fab.querySelector('#sp-save-fab')?.hasAttribute('disabled')).toBe(false);
  });

  it('enables a pre-rendered save fab after loading', async () => {
    await openSecurityPatchPage();
    const fab = document.createElement('div');
    fab.id = 'sp-save-fab';
    fab.setAttribute('disabled', '');
    pageState.overlay!.append(fab);

    await flushInitialLoad();

    expect(fab.hasAttribute('disabled')).toBe(false);
  });

  it('keeps the save fab disabled when saving during the loading phase', async () => {
    await openSecurityPatchPage();
    const cfg = config();
    const fab = mountFab(cfg);
    await new Promise(resolve => setTimeout(resolve, 0));

    spawnCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    fab.querySelector('#sp-save-fab')!.dispatchEvent(new Event('click'));
    await paint();

    expect(spawnCommand.mock.calls.some(([command]) => String(command).includes('--set'))).toBe(true);
    expect(pageState.close).not.toHaveBeenCalled();
    expect(fab.querySelector('#sp-save-fab')?.hasAttribute('disabled')).toBe(true);

    await flushInitialLoad();
    expect(fab.querySelector('#sp-save-fab')?.hasAttribute('disabled')).toBe(false);
  });
});

describe('wireSecurityPatch', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    wireRowActivation.mockClear();
  });

  it('wires the security patch row when present', () => {
    const row = document.createElement('div');
    row.id = 'security-patch-btn';
    document.body.append(row);

    wireSecurityPatch();

    expect(wireRowActivation).toHaveBeenCalledWith(row, expect.any(Function));
  });

  it('does nothing when the row is absent', () => {
    wireSecurityPatch();

    expect(wireRowActivation).not.toHaveBeenCalled();
  });
});
