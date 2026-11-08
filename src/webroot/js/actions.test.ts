import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeChild {
  stdout: { on: (ev: string, cb: (line: string) => void) => void };
  stderr: { on: (ev: string, cb: (line: string) => void) => void };
  on: (ev: string, cb: (arg: never) => void) => void;
  emitOut: (line: string) => void;
  emitErr: (line: string) => void;
  emitExit: (code: number) => void;
  emitError: (err: Error) => void;
}

function makeChild(): FakeChild {
  const handlers = new Map<string, Array<(arg: never) => void>>();
  const on = (ev: string, cb: (arg: never) => void) => {
    handlers.set(ev, [...(handlers.get(ev) || []), cb]);
  };
  const emit = (ev: string, arg: never) => {
    for (const cb of handlers.get(ev) || []) cb(arg);
  };
  return {
    stdout: { on: (ev, cb) => on('out:' + ev, cb as (arg: never) => void) },
    stderr: { on: (ev, cb) => on('err:' + ev, cb as (arg: never) => void) },
    on,
    emitOut: line => emit('out:data', line as never),
    emitErr: line => emit('err:data', line as never),
    emitExit: code => emit('exit', code as never),
    emitError: err => emit('error', err as never),
  };
}

const h = vi.hoisted(() => ({
  children: [] as FakeChild[],
  confirmResult: true,
}));

const {
  spawnScript, appendToOutput, showToast, showLoadingToast, updateToast, showConfirm, showErrorDialog,
  addEntry, setFriendlyNames, refreshControlToggles,
} = vi.hoisted(() => ({
  spawnScript: vi.fn(() => {
    const child = (globalThis as { __makeChild?: () => FakeChild }).__makeChild!();
    h.children.push(child);
    return child;
  }),
  appendToOutput: vi.fn(),
  showToast: vi.fn(),
  showLoadingToast: vi.fn(() => ({})),
  updateToast: vi.fn(),
  showConfirm: vi.fn(async () => h.confirmResult),
  showErrorDialog: vi.fn(),
  addEntry: vi.fn(),
  setFriendlyNames: vi.fn(),
  refreshControlToggles: vi.fn(async () => {}),
}));

(globalThis as { __makeChild?: () => FakeChild }).__makeChild = makeChild;

vi.mock('./bridge.js', () => ({ spawnScript }));
vi.mock('./terminal.js', () => ({ appendToOutput }));
vi.mock('./toast.js', () => ({ showToast, showLoadingToast, updateToast }));
vi.mock('./dialog.js', () => ({ showConfirm, showErrorDialog }));
vi.mock('./history.js', () => ({ addEntry }));
vi.mock('./utils.js', () => ({
  setFriendlyNames,
  getFriendlyName: (script: string) => `name_${script}`,
}));
vi.mock('./i18n.js', () => ({ getTranslation: () => '' }));
vi.mock('./toggles.js', () => ({ refreshControlToggles }));

import { runAction, wireActions, buildFriendlyNames } from './actions.js';
import './ui/sp-settings-row.js';

function setupProgressDialog() {
  document.body.innerHTML = `
    <div id="progress-dialog"></div>
    <div id="progress-label"></div>
    <div id="progress-text"></div>
  `;
  const dialog = document.getElementById('progress-dialog') as HTMLElement & {
    show: () => void; close: () => void;
  };
  dialog.show = vi.fn();
  dialog.close = vi.fn();
  return dialog;
}

