import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openSubPage } = vi.hoisted(() => ({ openSubPage: vi.fn() }));

vi.mock('./subpage.js', () => ({ openSubPage }));

import { openAdbDisablerDialog, wireAdbDisabler } from './adb-disabler-ui.js';

interface AdbConfig {
  id: string;
  masterToggle: { key: string; defaultVal: string; syncSwitchId: string };
  groups: { items: Record<string, unknown>[] }[];
}

describe('ADB lock subpage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    openSubPage.mockClear();
  });

  it('opens with the ADB lock master toggle and all three protections', () => {
    openAdbDisablerDialog();

    const config = openSubPage.mock.calls[0]![0] as unknown as AdbConfig;
    expect(config.id).toBe('adb-disabler');
    expect(config.masterToggle).toMatchObject({
      key: 'toggle_adb_disabler',
      defaultVal: '1',
      syncSwitchId: 'toggle-adb_disabler',
    });

    const items = config.groups.flatMap(group => group.items);
    expect(items).toHaveLength(3);
    expect(items.map(item => item.id)).toEqual(['adb-dev-options', 'adb-usb-debug', 'adb-oem-unlock']);
    expect(items).toEqual([
      expect.objectContaining({ key: 'toggle_adb_disabler_dev_options', defaultVal: '1' }),
      expect.objectContaining({ key: 'toggle_adb_disabler_usb_debug', defaultVal: '1' }),
      expect.objectContaining({ key: 'toggle_adb_disabler_oem_unlock', defaultVal: '1' }),
    ]);
  });

  it('wires the ADB lock row and config button to the page', () => {
    document.body.innerHTML = `
      <div id="toggle-adb_disabler-row">
        <button type="button" data-config>open</button>
      </div>
    `;
    const row = document.getElementById('toggle-adb_disabler-row')!;

    wireAdbDisabler();
    expect(row.dataset.spWired).toBe('1');

    row.querySelector<HTMLButtonElement>('[data-config]')!.click();
    expect(openSubPage).toHaveBeenCalledTimes(1);

    row.dispatchEvent(new Event('sp-activate'));
    expect(openSubPage).toHaveBeenCalledTimes(2);
  });
});
