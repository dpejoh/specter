import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchJson, runAction, refreshKeyboxStatus, exec, openSubPage, cfgSet, cfgInvalidate } = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  runAction: vi.fn(async () => 0),
  refreshKeyboxStatus: vi.fn(async () => {}),
  exec: vi.fn(async (_command: string) => ({ stdout: '', stderr: '', code: 0 })),
  cfgSet: vi.fn(),
  cfgInvalidate: vi.fn(),
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
vi.mock('./cfg.js', () => ({ cfgSet, cfgInvalidate }));

import { mountKeyboxCatalog, openKeyboxCatalogPage } from './keybox-catalog-ui.js';

// The catalog uses md-radio as a plain container in tests (Material Web is not
// loaded here), so give it the value/checked properties updateRadios() uses.
if (!customElements.get('md-radio')) {
  class TestMdRadio extends HTMLElement {
    checked = false;
    get value(): string { return this.getAttribute('value') ?? ''; }
    set value(next: string) { this.setAttribute('value', next); }
  }
  customElements.define('md-radio', TestMdRadio);
}

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

const EDGE_CATALOG = {
  entries: [
    { source: 'Zeta', version: '10', text: '', revoked: false, softbanned: false, timestamp: '' },
    { source: 'Zeta', version: '9', revoked: false, softbanned: false, rkp: true, timestamp: '' },
    { source: 'Alpha', version: '2', text: 'a2', revoked: false, softbanned: false, rkp: true, expires_at: 'not-a-date', timestamp: '' },
    { source: 'Alpha', version: '1', text: 'a1', revoked: false, softbanned: false, timestamp: '' },
  ],
};

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function catalogRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('#kb-catalog-list sp-settings-row')];
}

function rowTitles(container: HTMLElement): string[] {
  return catalogRows(container).map(row => row.querySelector('[slot="headline"]')?.textContent?.trim() || '');
}

function rowByTitle(container: HTMLElement, title: string): HTMLElement | undefined {
  return catalogRows(container).find(row => row.querySelector('[slot="headline"]')?.textContent?.includes(title));
}

function rowDescription(container: HTMLElement, title: string): string {
  return rowByTitle(container, title)?.querySelector('[slot="supporting"]')?.textContent?.trim() || '';
}