describe('actions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    h.children = [];
    h.confirmResult = true;
    vi.clearAllMocks();
    spawnScript.mockImplementation(() => {
      const child = makeChild();
      h.children.push(child);
      return child;
    });
    showConfirm.mockImplementation(async () => h.confirmResult);
  });

  it('runs a script, streams output and resolves with the exit code', async () => {
    const dialog = setupProgressDialog();
    const promise = runAction('keybox.sh');
    await vi.waitFor(() => expect(h.children).toHaveLength(1));

    expect(document.getElementById('progress-label')?.textContent).toBe('name_keybox.sh');
    expect(dialog.show).toHaveBeenCalled();

    const child = h.children[0]!;
    child.emitOut('working');
    child.emitErr('a warning');
    child.emitExit(0);

    await expect(promise).resolves.toBe(0);
    expect(addEntry).toHaveBeenCalledWith('keybox.sh', 'working\n[!] a warning', 0);
    expect(showToast).toHaveBeenCalledWith('Done', expect.objectContaining({ type: 'success' }));
  });

  it('toast feedback: no dialog, one loading toast morphs into the result', async () => {
    const dialog = setupProgressDialog();
    const promise = runAction('keybox.sh', undefined, {
      feedback: 'toast',
      loadingLabel: 'Installing keybox…',
      successLabel: 'TAKR v36 · Installed',
    });
    await vi.waitFor(() => expect(h.children).toHaveLength(1));

    expect(dialog.show).not.toHaveBeenCalled();
    expect(showLoadingToast).toHaveBeenCalledWith('Installing keybox…');
    const loadingToast = showLoadingToast.mock.results[0]!.value;

    h.children[0]!.emitExit(0);
    await expect(promise).resolves.toBe(0);
    expect(updateToast).toHaveBeenCalledWith(
      loadingToast, 'TAKR v36 · Installed', expect.objectContaining({ type: 'success' }));
    expect(showToast).not.toHaveBeenCalled();
  });

  it('toast feedback: failure morphs the loading toast into an error with details', async () => {
    setupProgressDialog();
    const promise = runAction('keybox.sh', undefined, { feedback: 'toast', loadingLabel: 'Installing keybox…' });
    await vi.waitFor(() => expect(h.children).toHaveLength(1));

    const child = h.children[0]!;
    child.emitOut('Error: download failed');
    child.emitExit(1);

    await expect(promise).resolves.toBe(1);
    expect(updateToast).toHaveBeenCalledWith(
      expect.anything(), expect.stringContaining('Error: download failed'),
      expect.objectContaining({ type: 'error', action: 'View Details' }));
    const toastOpts = updateToast.mock.calls[0]![2] as { onActionClick: () => void };
    toastOpts.onActionClick();
    expect(showErrorDialog).toHaveBeenCalledWith('Error Details', 'Error: download failed');
  });

  it('reports failures with the first error line and offers details', async () => {
    setupProgressDialog();
    const promise = runAction('target.sh');
    await vi.waitFor(() => expect(h.children).toHaveLength(1));

    const child = h.children[0]!;
    child.emitOut('step one');
    child.emitOut('Error: mount failed');
    child.emitExit(3);

    await expect(promise).resolves.toBe(3);
    expect(addEntry).toHaveBeenCalledWith('target.sh', 'step one\nError: mount failed', 3);
    const toastOpts = showToast.mock.calls[0]![1] as { onActionClick: () => void };
    expect(showToast.mock.calls[0]![0]).toContain('Error: mount failed');
    toastOpts.onActionClick();
    expect(showErrorDialog).toHaveBeenCalledWith('Error Details', 'step one\nError: mount failed');
  });

  it('resolves 1 when the spawn itself errors', async () => {
    setupProgressDialog();
    const promise = runAction('gms.sh');
    await vi.waitFor(() => expect(h.children).toHaveLength(1));

    h.children[0]!.emitError(new Error('spawn blew up'));
    await expect(promise).resolves.toBe(1);
    expect(addEntry).toHaveBeenCalledWith('gms.sh', 'spawn blew up', 1);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('name_gms.sh'), expect.objectContaining({ type: 'error' }));
  });

  it('serializes concurrent actions through the chain', async () => {
    setupProgressDialog();
    const first = runAction('one.sh');
    const second = runAction('two.sh');
    await new Promise(r => setTimeout(r, 10));
    expect(h.children).toHaveLength(1);

    h.children[0]!.emitExit(0);
    await first;
    await vi.waitFor(() => expect(h.children).toHaveLength(2));
    h.children[1]!.emitExit(0);
    await expect(second).resolves.toBe(0);
  });

  it('wires sp-settings-row actions via sp-activate and honors disabled', async () => {
    setupProgressDialog();
    const row = document.createElement('sp-settings-row');
    row.dataset.script = 'keybox.sh';
    document.body.appendChild(row);
    wireActions();

    row.dispatchEvent(new Event('sp-activate'));
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    h.children[0]!.emitExit(0);
    await vi.waitFor(() => expect((row as HTMLElement & { disabled: boolean }).disabled).toBe(false));

    (row as HTMLElement & { disabled: boolean }).disabled = true;
    row.dispatchEvent(new Event('sp-activate'));
    await new Promise(r => setTimeout(r, 10));
    expect(h.children).toHaveLength(1);
  });

  it('asks for confirmation before destructive rows and can abort', async () => {
    setupProgressDialog();
    const row = document.createElement('sp-settings-row') as HTMLElement & {
      disabled: boolean; loading: boolean;
    };
    row.dataset.script = 'wipe.sh';
    row.setAttribute('data-destructive', '');
    document.body.appendChild(row);
    wireActions();

    h.confirmResult = false;
    row.dispatchEvent(new Event('sp-activate'));
    await new Promise(r => setTimeout(r, 10));
    expect(showConfirm).toHaveBeenCalledWith('name_wipe.sh', expect.any(String), { variant: 'danger' });
    expect(h.children).toHaveLength(0);

    h.confirmResult = true;
    row.dispatchEvent(new Event('sp-activate'));
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    expect(row.loading).toBe(true);
    h.children[0]!.emitExit(0);
    await vi.waitFor(() => expect(row.loading).toBe(false));
  });

  it('refreshes control toggles after restore_defaults.sh', async () => {
    setupProgressDialog();
    const row = document.createElement('sp-settings-row');
    row.dataset.script = 'restore_defaults.sh';
    document.body.appendChild(row);
    wireActions();

    row.dispatchEvent(new Event('sp-activate'));
    await vi.waitFor(() => expect(h.children).toHaveLength(1));
    h.children[0]!.emitExit(0);
    await vi.waitFor(() => expect(refreshControlToggles).toHaveBeenCalled());
  });

  it('builds the friendly-name map from data-i18n elements', () => {
    document.body.innerHTML = `
      <div data-script="keybox.sh">
        <span data-i18n="act_keybox"></span>
        <span data-i18n="act_keybox_desc"></span>
      </div>
      <div data-script="bare.sh"></div>`;
    buildFriendlyNames();
    expect(setFriendlyNames).toHaveBeenCalledWith({
      'keybox.sh': 'act_keybox',
      'keybox.sh_desc': 'act_keybox_desc',
    });
  });
});
