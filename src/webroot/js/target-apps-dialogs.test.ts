import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

const h = vi.hoisted(() => ({
  execImpl: async (_cmd: string): Promise<{ stdout: string; stderr: string; code: number }> =>
    ({ stdout: 'patch', stderr: '', code: 0 }),
  moduleDir: '/data/adb/modules/specter' as string | null,
  lastDialog: null as (HTMLElement & { close: ReturnType<typeof vi.fn> }) | null,
}));

const { exec, cfgSet, showToast, appendToOutput, showDialog } = vi.hoisted(() => ({
  exec: vi.fn((cmd: string) => h.execImpl(cmd)),
  cfgSet: vi.fn(),
  showToast: vi.fn(),
  appendToOutput: vi.fn(),
  showDialog: vi.fn((_title: string, body: string, actions: string) => {
    const el = document.createElement('div') as unknown as HTMLElement & { close: ReturnType<typeof vi.fn> };
    el.innerHTML = body + actions;
    el.close = vi.fn();
    document.body.appendChild(el);
    h.lastDialog = el;
    return el;
  }),
}));

vi.mock('./bridge.js', () => ({ exec, getModuleDir: () => h.moduleDir }));
vi.mock('./cfg.js', () => ({ cfgSet }));
vi.mock('./utils.js', () => ({
  shellEscape: (v: string) => `'${v}'`,
  escapeHtml: (v: string) => v,
}));
vi.mock('./toast.js', () => ({ showToast }));
vi.mock('./i18n.js', () => ({ t: (_key: string, fallback = '') => fallback }));
vi.mock('./terminal.js', () => ({ appendToOutput }));
vi.mock('./dialog.js', () => ({ showDialog }));

import { openModeDialog, openRegenerateDialog, openTeesimModeDialog } from './target-apps-dialogs.js';
import type { TargetDialogsContext } from './target-apps-dialogs.js';
import type { TargetApp } from './target-apps.js';

function makeCtx(apps: TargetApp[] = []): TargetDialogsContext & {
  setDefaultMode: Mock;
  applyFilters: Mock;
  refreshApps: Mock;
} {
  let mode = 'bare';
  return {
    apps,
    getDefaultMode: () => mode,
    setDefaultMode: vi.fn((next: string) => { mode = next; }),
    applyFilters: vi.fn(),
    refreshApps: vi.fn(async () => {}),
    loading: document.createElement('div'),
    list: document.createElement('div'),
  };
}

const click = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));
const segBtn = (root: HTMLElement, value: string) =>
  root.querySelector(`md-outlined-segmented-button[value="${value}"]`)!;

describe('target apps dialogs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    h.moduleDir = '/data/adb/modules/specter';
    h.lastDialog = null;
    h.execImpl = async () => ({ stdout: 'patch', stderr: '', code: 0 });
    vi.clearAllMocks();
    exec.mockImplementation((cmd: string) => h.execImpl(cmd));
  });

  it('mode dialog saves the picked default mode', async () => {
    const ctx = makeCtx();
    openModeDialog(ctx);
    const d = h.lastDialog!;

    click(segBtn(d, 'force'));
    click(d.querySelector('#ta-mode-apply')!);

    expect(ctx.setDefaultMode).toHaveBeenCalledWith('force');
    expect(cfgSet).toHaveBeenCalledWith('target_default_mode', 'force');
    expect(ctx.applyFilters).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Default mode saved', expect.objectContaining({ type: 'success' }));
    expect(d.close).toHaveBeenCalled();
  });

  it('mode dialog override rewrites every selected app and reports the count', async () => {
    const apps: TargetApp[] = [
      { packageName: 'a', appName: 'a', state: 'bare' },
      { packageName: 'b', appName: 'b', state: 'conditional' },
      { packageName: 'c', appName: 'c', state: 'unchecked' },
    ];
    const ctx = makeCtx(apps);
    openModeDialog(ctx);
    const d = h.lastDialog!;

    const sw = d.querySelector('#ta-mode-do-override') as HTMLElement & { selected: boolean };
    sw.selected = true;
    click(segBtn(d, 'conditional'));
    click(d.querySelector('#ta-mode-apply')!);

    expect(apps.map(a => a.state)).toEqual(['conditional', 'conditional', 'unchecked']);
    expect(ctx.applyFilters).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      'Default saved, 2 apps overridden', expect.objectContaining({ type: 'success' }));
  });

  it('regenerate dialog runs target.sh, refreshes and restores the list', async () => {
    const ctx = makeCtx();
    openRegenerateDialog(ctx);
    const d = h.lastDialog!;

    click(d.querySelector('#ta-regenerate-confirm')!);
    await vi.waitFor(() => expect(ctx.refreshApps).toHaveBeenCalled());

    expect(d.close).toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('features/target.sh'));
    expect(showToast).toHaveBeenCalledWith('Target list regenerated', expect.objectContaining({ type: 'success' }));
    expect(ctx.loading.style.display).toBe('none');
    expect(ctx.list.style.display).toBe('');
  });

  it('regenerate dialog logs failures and still restores the list', async () => {
    h.execImpl = async () => { throw new Error('no shell'); };
    const ctx = makeCtx();
    openRegenerateDialog(ctx);
    const d = h.lastDialog!;

    click(d.querySelector('#ta-regenerate-confirm')!);
    await vi.waitFor(() => {
      expect(appendToOutput).toHaveBeenCalledWith(expect.stringContaining('Regeneration failed'), true);
    });
    expect(ctx.refreshApps).not.toHaveBeenCalled();
    expect(ctx.loading.style.display).toBe('none');
    expect(ctx.list.style.display).toBe('');
  });

  it('teesim dialog reflects the current mode and applies a new one', async () => {
    h.execImpl = async (cmd: string) => cmd.includes('--get')
      ? { stdout: 'generation\n', stderr: '', code: 0 }
      : { stdout: '', stderr: '', code: 0 };
    openTeesimModeDialog();
    const d = h.lastDialog!;

    await vi.waitFor(() => {
      expect((segBtn(d, 'generation') as HTMLElement & { selected: boolean }).selected).toBe(true);
    });

    const patchBtn = segBtn(d, 'patch') as HTMLElement & { selected: boolean };
    patchBtn.selected = true;
    (segBtn(d, 'generation') as HTMLElement & { selected: boolean }).selected = false;
    click(d.querySelector('#ta-teesim-mode-apply')!);

    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Operation mode saved', expect.objectContaining({ type: 'success' }));
    });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining("--set 'patch'"));
    expect(d.close).toHaveBeenCalled();
  });

  it('teesim dialog surfaces set failures and stays open', async () => {
    h.execImpl = async (cmd: string) => cmd.includes('--get')
      ? { stdout: 'patch', stderr: '', code: 0 }
      : { stdout: '', stderr: 'mode locked', code: 1 };
    openTeesimModeDialog();
    const d = h.lastDialog!;

    click(d.querySelector('#ta-teesim-mode-apply')!);
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('mode locked', expect.objectContaining({ type: 'error' }));
    });
    expect(d.close).not.toHaveBeenCalled();
    expect((d.querySelector('#ta-teesim-mode-apply') as HTMLElement & { disabled: boolean }).disabled).toBe(false);
  });

  it('teesim dialog does nothing without a module dir', () => {
    h.moduleDir = null;
    openTeesimModeDialog();
    expect(showDialog).not.toHaveBeenCalled();
  });
});
