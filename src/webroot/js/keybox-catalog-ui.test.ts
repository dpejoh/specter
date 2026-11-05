import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchJson, runAction, refreshKeyboxStatus, exec } = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  runAction: vi.fn(async () => 0),
  refreshKeyboxStatus: vi.fn(async () => {}),
  exec: vi.fn(async (_command: string) => ({ stdout: '', stderr: '', code: 0 })),
}));

vi.mock('./utils.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./utils.js')>();
  return { ...actual, fetchJson };
});
vi.mock('./actions.js', () => ({ runAction }));
vi.mock('./device.js', () => ({ refreshKeyboxStatus }));
vi.mock('./bridge.js', () => ({ exec, getModuleDir: () => '/data/adb/modules/specter' }));

import { mountKeyboxCatalog } from './keybox-catalog-ui.js';
import { cfgInvalidate } from './cfg.js';

const CATALOG = {
  entries: [
    { source: 'TAKR', version: '36', text: 'v36', revoked: false, softbanned: false, timestamp: '2026-11-03T10:00:00Z' },
    { source: 'TAKR', version: '35', text: 'v35', revoked: false, softbanned: true, timestamp: '2026-11-02T10:00:00Z' },
    { source: 'TAKR', version: '34', text: 'v34', revoked: true, softbanned: false, timestamp: '2026-11-01T10:00:00Z' },
    { source: 'Yuri', version: '8', text: 'v8', revoked: false, softbanned: false, timestamp: '2026-10-30T10:00:00Z' },
    { source: 'rkp', version: '3', text: 'r3', revoked: false, softbanned: false, rkp: true, expires_at: '2000-01-01T00:00:00Z', timestamp: '2026-10-29T10:00:00Z' },
    { source: 'rkp', version: '4', text: 'r4', revoked: false, softbanned: false, rkp: true, expires_at: '2999-01-01T00:00:00Z', timestamp: '2026-11-04T10:00:00Z' },
  ],
};

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

describe('keybox catalog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    cfgInvalidate();
    fetchJson.mockReset();
    fetchJson.mockResolvedValue(CATALOG);
    runAction.mockClear();
    refreshKeyboxStatus.mockClear();
    exec.mockClear();
    exec.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
  });

  it('lists only active keyboxes and an automatic option', async () => {
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const list = container.querySelector('#kb-catalog-list');
    const rows = list ? [...list.querySelectorAll('.list-item')] : [];
    const titles = rows.map(row => row.querySelector('.toggle-text')?.textContent?.trim());
    const descriptions = rows.map(row => row.querySelector('.supporting-text')?.textContent?.trim());

    const statusFilter = container.querySelector('[data-filter-id="kb-status-filter"]') as HTMLElement;
    const providerFilter = container.querySelector('[data-filter-id="kb-provider-filter"]') as HTMLElement;
    expect(statusFilter.querySelector('.filter-trigger-label')?.textContent).toBe('Active');
    expect(providerFilter.querySelector('.filter-trigger-label')?.textContent).toBe('All providers');

    (statusFilter.querySelector('.filter-trigger') as HTMLButtonElement).click();
    const statusLabels = [...statusFilter.querySelectorAll('.filter-option span')]
      .map(option => option.textContent?.trim());
    expect(statusLabels).toEqual(['Active', 'All']);

    (providerFilter.querySelector('.filter-trigger') as HTMLButtonElement).click();
    const providerLabels = [...providerFilter.querySelectorAll('.filter-option span')]
      .map(option => option.textContent?.trim());
    expect(providerLabels).toEqual(['All providers', 'TAKR', 'Yuri', 'rkp']);

    expect(titles).toHaveLength(4);
    expect(titles).toEqual([
      'Automatic Recommended',
      'rkp r4',
      'TAKR v36',
      'Yuri v8',
    ]);
    expect(descriptions[2]).toContain('Normal');
    expect(descriptions[1]).toContain('RKP');
  });

  it('shows inactive keyboxes when the Active filter is turned off', async () => {
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const statusFilter = container.querySelector('[data-filter-id="kb-status-filter"]') as HTMLElement;
    (statusFilter.querySelector('.filter-trigger') as HTMLButtonElement).click();
    const allOption = [...statusFilter.querySelectorAll('.filter-option')]
      .find(option => option.querySelector('span')?.textContent?.trim() === 'All') as HTMLButtonElement;
    allOption.click();

    const rows = [...container.querySelectorAll('#kb-catalog-list .list-item')];
    const titles = rows.map(row => row.querySelector('.toggle-text')?.textContent?.trim());

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
    const revoked = rows.find(row => row.querySelector('.toggle-text')?.textContent?.includes('TAKR v34'));
    expect(revoked?.classList.contains('kb-catalog-row--disabled')).toBe(true);
    expect(revoked?.querySelector('md-radio')?.hasAttribute('disabled')).toBe(true);
  });

  it('filters by provider independently of status', async () => {
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const statusFilter = container.querySelector('[data-filter-id="kb-status-filter"]') as HTMLElement;
    (statusFilter.querySelector('.filter-trigger') as HTMLButtonElement).click();
    const allOption = [...statusFilter.querySelectorAll('.filter-option')]
      .find(option => option.querySelector('span')?.textContent?.trim() === 'All') as HTMLButtonElement;
    allOption.click();

    const providerFilter = container.querySelector('[data-filter-id="kb-provider-filter"]') as HTMLElement;
    (providerFilter.querySelector('.filter-trigger') as HTMLButtonElement).click();
    const takrOption = [...providerFilter.querySelectorAll('.filter-option')]
      .find(option => option.querySelector('span')?.textContent?.trim() === 'TAKR') as HTMLButtonElement;
    takrOption.click();

    const titles = [...container.querySelectorAll('#kb-catalog-list .list-item')]
      .map(row => row.querySelector('.toggle-text')?.textContent?.trim());

    expect(providerFilter.querySelector('.filter-trigger-label')?.textContent).toBe('TAKR');
    expect(titles).toEqual(['Automatic Recommended', 'TAKR v36', 'TAKR v35', 'TAKR v34']);
  });

  it('falls back to busybox wget when browser fetch is unavailable', async () => {
    fetchJson.mockResolvedValue(null);
    exec.mockResolvedValue({ stdout: JSON.stringify(CATALOG), stderr: '', code: 0 });

    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const rows = container.querySelectorAll('#kb-catalog-list .list-item');
    expect(exec.mock.calls[0]![0]).toContain('busybox wget');
    expect(rows).toHaveLength(4);
  });

  it('installs the selected catalog entry', async () => {
    const container = makeContainer();
    const onInstalled = vi.fn();
    const catalog = mountKeyboxCatalog(container, { onInstalled });
    await catalog.load();

    const row = [...container.querySelectorAll('#kb-catalog-list .list-item')]
      .find(el => el.querySelector('.toggle-text')?.textContent?.includes('rkp r4')) as HTMLElement;
    row.click();
    await catalog.install();

    expect(runAction).toHaveBeenCalledWith('keybox.sh');
    expect(onInstalled).toHaveBeenCalled();
  });
});
