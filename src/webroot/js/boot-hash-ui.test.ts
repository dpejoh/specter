import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACTIVE = 'a1'.repeat(32);
const CACHED = 'b2'.repeat(32);
const SAVED = 'c3'.repeat(32);

const mocks = vi.hoisted(() => ({
  config: null as any,
  exec: vi.fn(async (command: string) => {
    if (command.startsWith('resetprop')) return { stdout: `${'a1'.repeat(32)}\n`, stderr: '', code: 0 };
    if (command.startsWith('cat /data/adb/specter/boot_hash')) return { stdout: `${'b2'.repeat(32)}\n`, stderr: '', code: 0 };
    return { stdout: '', stderr: '', code: 0 };
  }),
  cfgGet: vi.fn(async (key: string, fallback = '') => (key === 'custom_boot_hash' ? 'c3'.repeat(32) : fallback)),
  cfgSet: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('./subpage.js', () => ({
  openSubPage: vi.fn(async (config: any) => {
    mocks.config = config;
    return { overlay: document.createElement('div'), close: vi.fn(), isMasterEnabled: () => true };
  }),
}));
vi.mock('./bridge.js', () => ({
  exec: mocks.exec,
  getModuleDir: () => '/data/adb/modules/specter',
}));
vi.mock('./cfg.js', () => ({ cfgGet: mocks.cfgGet, cfgSet: mocks.cfgSet }));
vi.mock('./toast.js', () => ({ showToast: mocks.showToast }));

import { openBootHashSubpage } from './boot-hash-ui.js';
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

describe('boot hash subpage', () => {
  beforeEach(() => {
    mocks.config = null;
    mocks.exec.mockClear();
    mocks.cfgSet.mockClear();
    mocks.showToast.mockClear();
  });

  it('renders every card as an sp-settings-row with no legacy list items', async () => {
    await openBootHashSubpage();
    const section = renderAll();

    const rows = section.querySelectorAll('sp-settings-row');
    expect(rows).toHaveLength(3);
    expect(section.querySelector('.list-item')).toBeNull();

    const input = section.querySelector('#bh-input') as HTMLInputElement;
    expect(input.value).toBe(SAVED);
    expect(section.querySelector('#bh-active-val')?.textContent).toBe(ACTIVE);
    expect(section.querySelector('#bh-cache-val')?.textContent).toBe(CACHED);
    expect(section.querySelector('#bh-clear-cache-btn')?.hasAttribute('disabled')).toBe(false);
  });

  it('fills the custom hash with zeros from the zero button', async () => {
    await openBootHashSubpage();
    const section = renderAll();

    (section.querySelector('#bh-zero-btn') as HTMLElement).click();
    expect((section.querySelector('#bh-input') as HTMLInputElement).value).toBe('0'.repeat(64));
  });

  it('clears the cached hash and disables the clear button', async () => {
    await openBootHashSubpage();
    const section = renderAll();

    (section.querySelector('#bh-clear-cache-btn') as HTMLElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(section.querySelector('#bh-cache-val')?.textContent).toBe('None');
    expect(section.querySelector('#bh-clear-cache-btn')?.hasAttribute('disabled')).toBe(true);
    expect(mocks.exec.mock.calls.some(([cmd]) => String(cmd).includes('--clear-cache'))).toBe(true);
  });
});
