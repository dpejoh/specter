import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openSubPage } = vi.hoisted(() => ({ openSubPage: vi.fn() }));

vi.mock('./subpage.js', () => ({ openSubPage }));

import { openGmsDialog, wireGms } from './gms-ui.js';

interface GmsConfig {
  id: string;
  masterToggle: { key: string; defaultVal: string; syncSwitchId: string };
  groups: { items: Record<string, unknown>[] }[];
}

describe('GMS cleanup subpage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    openSubPage.mockClear();
  });

  it('opens with the GMS master toggle and both cleanup actions', () => {
    openGmsDialog();

    const config = openSubPage.mock.calls[0]![0] as unknown as GmsConfig;
    expect(config.id).toBe('gms-cleanup');
    expect(config.masterToggle).toMatchObject({
      key: 'toggle_action_gms',
      defaultVal: '1',
      syncSwitchId: 'toggle-action_gms',
    });

    const items = config.groups.flatMap(group => group.items);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'gms-force-stop',
      key: 'toggle_action_gms_force_stop',
      defaultVal: '1',
      title: 'Force-stop GMS Processes',
    });
    expect(items[1]).toMatchObject({
      id: 'gms-clear-data',
      key: 'toggle_action_gms_clear_data',
      defaultVal: '0',
      title: 'Clear Play Store Data',
    });
  });

  it('wires the GMS row and config button to the page', () => {
    document.body.innerHTML = `
      <div id="toggle-action_gms-row">
        <button type="button" data-config>open</button>
      </div>
    `;
    const row = document.getElementById('toggle-action_gms-row')!;

    wireGms();
    expect(row.dataset.spWired).toBe('1');

    row.querySelector<HTMLButtonElement>('[data-config]')!.click();
    expect(openSubPage).toHaveBeenCalledTimes(1);

    row.dispatchEvent(new Event('sp-activate'));
    expect(openSubPage).toHaveBeenCalledTimes(2);
  });
});
