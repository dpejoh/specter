import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openBootHashSubpage } = vi.hoisted(() => ({
  openBootHashSubpage: vi.fn(async () => {}),
}));

// Every configurable page module fails to load. wireControlRows must swallow
// each rejection and keep wiring the boot-hash row.
vi.mock('./prop-handler-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./rom-fingerprint-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./adb-disabler-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./gms-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./action-security-patch-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./action-keybox-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./action-target-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./hma-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./auto-target-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./auto-hma-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./autopif-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./keybox-watch-ui.js', () => { throw new Error('module load failed'); });
vi.mock('./boot-hash-ui.js', () => ({ openBootHashSubpage }));

import { wireControlRows } from './control-ui.js';

describe('wireControlRows resilience', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="toggle-boot_hash-row"></div>';
    openBootHashSubpage.mockClear();
  });

  it('still wires the boot hash row when configurable page modules fail', async () => {
    await expect(wireControlRows()).resolves.toBeUndefined();

    const row = document.getElementById('toggle-boot_hash-row')!;
    expect(row.dataset.spWired).toBe('1');

    row.dispatchEvent(new Event('sp-activate'));
    await vi.waitFor(() => expect(openBootHashSubpage).toHaveBeenCalledTimes(1));
  });
});
