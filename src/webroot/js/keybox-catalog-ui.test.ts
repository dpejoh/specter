import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchJson, runAction, refreshKeyboxStatus, exec, openSubPage } = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  runAction: vi.fn(async () => 0),
  refreshKeyboxStatus: vi.fn(async () => {}),
  exec: vi.fn(async (_command: string) => ({ stdout: '', stderr: '', code: 0 })),
  openSubPage: vi.fn((config: {
    headerAction?: (container: HTMLElement, instance: unknown) => void
    fab?: (container: HTMLElement, instance: unknown) => void
    groups: { items: { type?: string; render?: (container: HTMLElement, isEnabled: () => boolean, posClass?: string) => void }[] }[]
  }) => {
    const overlay = document.createElement('div');
    const host = document.createElement('div');
    overlay.appendChild(host);
    for (const group of config.groups) {
      for (const item of group.items) {
        if (item.type === 'custom') item.render?.(host, () => true, '');
      }
    }
    const instance = { overlay, close: vi.fn(), isMasterEnabled: () => true };
    const header = document.createElement('div');
    const fab = document.createElement('div');
    overlay.append(header, fab);
    config.headerAction?.(header, instance);
    config.fab?.(fab, instance);
    return Promise.resolve(instance);
  }),
}));

vi.mock('./utils.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./utils.js')>();
  return { ...actual, fetchJson };
});
vi.mock('./actions.js', () => ({ runAction }));
vi.mock('./device.js', () => ({ refreshKeyboxStatus }));
vi.mock('./bridge.js', () => ({ exec, getModuleDir: () => '/data/adb/modules/specter' }));
vi.mock('./subpage.js', () => ({ openSubPage }));

