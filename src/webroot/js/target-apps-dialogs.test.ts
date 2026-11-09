import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

const h = vi.hoisted(() => ({
  execImpl: async (_cmd: string): Promise<{ stdout: string; stderr: string; code: number }> =>
    ({ stdout: 'patch', stderr: '', code: 0 }),
  moduleDir: '/data/adb/modules/specter' as string | null,
  lastDialog: null as (HTMLElement & { close: ReturnType<typeof vi.fn> }) | null,
}));

const { exec, spawnCommand, cfgSet, showToast, showLoadingToast, updateToast, appendToOutput, showDialog, openSubPage } = vi.hoisted(() => {
  const showToast = vi.fn();
  return {
    exec: vi.fn((cmd: string) => h.execImpl(cmd)),
    spawnCommand: vi.fn((cmd: string) => h.execImpl(cmd)),
    cfgSet: vi.fn(),
    showToast,
    showLoadingToast: vi.fn(() => document.createElement('div')),
    updateToast: vi.fn((_toast: HTMLElement, message: string, options?: unknown) => {
      showToast(message, options);
    }),
    appendToOutput: vi.fn(),
    showDialog: vi.fn((_title: string, body: string, actions: string) => {
      const el = document.createElement('div') as unknown as HTMLElement & { close: ReturnType<typeof vi.fn> };
      el.innerHTML = body + actions;
      el.close = vi.fn();
      document.body.appendChild(el);
      h.lastDialog = el;
      return el;
    }),
    openSubPage: vi.fn(async (_config: any) => ({
      overlay: document.createElement('div'),
      close: vi.fn(),
      isMasterEnabled: () => true,
    })),
  };
});

vi.mock('./bridge.js', () => ({
  exec,
  spawnCommand,
  getModuleDir: () => h.moduleDir,
}));
vi.mock('./cfg.js', () => ({ cfgSet }));
vi.mock('./utils.js', () => ({
  shellEscape: (v: string) => `'${v}'`,
  escapeHtml: (v: string) => v,
}));
vi.mock('./toast.js', () => ({ showToast, showLoadingToast, updateToast }));
vi.mock('./i18n.js', () => ({ t: (_key: string, fallback = '') => fallback }));
vi.mock('./terminal.js', () => ({ appendToOutput }));
vi.mock('./dialog.js', () => ({ showDialog }));
vi.mock('./subpage.js', () => ({ openSubPage }));

