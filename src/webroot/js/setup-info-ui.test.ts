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
    // Run the paint callback on the next tick so the snapshot fetch still
    // starts strictly after the page render.
    afterPaint: (fn: () => void) => { setTimeout(fn, 0); },
  };
});

import { openSetupPage } from './setup-info-ui.js';

function sections(): HTMLElement[] {
  return [...(state.host?.querySelectorAll('sp-settings-section') ?? [])] as HTMLElement[];
}

function sectionLabels(): string[] {
  return sections().map(section => section.getAttribute('label') || '');
}

function rowsIn(label: string): { label: string; value: string; classes: string }[] {
  const section = sections().find(entry => entry.getAttribute('label') === label);
  return [...(section?.querySelectorAll('sp-settings-row') ?? [])].map(row => ({
    label: row.getAttribute('headline') || '',
    value: row.getAttribute('supporting-text') || '',
    classes: row.className,
  }));
}

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

  it('renders device, modules, features, and warnings through shared sections', async () => {
    await openSetupPage();
    await vi.waitFor(() => expect(sectionLabels()).toContain('TEESimulator'));

    expect(sectionLabels()).toEqual([
      'Device',
      'TEESimulator',
      'Play Integrity Fix',
      'HMA-OSS',
      'Specter features',
      'Warnings',
    ]);
    expect(sectionLabels().some(label => label.includes('2.0.0'))).toBe(false);

    expect(rowsIn('Device')).toContainEqual(
      expect.objectContaining({ label: 'Android version', value: '17' }),
    );
    expect(rowsIn('TEESimulator')[0]).toMatchObject({ label: 'Version', value: '2.0.0' });
    expect(rowsIn('TEESimulator')).toContainEqual(
      expect.objectContaining({ label: 'Target count', value: '12' }),
    );
    expect(rowsIn('Play Integrity Fix')).toContainEqual(
      expect.objectContaining({ label: 'Spoofed device', value: 'Google Pixel 8 Pro' }),
    );
    expect(rowsIn('Specter features')).toContainEqual(
      expect.objectContaining({ label: 'Auto Target', value: 'On · 5 min' }),
    );
    expect(rowsIn('Warnings')[0]).toMatchObject({
      label: 'Warning 1',
      value: 'No keybox is installed',
    });
    expect(rowsIn('Warnings')[0]?.classes).toContain('sp-info-value--error');
    expect(state.host?.textContent).not.toContain('/data/adb/');
  });

  it('renders the cached snapshot without running the shell', async () => {
    await openSetupPage();

    expect(sectionLabels()).toContain('TEESimulator');
    expect(rowsIn('Device')).toContainEqual(
      expect.objectContaining({ label: 'Android version', value: '17' }),
    );
  });

  it('shows an unavailable state when the snapshot cannot be read', async () => {
    state.data = null;
    await openSetupPage();

    await vi.waitFor(() => expect(state.host?.textContent).toContain('Setup information is unavailable'));
  });
});
