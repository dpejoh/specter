import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  runScript: vi.fn(async () => ({ success: true, output: '', rawOutput: '' })),
  spawnScript: vi.fn(),
}));

vi.mock('./bridge.js', () => ({
  runScript: state.runScript,
  spawnScript: state.spawnScript,
}));

vi.mock('./utils.js', async () => {
  const actual = await vi.importActual<typeof import('./utils.js')>('./utils.js');
  return {
    ...actual,
    fetchJson: state.fetchJson,
  };
});

import { refreshKeyboxWatchInBackground } from './device.js';

beforeEach(() => {
  document.body.innerHTML = `
    <span id="keybox-name"></span>
    <span id="keybox-by"></span>
    <span id="keybox-source"></span>
    <span id="keybox-version"></span>
    <span id="keybox-status"></span>
    <span id="keybox-type"></span>
    <span id="kb-version-badge"></span>
  `;
  (window as any).ksu = { spawn: vi.fn() };
  (window as any).__keyboxInfoPromise = Promise.resolve({
    installed: true,
    source: 'provider',
    source_version: '1',
    serial: 'abcd1234',
    revoked: true,
    revocation_status: 'REVOKED',
  });
  state.fetchJson.mockReset();
  state.spawnScript.mockReset();
});

describe('background keybox watch', () => {
  it('spawns the watcher and re-reads the snapshot on exit', async () => {
    state.spawnScript.mockReturnValue({
      on(event: string, fn: () => void) {
        if (event === 'exit') setTimeout(fn, 0);
      },
    });

    const data = await refreshKeyboxWatchInBackground(0);

    expect(state.spawnScript).toHaveBeenCalledWith('keybox_watch.sh', 'feature', ['--fresh']);
    expect(data?.revoked).toBe(true);
    expect(document.getElementById('keybox-status')?.textContent).toBe('Revoked');
  });
});
