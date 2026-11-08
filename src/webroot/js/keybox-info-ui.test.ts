import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyboxInfoJson } from './types.js';

const state = vi.hoisted(() => ({
  host: null as HTMLElement | null,
  header: null as HTMLElement | null,
  close: vi.fn(),
  keybox: null as KeyboxInfoJson | null,
  watch: vi.fn(),
  openCatalog: vi.fn(),
}));

vi.mock('./keybox-catalog-ui.js', () => ({
  openKeyboxCatalogPage: state.openCatalog,
}));

vi.mock('./subpage.js', () => ({
  openSubPage: vi.fn(async (config: any) => {
    const header = document.createElement('div');
    state.header = header;
    config.headerAction?.(header, {
      overlay: document.createElement('div'),
      close: state.close,
      isMasterEnabled: () => true,
    });
    const host = document.createElement('div');
    state.host = host;
    config.groups[0].items[0].render(host, () => true);
    return { overlay: host, close: state.close, isMasterEnabled: () => true };
  }),
}));

vi.mock('./device.js', () => ({
  refreshKeyboxStatus: vi.fn(async () => state.keybox),
  refreshKeyboxWatch: state.watch,
}));

vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils.js')>();
  return {
    ...actual,
    // Run the paint callback on the next tick so the load still starts
    // strictly after the page render the subpage mock performs.
    afterPaint: (fn: () => void) => { setTimeout(fn, 0); },
  };
});

import { openKeyboxInfoPage } from './keybox-info-ui.js';

const activeKeybox: KeyboxInfoJson = {
  installed: true,
  cert_validity: 'valid',
  source: 'TAKR',
  source_version: '36',
  text: '36',
  latest_version: '36',
  up_to_date: true,
  serial: 'abc123',
  rkp: true,
  expires_at: '2027-01-01T00:00:00Z',
  checked_at: '2026-11-06T10:00:00Z',
  revocation_status: '',
  revocation_reason: '',
  file_path: '/data/adb/tricky_store/keybox.xml',
  file_size: 4096,
  file_modified: '2026-11-05T10:00:00Z',
};

function rows(): { label: string; value: string; mono: boolean; copyable: boolean; classes: string }[] {
  return [...(state.host?.querySelectorAll('sp-settings-row') ?? [])].map(row => ({
    label: row.getAttribute('headline') || '',
    value: row.getAttribute('supporting-text') || '',
    mono: row.hasAttribute('mono'),
    copyable: row.hasAttribute('copyable'),
    classes: row.className,
  }));
}

function sectionLabels(): string[] {
  return [...(state.host?.querySelectorAll('sp-settings-section') ?? [])]
    .map(section => section.getAttribute('label') || '');
}

function row(label: string) {
  return rows().find(entry => entry.label === label);
}

