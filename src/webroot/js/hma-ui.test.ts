import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    overlay: null as HTMLElement | null,
  };
  return {
    state,
    openSubPage: vi.fn(async (_config: unknown) => ({
      overlay: state.overlay as HTMLElement,
      close: vi.fn(),
      isMasterEnabled: () => true,
    })),
    exec: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
    afterPaint: vi.fn((fn: () => void) => fn()),
  };
});

vi.mock('./subpage.js', () => ({ openSubPage: mocks.openSubPage }));
vi.mock('./bridge.js', () => ({ exec: mocks.exec }));
vi.mock('./utils.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./utils.js')>();
  return { ...actual, afterPaint: mocks.afterPaint };
});

import { openHmaDialog, wireHma } from './hma-ui.js';

interface HmaConfig {
  id: string;
  title: string;
  description: string;
  masterToggle?: {
    key: string;
    defaultVal: string;
    title: string;
    syncSwitchId: string;
  };
  groups: { items: Record<string, unknown>[] }[];
}

describe('HMA-OSS config subpage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mocks.state.overlay = document.createElement('div');
    mocks.openSubPage.mockClear();
    mocks.exec.mockReset();
    mocks.exec.mockResolvedValue({ code: 0, stdout: 'oss-175', stderr: '' });
    mocks.afterPaint.mockClear();
    mocks.afterPaint.mockImplementation((fn: () => void) => fn());
  });

  it('opens the config page with the force-regenerate option', async () => {
    await openHmaDialog();

    expect(mocks.openSubPage).toHaveBeenCalledTimes(1);
    const config = mocks.openSubPage.mock.calls[0]![0] as unknown as HmaConfig;
    expect(config.id).toBe('hma-config');
    expect(config.title).toBe('HMA-OSS Configs');
    expect(config.description).toContain('custom HMA-OSS hiding profile');
    expect(config.masterToggle).toMatchObject({
      key: 'toggle_action_hma',
      defaultVal: '0',
      title: 'Use HMA-OSS Config Generation',
      syncSwitchId: 'toggle-action_hma',
    });
    expect(config.groups).toHaveLength(1);
    expect(config.groups[0]!.items[0]).toMatchObject({
      id: 'hma-force-regen',
      key: 'toggle_action_force_hma',
      defaultVal: '0',
      icon: 'restart_alt',
      title: 'Always Re-Generate HMA-OSS Config',
    });
  });

  it('shows the old-version warning after paint', async () => {
    mocks.exec.mockResolvedValue({ code: 0, stdout: 'oss-174', stderr: '' });
    mocks.state.overlay!.innerHTML = `
      <div class="subpage-content">
        <div class="subpage-footer" id="subpage-footer"></div>
      </div>
    `;

    await openHmaDialog();

    expect(mocks.afterPaint).toHaveBeenCalledTimes(1);
    const footer = mocks.state.overlay!.querySelector('#subpage-footer')!;
    const note = footer.nextElementSibling as HTMLElement | null;
    expect(note?.className).toBe('subpage-info-note');
    expect(note?.querySelector('.subpage-info-title')?.textContent).toContain('(oss-174)');
    expect(note?.querySelector('p')?.textContent).toContain('older than oss-175');
  });

  it('does not warn when the installed HMA version is current', async () => {
    mocks.exec.mockResolvedValue({ code: 0, stdout: 'oss-176', stderr: '' });
    mocks.state.overlay!.innerHTML = `
      <div class="subpage-content">
        <div class="subpage-footer" id="subpage-footer"></div>
      </div>
    `;

    await openHmaDialog();

    expect(mocks.state.overlay!.querySelector('.subpage-info-note')).toBeNull();
    expect(mocks.state.overlay!.querySelector('#subpage-footer')).not.toBeNull();
  });

  it('appends the warning to the content when there is no footer', async () => {
    mocks.exec.mockResolvedValue({ code: 0, stdout: '170', stderr: '' });
    mocks.state.overlay!.innerHTML = '<div class="subpage-content"></div>';

    await openHmaDialog();

    const content = mocks.state.overlay!.querySelector('.subpage-content')!;
    expect(content.lastElementChild?.className).toBe('subpage-info-note');
    expect(content.textContent).toContain('(oss-170)');
  });

  it('does not warn or throw when the version number is unparseable', async () => {
    mocks.exec.mockResolvedValue({ code: 0, stdout: 'oss-beta', stderr: '' });
    mocks.state.overlay!.innerHTML = `
      <div class="subpage-content">
        <div class="subpage-footer" id="subpage-footer"></div>
      </div>
    `;

    await expect(openHmaDialog()).resolves.toBeUndefined();
    expect(mocks.state.overlay!.querySelector('.subpage-info-note')).toBeNull();
  });

  it('does not warn or throw when the bridge read fails', async () => {
    mocks.exec.mockRejectedValue(new Error('no bridge'));
    mocks.state.overlay!.innerHTML = `
      <div class="subpage-content">
        <div class="subpage-footer" id="subpage-footer"></div>
      </div>
    `;

    await expect(openHmaDialog()).resolves.toBeUndefined();
    expect(mocks.state.overlay!.querySelector('.subpage-info-note')).toBeNull();
  });

  it('does not throw when the overlay has neither footer nor content', async () => {
    mocks.exec.mockResolvedValue({ code: 0, stdout: '100', stderr: '' });

    await expect(openHmaDialog()).resolves.toBeUndefined();
    expect(mocks.state.overlay!.querySelector('.subpage-info-note')).toBeNull();
  });

  it('wires the HMA row and its config button to the page', async () => {
    document.body.innerHTML = `
      <div id="toggle-action_hma-row">
        <button type="button" data-config>open</button>
      </div>
    `;
    const row = document.getElementById('toggle-action_hma-row')!;

    wireHma();
    expect(row.dataset.spWired).toBe('1');

    row.querySelector<HTMLButtonElement>('[data-config]')!.click();
    await vi.waitFor(() => expect(mocks.openSubPage).toHaveBeenCalledTimes(1));

    row.dispatchEvent(new Event('sp-activate'));
    await vi.waitFor(() => expect(mocks.openSubPage).toHaveBeenCalledTimes(2));
  });
});
