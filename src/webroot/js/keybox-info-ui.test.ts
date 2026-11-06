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

import { openKeyboxInfoPage } from './keybox-info-ui.js';

const activeKeybox: KeyboxInfoJson = {
  installed: true,
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

describe('keybox details page', () => {
  beforeEach(() => {
    state.host = null;
    state.header = null;
    state.close.mockClear();
    state.watch.mockReset();
    document.body.innerHTML = '';
  });

  it('renders identity, status, certificate, and file information', async () => {
    state.keybox = activeKeybox;
    state.watch.mockResolvedValue(activeKeybox);

    await openKeyboxInfoPage();

    const text = state.host?.textContent ?? '';
    expect(text).toContain('TAKR');
    expect(text).toContain('RKP');
    expect(text).toContain('Active');
    expect(text).toContain('abc123');
    expect(text).toContain('/data/adb/tricky_store/keybox.xml');
    expect(state.host?.querySelector('#keybox-info-install')).toBeNull();
  });

  it('shows the revocation reason and replacement action', async () => {
    state.keybox = {
      ...activeKeybox,
      revoked: true,
      revocation_status: 'REVOKED',
      revocation_reason: 'KEY_COMPROMISE',
      revocation_checked_at: '2026-11-06T10:00:00Z',
    };
    state.watch.mockResolvedValue(state.keybox);

    await openKeyboxInfoPage();

    const text = state.host?.textContent ?? '';
    expect(text).toContain('Revoked by Google');
    expect(text).toContain('KEY_COMPROMISE');
    expect(state.host?.querySelector('#keybox-info-install')).toBeTruthy();
  });

  it('shows a not-installed empty state with an install action', async () => {
    state.keybox = { installed: false };
    state.watch.mockResolvedValue(state.keybox);

    await openKeyboxInfoPage();

    const text = state.host?.textContent ?? '';
    expect(text).toContain('Not installed');
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

  it('labels a private keybox', async () => {
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

    expect(state.host?.textContent).toContain('Private keybox');
    expect(state.host?.textContent).toContain('Private');
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
    await vi.waitFor(() => expect(state.host?.textContent).toContain('UpdatedSource'));
  });
});
