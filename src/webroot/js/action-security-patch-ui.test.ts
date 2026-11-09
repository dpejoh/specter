import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openSubPage } = vi.hoisted(() => ({ openSubPage: vi.fn() }));

vi.mock('./subpage.js', () => ({ openSubPage }));

import { openActionSecurityPatchDialog, wireActionSecurityPatch } from './action-security-patch-ui.js';

interface SecurityPatchConfig {
  id: string;
  masterToggle: { key: string; defaultVal: string; syncSwitchId: string };
  groups: { items: Record<string, unknown>[] }[];
}

describe('security patch sources subpage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    openSubPage.mockClear();
  });

  it('opens with the security patch master toggle and all sources', () => {
    openActionSecurityPatchDialog();

    const config = openSubPage.mock.calls[0]![0] as unknown as SecurityPatchConfig;
    expect(config.id).toBe('security-patch-sources');
    expect(config.masterToggle).toMatchObject({
      key: 'toggle_action_security_patch',
      defaultVal: '0',
      syncSwitchId: 'toggle-action_security_patch',
    });

    const items = config.groups.flatMap(group => group.items);
    expect(items).toHaveLength(3);
    expect(items.map(item => item.id)).toEqual(['asp-device', 'asp-bulletin', 'asp-synthetic']);
    expect(items).toEqual([
      expect.objectContaining({ key: 'toggle_action_security_patch_device', defaultVal: '1' }),
      expect.objectContaining({ key: 'toggle_action_security_patch_bulletin', defaultVal: '1' }),
      expect.objectContaining({ key: 'toggle_action_security_patch_synthetic', defaultVal: '1' }),
    ]);
  });

  it('wires the security patch row and config button to the page', () => {
    document.body.innerHTML = `
      <div id="toggle-action_security_patch-row">
        <button type="button" data-config>open</button>
      </div>
    `;
    const row = document.getElementById('toggle-action_security_patch-row')!;

    wireActionSecurityPatch();
    expect(row.dataset.spWired).toBe('1');

    row.querySelector<HTMLButtonElement>('[data-config]')!.click();
    expect(openSubPage).toHaveBeenCalledTimes(1);

    row.dispatchEvent(new Event('sp-activate'));
    expect(openSubPage).toHaveBeenCalledTimes(2);
  });
});