function chooseFilter(container: HTMLElement, filterId: string, label: string) {
  const filter = container.querySelector(`[data-filter-id="${filterId}"]`) as HTMLElement;
  (filter.querySelector('.filter-trigger') as HTMLButtonElement).click();
  const option = [...filter.querySelectorAll<HTMLButtonElement>('.filter-option')]
    .find(item => item.querySelector('span')?.textContent?.trim() === label);
  option?.click();
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
    cfgSet.mockClear();
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

  it('reports install readiness through loading and selection', async () => {
    let release!: (value: unknown) => void;
    fetchJson.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const states: boolean[] = [];
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container, { onStateChange: value => states.push(value) });

    expect(states.at(-1)).toBe(false);
    expect(catalog.canInstall()).toBe(false);

    const loading = catalog.load();
    expect(states.at(-1)).toBe(false);
    await catalog.install();
    expect(runAction).not.toHaveBeenCalled();

    release(CATALOG);
    await loading;
    expect(catalog.canInstall()).toBe(true);
    expect(states.at(-1)).toBe(true);

    const target = rowByTitle(container, 'TAKR v36')!;
    target.dispatchEvent(new CustomEvent('sp-activate', { bubbles: true }));
    expect(target.querySelector('md-radio')?.checked).toBe(true);
    expect(catalog.canInstall()).toBe(true);

    const autoRadio = rowByTitle(container, 'Automatic')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    autoRadio.checked = true;
    autoRadio.dispatchEvent(new Event('change'));
    expect(autoRadio.checked).toBe(true);
    expect(catalog.canInstall()).toBe(true);
  });

  it('disables the refresh button and ignores duplicate loads while loading', async () => {
    let release!: (value: unknown) => void;
    fetchJson.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const refresh = document.createElement('button');
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container, { refreshButton: refresh });

    const first = catalog.load();
    expect(refresh.hasAttribute('disabled')).toBe(true);
    await catalog.load();
    expect(fetchJson).toHaveBeenCalledTimes(1);

    release(CATALOG);
    await first;

    expect(refresh.hasAttribute('disabled')).toBe(false);
    expect(rowTitles(container)).toHaveLength(4);
  });

  it('renders a retryable error when every download strategy fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchJson.mockResolvedValue(null);
    exec.mockResolvedValueOnce({ stdout: '', stderr: 'wget failed', code: 1 });
    exec.mockResolvedValueOnce({ stdout: '', stderr: '', code: 7 });

    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    expect(exec).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    const detail = String(warn.mock.calls[0]![1]);
    expect(detail).toContain('busybox wget');
    expect(detail).toContain('wget failed');
    expect(detail).toContain('curl');
    expect(detail).toContain('exit 7');
    expect(container.querySelector('.kb-catalog-status p')?.textContent)
      .toContain("Couldn't load available keyboxes");
    expect(catalog.canInstall()).toBe(false);

    fetchJson.mockResolvedValue(CATALOG);
    (container.querySelector('#kb-catalog-retry') as HTMLElement).click();
    await vi.waitFor(() => expect(rowTitles(container)).toHaveLength(4));

    warn.mockRestore();
  });

  it('logs every failed download strategy and recovers when a later one parses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchJson.mockResolvedValue(null);
    exec.mockRejectedValueOnce('network down');
    exec.mockResolvedValueOnce({ stdout: 'not json', stderr: '', code: 0 });

    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const detail = String(warn.mock.calls[0]![1]);
    expect(detail).toContain('network down');
    expect(detail).toContain('curl');

    exec.mockRejectedValueOnce(new Error('spawn failed'));
    exec.mockResolvedValueOnce({ stdout: JSON.stringify(CATALOG), stderr: '', code: 0 });
    await catalog.load();

    expect(rowTitles(container)).toHaveLength(4);
    warn.mockRestore();
  });

  it('rejects shell output that is JSON but not a keybox catalog', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchJson.mockResolvedValue(null);
    exec.mockResolvedValue({ stdout: '{"ok":true}', stderr: '', code: 0 });

    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const detail = String(warn.mock.calls[0]![1]);
    expect(detail.match(/response is not a keybox catalog/g)).toHaveLength(2);
    expect(container.querySelector('#kb-catalog-retry')).not.toBeNull();
    warn.mockRestore();
  });

  it('labels entries without text and handles missing or invalid expiry', async () => {
    fetchJson.mockResolvedValue(EDGE_CATALOG);
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    expect(rowTitles(container)).toEqual(['Automatic Recommended', 'Alpha a1', 'Zeta 10']);
    chooseFilter(container, 'kb-status-filter', 'All');
    expect(rowTitles(container)).toEqual([
      'Automatic Recommended',
      'Alpha a1',
      'Alpha a2',
      'Zeta 9',
      'Zeta 10',
    ]);
    expect(rowDescription(container, 'Alpha a1')).toBe('Active · Normal');
    expect(rowDescription(container, 'Alpha a2')).toBe('Expired · RKP · Expires not-a-date');
    expect(rowDescription(container, 'Zeta 9')).toBe('Expired · RKP');
    expect(rowByTitle(container, 'Zeta 9')?.classList.contains('kb-catalog-row--disabled')).toBe(true);
  });

  it('treats revoked as authoritative when filtering softbanned entries', async () => {
    fetchJson.mockResolvedValue({
      entries: [
        { source: 'Both', version: '1', text: 'both', revoked: true, softbanned: true, timestamp: '2026-01-01T00:00:00Z' },
        { source: 'Soft', version: '1', text: 'soft', revoked: false, softbanned: true, timestamp: '2026-01-02T00:00:00Z' },
      ],
    });
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    chooseFilter(container, 'kb-status-filter', 'Softbanned');
    expect(rowTitles(container)).toEqual(['Soft soft']);
    chooseFilter(container, 'kb-status-filter', 'Revoked');
    expect(rowTitles(container)).toEqual(['Both both']);
  });

  it('shows the active and general empty states and refuses to install', async () => {
    fetchJson.mockResolvedValue({
      entries: [
        { source: 'OnlyRevoked', version: '1', text: 'old', revoked: true, softbanned: false, timestamp: '2026-01-01T00:00:00Z' },
      ],
    });
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    expect(container.querySelector('.kb-catalog-status p')?.textContent)
      .toContain('No active keyboxes for this provider');
    expect(catalogRows(container)).toHaveLength(0);
    expect(catalog.canInstall()).toBe(false);

    await catalog.install();
    expect(runAction).not.toHaveBeenCalled();

    chooseFilter(container, 'kb-status-filter', 'Softbanned');
    expect(container.querySelector('.kb-catalog-status p')?.textContent)
      .toContain('No keyboxes available');
  });

  it('shows the provider in the automatic row and resets a stale provider filter', async () => {
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    chooseFilter(container, 'kb-provider-filter', 'TAKR');
    expect(rowTitles(container)).toEqual(['Automatic Recommended', 'TAKR v36']);
    expect(rowDescription(container, 'Automatic')).toContain('(TAKR)');

    fetchJson.mockResolvedValue({
      entries: [
        { source: 'Yuri', version: '8', text: 'v8', revoked: false, softbanned: false, timestamp: '2026-10-30T10:00:00Z' },
      ],
    });
    await catalog.load();

    const providerFilter = container.querySelector('[data-filter-id="kb-provider-filter"]') as HTMLElement;
    expect(providerFilter.querySelector('.filter-trigger-label')?.textContent).toBe('All providers');
    expect(rowTitles(container)).toContain('Yuri v8');
  });

  it('falls back to automatic when the selected entry is filtered out', async () => {
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const selected = rowByTitle(container, 'TAKR v36')!;
    selected.dispatchEvent(new CustomEvent('sp-activate', { bubbles: true }));
    chooseFilter(container, 'kb-provider-filter', 'Yuri');

    const autoRadio = rowByTitle(container, 'Automatic')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    expect(autoRadio.checked).toBe(true);
    expect(catalog.canInstall()).toBe(true);

    await catalog.install();
    expect(cfgSet).toHaveBeenCalledWith('keybox_provider', 'Yuri');
    expect(cfgSet).toHaveBeenCalledWith('keybox_select_source', '');
  });

  it('does not select disabled revoked rows', async () => {
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    chooseFilter(container, 'kb-status-filter', 'All');
    const revoked = rowByTitle(container, 'TAKR v34') as HTMLElement & { disabled: boolean };
    const radio = revoked.querySelector('md-radio') as HTMLElement & { checked: boolean };
    revoked.dispatchEvent(new CustomEvent('sp-activate', { bubbles: true }));

    expect(radio.checked).toBe(false);
    expect(revoked.disabled).toBe(true);
    expect(catalog.canInstall()).toBe(true);
  });

  it('installs the automatic selection when no provider is filtered', async () => {
    const onInstalled = vi.fn();
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container, { onInstalled });
    await catalog.load();

    await catalog.install();

    expect(cfgSet).toHaveBeenCalledWith('keybox_select_source', '');
    expect(cfgSet).toHaveBeenCalledWith('keybox_select_version', '');
    expect(cfgSet).toHaveBeenCalledWith('keybox_provider', 'auto');
    expect(onInstalled).toHaveBeenCalledTimes(1);
  });

  it('keeps the selection and catalog usable when an install fails', async () => {
    runAction.mockResolvedValueOnce(1);
    const onInstalled = vi.fn();
    const onInstallingChange = vi.fn();
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container, { onInstalled, onInstallingChange });
    await catalog.load();

    const row = rowByTitle(container, 'rkp r4')!;
    row.dispatchEvent(new CustomEvent('sp-activate', { bubbles: true }));
    const fetchCalls = fetchJson.mock.calls.length;

    await catalog.install();

    expect(onInstalled).not.toHaveBeenCalled();
    expect(onInstallingChange.mock.calls).toEqual([[true], [false]]);
    expect(fetchJson.mock.calls.length).toBe(fetchCalls);
    expect(catalog.canInstall()).toBe(true);
    expect(cfgSet).toHaveBeenCalledWith('keybox_select_source', '');
    expect(cfgSet).toHaveBeenCalledWith('keybox_select_version', '');
  });

  it('ignores a second install request while one is running', async () => {
    let release!: (code: number) => void;
    runAction.mockReturnValueOnce(new Promise<number>(resolve => { release = resolve; }));
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    const first = catalog.install();
    await catalog.install();
    expect(runAction).toHaveBeenCalledTimes(1);

    release(0);
    await first;
  });

  it('renders the catalog when keybox info cannot be read', async () => {
    fetchJson.mockImplementation((url: string) => url.includes('keybox_info')
      ? Promise.reject(new Error('offline'))
      : Promise.resolve(CATALOG));
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    expect(rowTitles(container)).toHaveLength(4);
    expect(container.textContent).not.toContain('Installed');

    fetchJson.mockImplementation((url: string) => url.includes('keybox_info')
      ? Promise.resolve({ installed: true })
      : Promise.resolve(CATALOG));
    await catalog.load();

    expect(rowTitles(container)).toHaveLength(4);
    expect(container.textContent).not.toContain('Installed');
  });

  it('shows the install busy state and closes the page after success', async () => {
    let release!: (code: number) => void;
    runAction.mockReturnValueOnce(new Promise<number>(resolve => { release = resolve; }));

    const pagePromise = openKeyboxCatalogPage();
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{
      overlay: HTMLElement;
      close: ReturnType<typeof vi.fn>;
    }>);
    await pagePromise;

    const button = instance.overlay.querySelector('#kb-catalog-install') as HTMLElement & { disabled: boolean };
    await vi.waitFor(() => expect(button.disabled).toBe(false));

    button.click();
    await vi.waitFor(() => expect(button.innerHTML).toContain('Installing…'));
    expect(button.disabled).toBe(true);
    expect(button.classList.contains('kb-install-btn--busy')).toBe(true);

    release(0);
    await vi.waitFor(() => expect(instance.close).toHaveBeenCalledTimes(1));
  });

  it('reloads the catalog from the header refresh button', async () => {
    await openKeyboxCatalogPage();
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>);
    await vi.waitFor(() => expect(rowTitles(instance.overlay)).toHaveLength(4));

    const calls = fetchJson.mock.calls.length;
    (instance.overlay.querySelector('#kb-catalog-refresh') as HTMLElement).click();

    await vi.waitFor(() => expect(fetchJson.mock.calls.length).toBeGreaterThan(calls));
  });

  it('closes the filter menus when the page closes', async () => {
    const pagePromise = openKeyboxCatalogPage();
    const config = openSubPage.mock.calls[0]![0] as unknown as { onClose?: () => void };
    const instance = await (openSubPage.mock.results[0]!.value as Promise<{ overlay: HTMLElement }>);
    await pagePromise;

    const trigger = instance.overlay.querySelector(
      '[data-filter-id="kb-status-filter"] .filter-trigger',
    ) as HTMLElement;
    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    config.onClose?.();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not mount the catalog when the subpage has no content', async () => {
    openSubPage.mockImplementationOnce(async () => ({
      overlay: document.createElement('div'),
      close: vi.fn(),
      isMasterEnabled: () => true,
    }));

    await openKeyboxCatalogPage();

    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('falls back to automatic when a reload drops the selected entry', async () => {
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    rowByTitle(container, 'TAKR v36')!.dispatchEvent(new CustomEvent('sp-activate', { bubbles: true }));

    fetchJson.mockResolvedValue({
      entries: [
        { source: 'Yuri', version: '8', text: 'v8', revoked: false, softbanned: false, timestamp: '2026-10-30T10:00:00Z' },
      ],
    });
    await catalog.load();

    const autoRadio = rowByTitle(container, 'Automatic')!.querySelector('md-radio') as HTMLElement & { checked: boolean };
    expect(autoRadio.checked).toBe(true);
    expect(catalog.canInstall()).toBe(true);
  });

  it('shows a retryable info status when the catalog has no entries', async () => {
    fetchJson.mockResolvedValue({ entries: [] });
    const container = makeContainer();
    const catalog = mountKeyboxCatalog(container);
    await catalog.load();

    expect(container.querySelector('.kb-catalog-status p')?.textContent)
      .toContain('No keyboxes available');
    expect(container.querySelector('#kb-catalog-retry')).not.toBeNull();
    expect(catalogRows(container)).toHaveLength(0);
    expect(catalog.canInstall()).toBe(false);
  });

  it('mounts the catalog without an install button when the page markup is incomplete', async () => {
    openSubPage.mockImplementationOnce(async (config: {
      groups: { items: { type?: string; render?: (container: HTMLElement, isEnabled: () => boolean, posClass?: string) => void }[] }[]
    }) => {
      const host = document.createElement('div');
      for (const group of config.groups) {
        for (const item of group.items) {
          if (item.type === 'custom') item.render?.(host, () => true, '');
        }
      }
      return { overlay: document.createElement('div'), close: vi.fn(), isMasterEnabled: () => true };
    });

    await openKeyboxCatalogPage();

    expect(fetchJson).toHaveBeenCalled();
  });
});
