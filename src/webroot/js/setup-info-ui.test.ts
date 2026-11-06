import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetupInfoJson } from './types.js';

const state = vi.hoisted(() => ({
  host: null as HTMLElement | null,
  header: null as HTMLElement | null,
  data: null as SetupInfoJson | null,
  run: vi.fn(async () => ({ success: true, output: '', rawOutput: '' })),
}));

vi.mock('./subpage.js', () => ({
  openSubPage: vi.fn(async (config: any) => {
    const header = document.createElement('div');
    state.header = header;
    config.headerAction?.(header, {
      overlay: document.createElement('div'),
      close: vi.fn(),
      isMasterEnabled: () => true,
    });
    const host = document.createElement('div');
    state.host = host;
    config.groups[0].items[0].render(host, () => true);
    return { overlay: host, close: vi.fn(), isMasterEnabled: () => true };
  }),
}));

vi.mock('./bridge.js', () => ({
  runScript: state.run,
}));

vi.mock('./utils.js', async () => {
  const actual = await vi.importActual<typeof import('./utils.js')>('./utils.js');
  return {
    ...actual,
    fetchJson: vi.fn(async () => state.data),
  };
});

import { openSetupPage } from './setup-info-ui.js';

const fixture: SetupInfoJson = {
  generated_at: '2026-11-06T10:00:00Z',
  device: {
    android: '17',
    kernel: '6.1.62',
    root: 'KernelSU',
    specter: '1.5.0',
    security_patch: '2026-10-05',
    effective_patch: '2026-11-05',
    spoofed_device: 'Google Pixel 8 Pro',
  },
  modules: [
    {
      id: 'keystore',
      name: 'TEESimulator',
      version: '2.0.0',
      rows: [{ label: 'State', value: 'Enabled' }, { label: 'Target count', value: '12' }],
    },
    {
      id: 'pif',
      name: 'Play Integrity Fix',
      version: '2.0.0',
      rows: [{ label: 'State', value: 'Enabled' }, { label: 'Spoofed device', value: 'Google Pixel 8 Pro' }],
    },
    {
      id: 'hma',
      name: 'HMA-OSS',
      rows: [{ label: 'Templates', value: '1' }, { label: 'Live reload', value: 'On' }],
    },
  ],
  features: [{ label: 'Auto Target', value: 'On · 5 min' }],
  warnings: ['No keybox is installed'],
};

describe('setup page', () => {
  beforeEach(() => {
    state.host = null;
    state.header = null;
    state.data = fixture;
    state.run.mockReset();
    state.run.mockResolvedValue({ success: true, output: '', rawOutput: '' });
    document.body.innerHTML = '';
  });

  it('renders device, keystore, modules, features, and warnings', async () => {
    await openSetupPage();
    await vi.waitFor(() => expect(state.host?.textContent).toContain('TEESimulator'));

    const text = state.host?.textContent ?? '';
    expect(text).toContain('Android version');
    expect(text).toContain('17');
    expect(text).toContain('Target count');
    expect(text).not.toContain('/data/adb/');
    expect(text).toContain('Play Integrity Fix');
    expect(text).toContain('HMA-OSS');
    expect(text).toContain('Spoofed device');
    expect(text).toContain('Auto Target');
    expect(text).toContain('No keybox is installed');
  });

  it('renders the cached snapshot without running the shell', async () => {
    await openSetupPage();

    expect(state.host?.textContent).toContain('TEESimulator');
    expect(state.host?.textContent).toContain('Android version');
  });

  it('shows an unavailable state when the snapshot cannot be read', async () => {
    state.data = null;
    await openSetupPage();

    await vi.waitFor(() => expect(state.host?.textContent).toContain('Setup information is unavailable'));
  });
});
