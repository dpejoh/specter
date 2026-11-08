import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openSubPage, exec, getModuleDir, fetchJson } = vi.hoisted(() => ({
  openSubPage: vi.fn(async (_config: object) => ({
    overlay: document.createElement('div'),
    close: vi.fn(),
    isMasterEnabled: () => true,
  })),
  exec: vi.fn(async () => ({ stdout: '2026-10-05', stderr: '', code: 0 })),
  getModuleDir: vi.fn(() => '/data/adb/modules/specter'),
  fetchJson: vi.fn(async () => ({ id: 'tricky_store' })),
}));

vi.mock('./subpage.js', () => ({ openSubPage }));
vi.mock('./bridge.js', () => ({ exec, getModuleDir }));
vi.mock('./utils.js', () => ({
  fetchJson,
  shellEscape: (value: string) => `'${value}'`,
}));

import { openSecurityPatchPage } from './security-patch-ui.js';
import './ui/sp-settings-row.js';

interface SecurityPatchConfig {
  title: string;
  groups: { items: Record<string, unknown>[] }[];
}

describe('security patch subpage', () => {
  beforeEach(() => {
    openSubPage.mockClear();
    exec.mockClear();
    fetchJson.mockClear();
    exec.mockResolvedValue({ stdout: '2026-10-05', stderr: '', code: 0 });
    fetchJson.mockResolvedValue({ id: 'tricky_store' });
  });

  it('renders a text date field with auto-formatting and device/fetch actions', async () => {
    await openSecurityPatchPage();

    const config = openSubPage.mock.calls[0]![0] as unknown as SecurityPatchConfig;
    const field = config.groups[0]!.items[0]! as {
      type: string;
      render: (container: HTMLElement, isEnabled: () => boolean) => void;
    };
    const actions = config.groups[1]!.items;
    // In production the subpage framework appends the host to a section
    // before rendering, and the renderer replaces the host with the row.
    const host = document.createElement('div');
    const container = document.createElement('div');
    host.append(container);

    field.render(container, () => true);

    const input = host.querySelector('#sp-input') as HTMLInputElement;
    expect(config.title).toBe('Set Security Patch');
    expect(field.type).toBe('custom');
    expect(host.querySelector('sp-settings-row#sp-input-row')).not.toBeNull();
    expect(host.querySelector('.list-item')).toBeNull();
    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.value).toBe('2026-10-05');
    expect(input.placeholder).toBe('YYYY-MM-DD');
    expect(host.querySelector('#sp-input-help')?.textContent).toBe('Use YYYY-MM-DD.');
    expect(host.querySelectorAll('.sp-quick-chip')).toHaveLength(0);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: 'custom' });
    expect(actions[1]).toMatchObject({ type: 'custom' });

    input.value = '20261005';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('2026-10-05');
  });

  it('uses OMK text mode with auto and latest shortcuts', async () => {
    fetchJson.mockResolvedValue({ id: 'omk' });
    exec.mockResolvedValue({ stdout: 'auto', stderr: '', code: 0 });

    await openSecurityPatchPage();

    const config = openSubPage.mock.calls[0]![0] as unknown as SecurityPatchConfig;
    const field = config.groups[0]!.items[0]! as {
      render: (container: HTMLElement, isEnabled: () => boolean) => void;
    };
    const host = document.createElement('div');
    const container = document.createElement('div');
    host.append(container);

    field.render(container, () => true);

    const input = host.querySelector('#sp-input') as HTMLInputElement;
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.sp-quick-chip')];

    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('text');
    expect(input.value).toBe('auto');
    expect(input.placeholder).toBe('YYYY-MM-DD');
    expect(host.querySelector('#sp-input-help')?.textContent).toBe('auto, latest, or YYYY-MM-DD');
    expect(chips.map(chip => chip.textContent)).toEqual(['Auto', 'Latest']);
    expect(chips[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(chips[1]?.getAttribute('aria-pressed')).toBe('false');
  });
});