describe('keybox details page', () => {
  beforeEach(() => {
    state.host = null;
    state.header = null;
    state.close.mockClear();
    state.watch.mockReset();
    document.body.innerHTML = '';
  });

  it('does not mark certificates with unknown validity as active', async () => {
    state.keybox = { ...activeKeybox, cert_validity: 'unknown' };
    state.watch.mockResolvedValue(state.keybox);
    await openKeyboxInfoPage();
    expect(row('Status')?.value).toBe('Certificate validity unknown');
  });

  it('reports certificates that are not yet valid', async () => {
    state.keybox = { ...activeKeybox, expired: true, cert_validity: 'not_yet_valid' };
    state.watch.mockResolvedValue(state.keybox);
    await openKeyboxInfoPage();
    expect(row('Status')?.value).toBe('Not yet valid');
  });

  it('groups identity, health, updates, certificate, and installation', async () => {
    state.keybox = activeKeybox;
    state.watch.mockResolvedValue(activeKeybox);

    await openKeyboxInfoPage();

    expect(sectionLabels()).toEqual(['Health', 'Keybox']);
    expect(row('Provider')).toMatchObject({ value: 'TAKR' });
    expect(row('Installed version')).toMatchObject({ value: '36', mono: true });
    expect(row('Type')).toMatchObject({ value: 'RKP' });
    expect(row('Status')).toMatchObject({ value: 'Active' });
    expect(row('Serial')).toMatchObject({ value: 'abc123', mono: true, copyable: true });
    expect(row('File')).toMatchObject({ value: '/data/adb/tricky_store/keybox.xml', copyable: true });
    expect(state.host?.querySelector('#keybox-info-install')).toBeNull();
  });

  it('shows one health status instead of a separate revocation row', async () => {
    state.keybox = activeKeybox;
    state.watch.mockResolvedValue(activeKeybox);

    await openKeyboxInfoPage();

    expect(row('Status')?.value).toBe('Active');
    expect(row('Revocation')).toBeUndefined();
    expect(row('Not revoked')).toBeUndefined();
    expect(state.host?.textContent).not.toContain('Not revoked');
  });

  it('shows the revocation reason and source under Health', async () => {
    state.keybox = {
      ...activeKeybox,
      revoked: true,
      revocation_status: 'REVOKED',
      revocation_reason: 'KEY_COMPROMISE',
      revocation_source: 'Google',
      revocation_checked_at: '2026-11-06T10:00:00Z',
    };
    state.watch.mockResolvedValue(state.keybox);

    await openKeyboxInfoPage();

    expect(row('Status')).toMatchObject({ value: 'Revoked by Google' });
    expect(row('Reason')).toMatchObject({ value: 'KEY_COMPROMISE' });
    expect(row('Source')).toMatchObject({ value: 'Google' });
    expect(state.host?.querySelector('#keybox-info-install')).toBeTruthy();
  });

  it('does not treat the catalog version as an update recommendation', async () => {
    state.keybox = {
      ...activeKeybox,
      source_version: '35',
      latest_version: '36',
      up_to_date: false,
    };
    state.watch.mockResolvedValue(state.keybox);

    await openKeyboxInfoPage();

    expect(row('Installed version')).toMatchObject({ value: '35' });
    expect(row('Latest available')).toBeUndefined();
    expect(row('Update')).toBeUndefined();
    expect(sectionLabels()).not.toContain('Updates');
  });

  it('omits updates when the provider has no available version', async () => {
    state.keybox = {
      installed: true,
      is_private: true,
      source: 'Private',
      text: 'Keybox',
      serial: 'priv123',
      revoked: false,
      softbanned: false,
    };
    state.watch.mockResolvedValue(state.keybox);

    await openKeyboxInfoPage();

    expect(row('Provider')).toMatchObject({ value: 'Private keybox' });
    expect(row('Type')).toMatchObject({ value: 'Private' });
    expect(row('Installed version')).toBeUndefined();
    expect(row('Latest available')).toBeUndefined();
    expect(sectionLabels()).not.toContain('Updates');
  });

  it('uses a compact empty state when no keybox is installed', async () => {
    state.keybox = { installed: false };
    state.watch.mockResolvedValue(state.keybox);

    await openKeyboxInfoPage();

    expect(state.host?.textContent).toContain('Not installed');
    expect(state.host?.textContent).toContain('Install a keybox to enable attestation.');
    expect(state.host?.querySelectorAll('sp-settings-section')).toHaveLength(0);
    expect(state.host?.querySelector('#keybox-info-install')).toBeTruthy();
  });

  it('opens the keybox catalog from the replacement action', async () => {
    state.keybox = { installed: false };
    state.watch.mockResolvedValue(state.keybox);
    state.openCatalog.mockClear();

    await openKeyboxInfoPage();
    (state.host?.querySelector('#keybox-info-install') as HTMLElement).click();

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(state.close).toHaveBeenCalled();
    expect(state.openCatalog).toHaveBeenCalled();
  });

  it('refreshes through the revocation watch', async () => {
    state.keybox = activeKeybox;
    state.watch.mockResolvedValue({
      ...activeKeybox,
      source: 'UpdatedSource',
    });

    await openKeyboxInfoPage();
    const refresh = state.header?.querySelector('#keybox-info-refresh') as HTMLElement;
    expect(refresh).toBeTruthy();
    refresh.click();

    await vi.waitFor(() => expect(state.watch).toHaveBeenCalledWith(0));
    await vi.waitFor(() => expect(row('Provider')?.value).toBe('UpdatedSource'));
  });
});
