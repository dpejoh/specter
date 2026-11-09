import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openSubPage } = vi.hoisted(() => ({ openSubPage: vi.fn() }));

vi.mock('./subpage.js', () => ({ openSubPage }));

import { openPropHandlerDialog, wirePropHandler } from './prop-handler-ui.js';

interface PropHandlerConfig {
  id: string;
  masterToggle: { key: string; defaultVal: string; syncSwitchId: string };
  groups: { items: Record<string, unknown>[] }[];
}

describe('boot spoofing subpage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    openSubPage.mockClear();
  });

  it('opens with the boot spoofing master toggle and both actions', () => {
    openPropHandlerDialog();

    const config = openSubPage.mock.calls[0]![0] as unknown as PropHandlerConfig;
    expect(config.id).toBe('prop-handler');
    expect(config.masterToggle).toMatchObject({
      key: 'toggle_prop_handler',
      defaultVal: '1',
      syncSwitchId: 'toggle-prop_handler',
    });

    const items = config.groups.flatMap(group => group.items);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'ph-state',
      key: 'toggle_boot_state_props',
      defaultVal: '1',
      title: 'Lock Bootloader',
    });
    expect(items[1]).toMatchObject({
      id: 'ph-bootmode',
      key: 'toggle_bootmode_spoof',
      defaultVal: '1',
      title: 'Hide Recovery',
    });
  });

  it('wires the boot spoofing row and config button to the page', () => {
    document.body.innerHTML = `
      <div id="toggle-prop_handler-row">
        <button type="button" data-config>open</button>
      </div>
    `;
    const row = document.getElementById('toggle-prop_handler-row')!;

    wirePropHandler();
    expect(row.dataset.spWired).toBe('1');

    row.querySelector<HTMLButtonElement>('[data-config]')!.click();
    expect(openSubPage).toHaveBeenCalledTimes(1);

    row.dispatchEvent(new Event('sp-activate'));
    expect(openSubPage).toHaveBeenCalledTimes(2);
  });
});
