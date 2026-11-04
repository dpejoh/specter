import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openSubPage, fetchJson, runAction, refreshKeyboxStatus, exec } = vi.hoisted(() => ({
  openSubPage: vi.fn(async (config: {
    groups: { items: { type?: string; render?: (container: HTMLElement, isEnabled: () => boolean, posClass?: string) => void }[] }[];
  }) => {
    const overlay = document.createElement('div');
    const container = document.createElement('div');
    overlay.appendChild(container);
    for (const group of config.groups) {
      for (const item of group.items) {
        if (item.type === 'custom') item.render?.(container, () => true, '');
      }
    }
    return { overlay, close: vi.fn(), isMasterEnabled: () => true };
  }),
  fetchJson: vi.fn(),
  runAction: vi.fn(async () => 0),
  refreshKeyboxStatus: vi.fn(async () => {}),
  exec: vi.fn(async (_command: string) => ({ stdout: '', stderr: '', code: 0 })),
}));

vi.mock('./subpage.js', () => ({ openSubPage }));
vi.mock('./utils.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./utils.js')>();
  return { ...actual, fetchJson };
});
vi.mock('./actions.js', () => ({ runAction }));
vi.mock('./device.js', () => ({ refreshKeyboxStatus }));
vi.mock('./bridge.js', () => ({ exec, getModuleDir: () => '/data/adb/modules/specter' }));

import { openKeyboxCatalogPage } from './keybox-catalog-ui.js';

const CATALOG = {
  entries: [
    { source: 'TAKR', version: '36', text: 'v36', revoked: false, softbanned: false },
    { source: 'TAKR', version: '35', text: 'v35', revoked: false, softbanned: true },
    { source: 'TAKR', version: '34', text: 'v34', revoked: true, softbanned: false },
    { source: 'Yuri', version: '8', text: 'v8', revoked: false, softbanned: false },
    { source: 'rkp', version: '3', text: 'r3', revoked: false, softbanned: false, rkp: true, expires_at: '2000-01-01T00:00:00Z' },
    { source: 'rkp', version: '4', text: 'r4', revoked: false, softbanned: false, rkp: true, expires_at: '2999-01-01T00:00:00Z' },
  ],
};

describe('keybox catalog page', () => {
  beforeEach(() => {
    openSubPage.mockClear();
    fetchJson.mockReset();
    fetchJson.mockResolvedValue(CATALOG);
    runAction.mockClear();
    refreshKeyboxStatus.mockClear();
    exec.mockClear();
    exec.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
  });

  it('lists only active keyboxes and an automatic option', async () => {
    await openKeyboxCatalogPage();

    const config = openSubPage.mock.calls[0]![0] as unknown as {
      title: string;
    };
    const instance = await openSubPage.mock.results[0]!.value as { overlay: HTMLElement };
    const container = instance.overlay.firstElementChild as HTMLElement;

    expect(config.title).toBe('Install Keybox');

    const list = container.querySelector('#kb-catalog-list');
    const rows = list ? [...list.querySelectorAll('.list-item')] : [];
    const titles = rows.map(row => row.querySelector('.toggle-text')?.textContent?.trim());
    const chips = [...container.querySelectorAll('md-filter-chip')]
      .map(chip => (chip as HTMLElement & { label: string }).label);

    expect(titles).toHaveLength(4);
    expect(titles).toEqual(expect.arrayContaining([
      'Automatic Recommended',
      'TAKR v36',
      'Yuri v8',
      'rkp r4',
    ]));
    expect(chips).toEqual(expect.arrayContaining([
      'Active',
      'All (3)',
      'TAKR (1)',
      'Yuri (1)',
      'rkp (1)',
    ]));
  });

  it('shows inactive keyboxes when the Active filter is turned off', async () => {
    await openKeyboxCatalogPage();

    const instance = await openSubPage.mock.results[0]!.value as { overlay: HTMLElement };
    const container = instance.overlay.firstElementChild as HTMLElement;
    const activeChip = [...container.querySelectorAll('md-filter-chip')]
      .find(chip => (chip as HTMLElement & { label: string }).label === 'Active') as HTMLElement;

    activeChip.click();

    const rows = [...container.querySelectorAll('#kb-catalog-list .list-item')];
    const titles = rows.map(row => row.querySelector('.toggle-text')?.textContent?.trim());
    const chips = [...container.querySelectorAll('md-filter-chip')]
      .map(chip => (chip as HTMLElement & { label: string }).label);

    expect(rows).toHaveLength(7);
    expect(titles).toEqual(expect.arrayContaining([
      'Automatic Recommended',
      'TAKR v36',
      'TAKR v35',
      'TAKR v34',
      'Yuri v8',
      'rkp r3',
      'rkp r4',
    ]));
    expect(chips).toEqual(expect.arrayContaining([
      'All (6)',
      'TAKR (3)',
      'Yuri (1)',
      'rkp (2)',
    ]));
    const revoked = rows.find(row => row.querySelector('.toggle-text')?.textContent?.includes('TAKR v34'));
    expect(revoked?.classList.contains('kb-catalog-row--disabled')).toBe(true);
    expect(revoked?.querySelector('md-radio')?.hasAttribute('disabled')).toBe(true);
  });

  it('falls back to busybox wget when browser fetch is unavailable', async () => {
    fetchJson.mockResolvedValue(null);
    exec.mockResolvedValue({ stdout: JSON.stringify(CATALOG), stderr: '', code: 0 });

    await openKeyboxCatalogPage();

    const instance = await openSubPage.mock.results[0]!.value as { overlay: HTMLElement };
    const container = instance.overlay.firstElementChild as HTMLElement;
    const rows = container.querySelectorAll('#kb-catalog-list .list-item');

    expect(exec.mock.calls[0]![0]).toContain('busybox wget');
    expect(rows).toHaveLength(4);
  });
});