import { mountKeyboxCatalog, openKeyboxCatalogPage } from './keybox-catalog-ui.js';
import { cfgInvalidate, cfgSet } from './cfg.js';

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
  it('shows skeleton rows in a section while loading', async () => {
    let release!: (v: unknown) => void;
    fetchJson.mockReturnValue(new Promise(r => { release = r; }));
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    const loading = catalog.load();

    const section = container.querySelector('.kb-catalog-loading sp-settings-section');
    expect(section).not.toBeNull();
    expect(section!.getAttribute('aria-hidden')).toBe('true');
    const rows = section!.querySelectorAll('sp-settings-row.kb-skeleton-row');
    expect(rows).toHaveLength(3);
    // Rows must not be aria-hidden: the section treats those as filtered
    // out and would strip the grouped corners and gaps from the skeleton.
    for (const row of rows) expect(row.hasAttribute('aria-hidden')).toBe(false);
    expect(rows[0]!.querySelectorAll('sp-skeleton[variant="circular"]')).toHaveLength(2);
    expect(rows[0]!.querySelector('[slot="headline"] sp-skeleton')?.getAttribute('variant')).toBe('text');
    expect(rows[0]!.querySelector('[slot="supporting"] sp-skeleton')?.getAttribute('variant')).toBe('text');
    expect(container.querySelectorAll('.kb-catalog-loading > sp-skeleton')).toHaveLength(0);
    expect(container.querySelector('.kb-catalog-loading p')?.textContent).toContain('Loading keyboxes');

    release(CATALOG);
    await loading;
    expect(container.querySelector('.kb-catalog-loading')).toBeNull();
    expect(container.querySelector('#kb-catalog-list')).not.toBeNull();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    cfgInvalidate();
    fetchJson.mockReset();
    fetchJson.mockResolvedValue(CATALOG);
    runAction.mockClear();
    refreshKeyboxStatus.mockClear();
    exec.mockClear();
    openSubPage.mockClear();
    exec.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
  });

  it('lists only active keyboxes and an automatic option', async () => {
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const list = container.querySelector('#kb-catalog-list');
    const rows = list ? [...list.querySelectorAll('sp-settings-row')] : [];
    const titles = rows.map(row => row.querySelector('[slot="headline"]')?.textContent?.trim());
    const descriptions = rows.map(row => row.querySelector('[slot="supporting"]')?.textContent?.trim());

    const statusFilter = container.querySelector('[data-filter-id="kb-status-filter"]') as HTMLElement;
    const providerFilter = container.querySelector('[data-filter-id="kb-provider-filter"]') as HTMLElement;
    expect(statusFilter.querySelector('.filter-trigger-label')?.textContent).toBe('Active');
    expect(providerFilter.querySelector('.filter-trigger-label')?.textContent).toBe('All providers');

    (statusFilter.querySelector('.filter-trigger') as HTMLButtonElement).click();
    const statusLabels = [...statusFilter.querySelectorAll('.filter-option span')]
      .map(option => option.textContent?.trim());
    expect(statusLabels).toEqual(['Active', 'Softbanned', 'Revoked', 'All']);

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


  it('opens at All providers even when a provider is installed', async () => {
    cfgSet('keybox_provider', 'TAKR');
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const providerFilter = container.querySelector('[data-filter-id="kb-provider-filter"]') as HTMLElement;
    expect(providerFilter.querySelector('.filter-trigger-label')?.textContent).toBe('All providers');
    const sources = [...container.querySelectorAll('#kb-catalog-list sp-settings-row [slot="headline"]')]
      .map(el => el.textContent || '');
    expect(sources.some(text => text.includes('Yuri'))).toBe(true);
  })

  it('shows inactive keyboxes when the Active filter is turned off', async () => {
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const statusFilter = container.querySelector('[data-filter-id="kb-status-filter"]') as HTMLElement;
    (statusFilter.querySelector('.filter-trigger') as HTMLButtonElement).click();
    const allOption = [...statusFilter.querySelectorAll('.filter-option')]
      .find(option => option.querySelector('span')?.textContent?.trim() === 'All') as HTMLButtonElement;
    allOption.click();

    const rows = [...container.querySelectorAll('#kb-catalog-list sp-settings-row')];
    const titles = rows.map(row => row.querySelector('[slot="headline"]')?.textContent?.trim());

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
    const revoked = rows.find(row => row.querySelector('[slot="headline"]')?.textContent?.includes('TAKR v34'));
    expect(revoked?.classList.contains('kb-catalog-row--disabled')).toBe(true);
    expect(revoked?.querySelector('md-radio')?.hasAttribute('disabled')).toBe(true);
  });


  it('filters softbanned and revoked entries by status', async () => {
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const statusFilter = container.querySelector('[data-filter-id="kb-status-filter"]') as HTMLElement;
    const choose = (label: string) => {
      (statusFilter.querySelector('.filter-trigger') as HTMLButtonElement).click();
      const option = [...statusFilter.querySelectorAll('.filter-option')]
        .find(o => o.querySelector('span')?.textContent?.trim() === label) as HTMLButtonElement;
      option.click();
    };

    choose('Softbanned');
    expect([...container.querySelectorAll('#kb-catalog-list sp-settings-row [slot="headline"]')]
      .map(el => el.textContent?.trim())).toEqual(['TAKR v35']);

    choose('Revoked');
    expect([...container.querySelectorAll('#kb-catalog-list sp-settings-row [slot="headline"]')]
      .map(el => el.textContent?.trim())).toEqual(['TAKR v34']);

    choose('Active');
    expect([...container.querySelectorAll('#kb-catalog-list sp-settings-row [slot="headline"]')]
      .map(el => el.textContent?.trim())).toContain('TAKR v36');
  })

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

    const titles = [...container.querySelectorAll('#kb-catalog-list sp-settings-row')]
      .map(row => row.querySelector('[slot="headline"]')?.textContent?.trim());

    expect(providerFilter.querySelector('.filter-trigger-label')?.textContent).toBe('TAKR');
    expect(titles).toEqual(['Automatic Recommended', 'TAKR v36', 'TAKR v35', 'TAKR v34']);
  });

  it('falls back to busybox wget when browser fetch is unavailable', async () => {
    fetchJson.mockResolvedValue(null);
    exec.mockResolvedValue({ stdout: JSON.stringify(CATALOG), stderr: '', code: 0 });

    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const rows = container.querySelectorAll('#kb-catalog-list sp-settings-row');
    expect(exec.mock.calls[0]![0]).toContain('busybox wget');
    expect(rows).toHaveLength(4);
  });

  it('installs the selected catalog entry', async () => {
    const container = makeContainer();
    const onInstalled = vi.fn();
    const catalog = mountKeyboxCatalog(container, { onInstalled });
    await catalog.load();

    const row = [...container.querySelectorAll('#kb-catalog-list sp-settings-row')]
      .find(el => el.querySelector('[slot="headline"]')?.textContent?.includes('rkp r4')) as HTMLElement;
    row.dispatchEvent(new CustomEvent('sp-activate', { bubbles: true }));
    await catalog.install();

    expect(runAction).toHaveBeenCalledWith('keybox.sh', undefined, expect.objectContaining({ feedback: 'toast' }));
    expect(onInstalled).toHaveBeenCalled();
  });

  it('marks the installed entry on its row', async () => {
    fetchJson.mockImplementation((url: string) => Promise.resolve(
      url.includes('keybox_info')
        ? { installed: true, source: 'TAKR', source_version: '36' }
        : CATALOG,
    ));
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const titles = [...container.querySelectorAll('#kb-catalog-list sp-settings-row [slot="headline"]')]
      .map(el => el.textContent?.trim());
    expect(titles).toContain('TAKR v36 Installed');
    expect(titles).not.toContain('Yuri v8 Installed');
  });

  it('reports installing state around an install', async () => {
    const onInstallingChange = vi.fn();
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container, { onInstallingChange });
    await catalog.load();

    const row = [...container.querySelectorAll('#kb-catalog-list sp-settings-row')]
      .find(el => el.querySelector('[slot="headline"]')?.textContent?.includes('rkp r4')) as HTMLElement;
    row.dispatchEvent(new CustomEvent('sp-activate', { bubbles: true }));
    await catalog.install();

    expect(onInstallingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('opens the remote catalog page and mounts the catalog', async () => {
    await openKeyboxCatalogPage();

    const config = openSubPage.mock.calls[0]![0] as unknown as { title: string };
    expect(config.title).toBe('Specter keyboxes');

    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>);
    const container = instance.overlay;
    expect(container.querySelector('#kb-catalog-filters')).not.toBeNull();

    await vi.waitFor(() => {
      expect(container.querySelectorAll('#kb-catalog-list sp-settings-row')).toHaveLength(4);
    });
  });
});
