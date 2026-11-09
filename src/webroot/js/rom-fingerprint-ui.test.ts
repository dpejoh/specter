import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openSubPage } = vi.hoisted(() => ({ openSubPage: vi.fn() }));

vi.mock('./subpage.js', () => ({ openSubPage }));

import { openRomFingerprintDialog, wireRomFingerprint } from './rom-fingerprint-ui.js';

interface RomFingerprintConfig {
  id: string;
  masterToggle: { key: string; defaultVal: string; syncSwitchId: string };
  groups: { items: Record<string, unknown>[] }[];
  infoCard: { icon?: string; text: string };
}

describe('ROM and build cleanup subpage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    openSubPage.mockClear();
  });

  it('opens with the ROM cleaner master toggle and all cleanup options', () => {
    openRomFingerprintDialog();

    const config = openSubPage.mock.calls[0]![0] as unknown as RomFingerprintConfig;
    expect(config.id).toBe('rom-fingerprint');
    expect(config.masterToggle).toMatchObject({
      key: 'toggle_rom_fingerprint',
      defaultVal: '1',
      syncSwitchId: 'toggle-rom_fingerprint',
    });

    const items = config.groups.flatMap(group => group.items);
    expect(items).toHaveLength(5);
    expect(items.map(item => item.id)).toEqual(['rf-hexpatch', 'rf-crom', 'rf-prefix', 'rf-pif', 'rf-spoof']);
    expect(items).toEqual([
      expect.objectContaining({ key: 'toggle_rom_fingerprint_names', defaultVal: '1' }),
      expect.objectContaining({ key: 'toggle_custom_rom_props', defaultVal: '0' }),
      expect.objectContaining({ key: 'toggle_rom_fingerprint_prefix', defaultVal: '1' }),
      expect.objectContaining({ key: 'toggle_rom_fingerprint_pif', defaultVal: '1' }),
      expect.objectContaining({ key: 'toggle_rom_fingerprint_build_type', defaultVal: '1' }),
    ]);
    expect(config.infoCard).toMatchObject({ icon: 'info' });
    expect(config.infoCard.text).toContain('Stripping custom ROM identifiers');
  });

  it('wires the ROM cleaner row and config button to the page', () => {
    document.body.innerHTML = `
      <div id="toggle-rom_fingerprint-row">
        <button type="button" data-config>open</button>
      </div>
    `;
    const row = document.getElementById('toggle-rom_fingerprint-row')!;

    wireRomFingerprint();
    expect(row.dataset.spWired).toBe('1');

    row.querySelector<HTMLButtonElement>('[data-config]')!.click();
    expect(openSubPage).toHaveBeenCalledTimes(1);

    row.dispatchEvent(new Event('sp-activate'));
    expect(openSubPage).toHaveBeenCalledTimes(2);
  });
});