import { openModeDialog, openModeSubpage, openRegenerateDialog, openTeesimModeDialog } from './target-apps-dialogs.js';
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

  it('mode subpage registers radio items reflecting current mode and saves picked default mode', async () => {
    const ctx = makeCtx();
    await openModeDialog(ctx);

    expect(openSubPage).toHaveBeenCalledTimes(1);
    const config = openSubPage.mock.calls[0]![0];
    expect(config.id).toBe('target-default-mode');
    expect(config.title).toBe('Default Mode');
    expect(config.groups).toHaveLength(2);

    const radioItems = config.groups[0].items;
    expect(radioItems).toHaveLength(3);
    expect(radioItems[0]).toMatchObject({
      value: 'bare',
      selected: true,
      description: 'Auto-detect based on device TEE support',
    });
    expect(radioItems[1]).toMatchObject({
      value: 'conditional',
      selected: false,
      badge: '?',
      description: 'Patch leaf certificate from hardware TEE',
    });
    expect(radioItems[2]).toMatchObject({
      value: 'force',
      selected: false,
      badge: '!',
      description: 'Generate certificate chain from keybox',
    });

    radioItems[2].onSelect('force');
    expect(ctx.setDefaultMode).toHaveBeenCalledWith('force');
    expect(cfgSet).toHaveBeenCalledWith('target_default_mode', 'force');
    expect(ctx.applyFilters).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Default mode saved', expect.objectContaining({ type: 'success' }));
  });

  it('mode subpage override rewrites every selected app and reports the count', async () => {
    const apps: TargetApp[] = [
      { packageName: 'a', appName: 'a', state: 'bare' },
      { packageName: 'b', appName: 'b', state: 'conditional' },
      { packageName: 'c', appName: 'c', state: 'unchecked' },
    ];
    const ctx = makeCtx(apps);
    await openModeSubpage(ctx);

    const config = openSubPage.mock.calls[0]![0];
    const overrideItem = config.groups[1].items[0];
    expect(overrideItem.type).toBe('custom');

    const container = document.createElement('div');
    document.body.appendChild(container);
    overrideItem.render(container, () => true);

    const row = document.querySelector('sp-settings-row#ta-mode-override-row');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('variant')).toBe('action');

    ctx.setDefaultMode('conditional');
    row?.dispatchEvent(new CustomEvent('sp-activate', { bubbles: true, composed: true }));

    expect(apps.map(a => a.state)).toEqual(['conditional', 'conditional', 'unchecked']);
    expect(ctx.applyFilters).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      'Default saved, 2 apps overridden', expect.objectContaining({ type: 'success' }));
  });

  it('mode subpage onClose restores overlay state', async () => {
    const ctx = makeCtx();
    await openModeDialog(ctx);
    const config = openSubPage.mock.calls[0]![0];
    config.onClose();
    expect(window.isOverlayOpen).toBe(true);
    expect(document.documentElement.style.overflow).toBe('hidden');
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
    const apply = d.querySelector('#ta-teesim-mode-apply') as HTMLElement & { disabled: boolean };
    click(apply);
    expect(apply.disabled).toBe(true);
    expect(showLoadingToast).toHaveBeenCalledTimes(1);
    expect(updateToast).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Operation mode saved', expect.objectContaining({ type: 'success' }));
    });
    expect(spawnCommand).toHaveBeenCalledWith(expect.stringContaining("--set 'patch'"));
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(), 'Operation mode saved', expect.objectContaining({ type: 'success' }));
    expect(d.close).toHaveBeenCalled();
    expect(apply.disabled).toBe(false);
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
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(), 'mode locked', expect.objectContaining({ type: 'error' }));
    expect(d.close).not.toHaveBeenCalled();
    expect((d.querySelector('#ta-teesim-mode-apply') as HTMLElement & { disabled: boolean }).disabled).toBe(false);
  });

  it('teesim dialog does nothing without a module dir', () => {
    h.moduleDir = null;
    openTeesimModeDialog();
    expect(showDialog).not.toHaveBeenCalled();
  });

  it('mode subpage saves bare and conditional through their radio callbacks', async () => {
    const ctx = makeCtx();
    await openModeDialog(ctx);
    const radioItems = openSubPage.mock.calls[0]![0].groups[0].items;

    radioItems[0].onSelect('bare');
    expect(ctx.setDefaultMode).toHaveBeenLastCalledWith('bare');
    expect(cfgSet).toHaveBeenCalledWith('target_default_mode', 'bare');

    radioItems[1].onSelect('conditional');
    expect(ctx.setDefaultMode).toHaveBeenLastCalledWith('conditional');
    expect(cfgSet).toHaveBeenCalledWith('target_default_mode', 'conditional');
    expect(showToast).toHaveBeenCalledWith('Default mode saved', expect.objectContaining({ type: 'success' }));
  });

  it('mode override reports the plain save when no app is selected', async () => {
    const apps: TargetApp[] = [
      { packageName: 'a', appName: 'a', state: 'unchecked' },
      { packageName: 'b', appName: 'b', state: 'unchecked' },
    ];
    const ctx = makeCtx(apps);
    await openModeSubpage(ctx);

    const overrideItem = openSubPage.mock.calls[0]![0].groups[1].items[0];
    const container = document.createElement('div');
    document.body.appendChild(container);
    overrideItem.render(container, () => true);

    const row = document.querySelector('sp-settings-row#ta-mode-override-row')!;
    row.dispatchEvent(new CustomEvent('sp-activate', { bubbles: true, composed: true }));

    expect(apps.map(a => a.state)).toEqual(['unchecked', 'unchecked']);
    expect(ctx.applyFilters).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Default mode saved', expect.objectContaining({ type: 'success' }));
  });

  it('mode override also runs from a plain click when the row element is not upgraded', async () => {
    expect(customElements.get('sp-settings-row')).toBeUndefined();
    const apps: TargetApp[] = [{ packageName: 'a', appName: 'a', state: 'bare' }];
    const ctx = makeCtx(apps);
    await openModeSubpage(ctx);

    const overrideItem = openSubPage.mock.calls[0]![0].groups[1].items[0];
    const container = document.createElement('div');
    document.body.appendChild(container);
    overrideItem.render(container, () => true);

    click(document.querySelector('sp-settings-row#ta-mode-override-row')!);
    expect(apps[0]!.state).toBe('bare');
    expect(ctx.applyFilters).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      'Default saved, 1 apps overridden', expect.objectContaining({ type: 'success' }));
  });

  it('mode override ignores a plain click when the row element is upgraded', async () => {
    const getSpy = vi.spyOn(customElements, 'get').mockImplementation(() => class extends HTMLElement {});
    const ctx = makeCtx([{ packageName: 'a', appName: 'a', state: 'bare' }]);
    try {
      await openModeSubpage(ctx);
      const overrideItem = openSubPage.mock.calls[0]![0].groups[1].items[0];
      const container = document.createElement('div');
      document.body.appendChild(container);
      overrideItem.render(container, () => true);

      click(document.querySelector('sp-settings-row#ta-mode-override-row')!);
      expect(ctx.applyFilters).not.toHaveBeenCalled();
    } finally {
      getSpy.mockRestore();
    }
  });

  it('regenerate cancel closes the dialog without running the script', () => {
    const ctx = makeCtx();
    openRegenerateDialog(ctx);

    click(h.lastDialog!.querySelector('.dialog-action-close')!);
    expect(h.lastDialog!.close).toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it('teesim ignores a late mode read once the user has picked a value', async () => {
    let resolveGet!: (result: { stdout: string; stderr: string; code: number }) => void;
    h.execImpl = (cmd: string) => cmd.includes('--get')
      ? new Promise(resolve => { resolveGet = resolve; })
      : Promise.resolve({ stdout: '', stderr: '', code: 0 });
    openTeesimModeDialog();
    const d = h.lastDialog!;

    click(segBtn(d, 'generation'));
    resolveGet({ stdout: 'generation\n', stderr: '', code: 0 });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect((segBtn(d, 'generation') as HTMLElement & { selected?: boolean }).selected).toBeUndefined();
    expect(segBtn(d, 'patch').hasAttribute('selected')).toBe(true);
  });

  it('teesim ignores unknown mode output from the getter', async () => {
    h.execImpl = async (cmd: string) => cmd.includes('--get')
      ? { stdout: 'mystery\n', stderr: '', code: 0 }
      : { stdout: '', stderr: '', code: 0 };
    openTeesimModeDialog();
    const d = h.lastDialog!;

    await new Promise(resolve => setTimeout(resolve, 0));
    expect((segBtn(d, 'patch') as HTMLElement & { selected?: boolean }).selected).toBeUndefined();
    expect(segBtn(d, 'patch').hasAttribute('selected')).toBe(true);
    expect(segBtn(d, 'generation').hasAttribute('selected')).toBe(false);
  });

  it('teesim survives a failing getter and closes from the cancel button', async () => {
    h.execImpl = async (cmd: string) => {
      if (cmd.includes('--get')) throw new Error('no shell');
      return { stdout: '', stderr: '', code: 0 };
    };
    openTeesimModeDialog();
    const d = h.lastDialog!;

    await new Promise(resolve => setTimeout(resolve, 0));
    click(d.querySelector('.dialog-action-close')!);
    expect(d.close).toHaveBeenCalled();
  });

  it('teesim ignores Apply while the button is disabled', async () => {
    openTeesimModeDialog();
    const d = h.lastDialog!;
    const apply = d.querySelector('#ta-teesim-mode-apply') as HTMLElement & { disabled: boolean };
    apply.disabled = true;

    click(apply);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(spawnCommand.mock.calls.some(([cmd]) => String(cmd).includes('--set'))).toBe(false);
    expect(showLoadingToast).not.toHaveBeenCalled();
  });

  it('teesim falls back to patch when no segmented button is selected', async () => {
    openTeesimModeDialog();
    const d = h.lastDialog!;
    d.querySelectorAll('#ta-teesim-mode-set md-outlined-segmented-button').forEach(b => {
      (b as HTMLElement & { selected: boolean }).selected = false;
    });

    click(d.querySelector('#ta-teesim-mode-apply')!);
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Operation mode saved', expect.objectContaining({ type: 'success' }));
    });
    expect(spawnCommand).toHaveBeenCalledWith(expect.stringContaining("--set 'patch'"));
  });

  it('teesim shows a generic error when the failure has no stderr', async () => {
    h.execImpl = async (cmd: string) => cmd.includes('--get')
      ? { stdout: 'patch', stderr: '', code: 0 }
      : { stdout: '', stderr: '   ', code: 7 };
    openTeesimModeDialog();
    const d = h.lastDialog!;

    click(d.querySelector('#ta-teesim-mode-apply')!);
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Failed', expect.objectContaining({ type: 'error' }));
    });
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(), 'Failed', expect.objectContaining({ type: 'error' }));
    expect(d.close).not.toHaveBeenCalled();
    expect((d.querySelector('#ta-teesim-mode-apply') as HTMLElement & { disabled: boolean }).disabled).toBe(false);
  });

  it('teesim recovers when the set command rejects', async () => {
    h.execImpl = async (cmd: string) => {
      if (cmd.includes('--get')) return { stdout: 'patch', stderr: '', code: 0 };
      throw new Error('offline');
    };
    openTeesimModeDialog();
    const d = h.lastDialog!;

    click(d.querySelector('#ta-teesim-mode-apply')!);
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Failed', expect.objectContaining({ type: 'error' }));
    });
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(), 'Failed', expect.objectContaining({ type: 'error' }));
    expect(d.close).not.toHaveBeenCalled();
    expect((d.querySelector('#ta-teesim-mode-apply') as HTMLElement & { disabled: boolean }).disabled).toBe(false);
  });

  it('teesim paints themed segmented buttons and skips unknown or partial values', () => {
    const style = document.documentElement.style;
    style.setProperty('--md-sys-color-primary', '#123456');
    style.setProperty('--md-sys-color-on-primary', '#ffffff');
    style.setProperty('--md-sys-color-error', '#990000');
    style.setProperty('--md-sys-color-on-error', '#ffeeee');

    showDialog.mockImplementationOnce((_title: string, body: string, actions: string) => {
      const el = document.createElement('div') as unknown as HTMLElement & { close: ReturnType<typeof vi.fn> };
      el.innerHTML = body + actions;
      el.querySelector('#ta-teesim-mode-set')!.insertAdjacentHTML(
        'beforeend',
        '<md-outlined-segmented-button value="mystery"></md-outlined-segmented-button>' +
        '<md-outlined-segmented-button value="conditional"></md-outlined-segmented-button>' +
        '<md-outlined-segmented-button></md-outlined-segmented-button>',
      );
      el.close = vi.fn();
      document.body.appendChild(el);
      h.lastDialog = el;
      return el;
    });

    try {
      openTeesimModeDialog();
      const d = h.lastDialog!;
      const patch = segBtn(d, 'patch') as HTMLElement;
      expect(patch.classList.contains('segmented-flex')).toBe(true);
      expect(patch.style.getPropertyValue('--md-outlined-segmented-button-selected-container-color'))
        .toBe('#123456');
      expect(patch.style.getPropertyValue('--md-outlined-segmented-button-selected-label-text-color'))
        .toBe('#ffffff');

      const generation = segBtn(d, 'generation') as HTMLElement;
      expect(generation.style.getPropertyValue('--md-outlined-segmented-button-selected-container-color'))
        .toBe('#990000');

      const mystery = segBtn(d, 'mystery') as HTMLElement;
      expect(mystery.classList.contains('segmented-flex')).toBe(false);

      const conditional = segBtn(d, 'conditional') as HTMLElement;
      expect(conditional.classList.contains('segmented-flex')).toBe(false);

      const noValue = d.querySelector('md-outlined-segmented-button:not([value])') as HTMLElement;
      expect(noValue.classList.contains('segmented-flex')).toBe(false);
    } finally {
      for (const prop of [
        '--md-sys-color-primary', '--md-sys-color-on-primary',
        '--md-sys-color-error', '--md-sys-color-on-error',
      ]) style.removeProperty(prop);
    }
  });

  it('teesim skips painting when the foreground colour is missing', () => {
    const style = document.documentElement.style;
    style.setProperty('--md-sys-color-primary', '#123456');

    try {
      openTeesimModeDialog();
      const patch = segBtn(h.lastDialog!, 'patch') as HTMLElement;
      expect(patch.classList.contains('segmented-flex')).toBe(false);
      expect(patch.style.getPropertyValue('--md-outlined-segmented-button-selected-container-color'))
        .toBe('');
    } finally {
      style.removeProperty('--md-sys-color-primary');
    }
  });
});
