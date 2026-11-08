import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cfgValues, cfgGet, cfgSet, setupOverlayA11y } = vi.hoisted(() => {
  const cfgValues = new Map<string, string>();
  return {
    cfgValues,
    cfgGet: vi.fn(async (key: string, def = '') => cfgValues.get(key) ?? def),
    cfgSet: vi.fn((key: string, value: string) => {
      cfgValues.set(key, value);
    }),
    setupOverlayA11y: vi.fn(() => () => {}),
  };
});

vi.mock('./cfg.js', () => ({ cfgGet, cfgSet }));
vi.mock('./overlay-a11y.js', () => ({ setupOverlayA11y }));
vi.mock('./material-subpages.js', () => ({}));
vi.mock('@material/web/switch/switch.js', () => ({}));
vi.mock('@material/web/icon/icon.js', () => ({}));
vi.mock('@material/web/ripple/ripple.js', () => ({}));

import { openSubPage } from './subpage.js';
import type { SubPageConfig } from './subpage.js';

type SwitchEl = HTMLElement & { selected: boolean };
type RadioEl = HTMLElement & { checked: boolean };

function baseConfig(overrides: Partial<SubPageConfig> = {}): SubPageConfig {
  return {
    id: 'test-page',
    title: 'Test Page',
    description: 'A page used by tests',
    groups: [
      {
        title: 'Group One',
        items: [
          { id: 'feat-a', key: 'feat_a', title: 'Feature A', description: 'First feature' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('subpage framework', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    cfgValues.clear();
    cfgGet.mockClear();
    cfgSet.mockClear();
    setupOverlayA11y.mockClear();
    window.isOverlayOpen = false;
  });

  it('renders the shell, group sections and a switch row reflecting stored config', async () => {
    cfgValues.set('feat_a', '0');
    const instance = await openSubPage(baseConfig());

    expect(instance.overlay.id).toBe('subpage-test-page');
    expect(instance.overlay.querySelector('.subpage-title')?.textContent).toBe('Test Page');
    expect(instance.overlay.querySelector('.subpage-top-desc')?.textContent).toBe('A page used by tests');
    const section = instance.overlay.querySelector('#subpage-group-0');
    expect(section).not.toBeNull();
    expect(instance.overlay.querySelector('h2.list-title')?.textContent).toBe('Group One');

    const row = section!.querySelector('sp-settings-row#feat-a-row');
    expect(row).not.toBeNull();
    expect(row!.getAttribute('variant')).toBe('toggle');
    const sw = row!.querySelector('#feat-a') as SwitchEl;
    expect(sw.selected).toBe(false);
    expect(window.isOverlayOpen).toBe(true);
  });

  it('defaults switches on, honoring defaultVal when nothing is stored', async () => {
    const instance = await openSubPage(baseConfig({
      id: 'defaults-page',
      groups: [{
        items: [
          { id: 'sw-on', key: 'sw_on', title: 'On', description: '' },
          { id: 'sw-off', key: 'sw_off', title: 'Off', description: '', defaultVal: '0' },
        ],
      }],
    }));

    expect((instance.overlay.querySelector('#sw-on') as SwitchEl).selected).toBe(true);
    expect((instance.overlay.querySelector('#sw-off') as SwitchEl).selected).toBe(false);
  });

  it('writes switch changes to config and fires onChange', async () => {
    cfgValues.set('feat_a', '0');
    const onChange = vi.fn();
    const instance = await openSubPage(baseConfig({
      groups: [{
        items: [{ id: 'feat-a', key: 'feat_a', title: 'Feature A', description: '', onChange }],
      }],
    }));

    const sw = instance.overlay.querySelector('#feat-a') as SwitchEl;
    sw.selected = true;
    sw.dispatchEvent(new Event('change'));

    expect(cfgSet).toHaveBeenCalledWith('feat_a', '1');
    expect(onChange).toHaveBeenCalledWith(true);

    sw.selected = false;
    sw.dispatchEvent(new Event('change'));
    expect(cfgSet).toHaveBeenCalledWith('feat_a', '0');
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('seeds input items from config and writes edits once per distinct value', async () => {
    cfgValues.set('patch_level', '2025-01-05');
    const onChange = vi.fn();
    const instance = await openSubPage(baseConfig({
      id: 'input-page',
      groups: [{
        items: [{
          type: 'input', id: 'patch', key: 'patch_level', title: 'Patch level',
          description: '', inputType: 'text', onChange,
        }],
      }],
    }));

    const input = instance.overlay.querySelector('#patch') as HTMLInputElement;
    expect(input.value).toBe('2025-01-05');

    input.value = '2025-02-05';
    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('input'));
    expect(cfgSet).toHaveBeenCalledTimes(1);
    expect(cfgSet).toHaveBeenCalledWith('patch_level', '2025-02-05');
    expect(onChange).toHaveBeenCalledTimes(1);

    input.value = '2025-03-05';
    input.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('2025-03-05');
  });

  it('selects radios by row click, unchecking siblings in the group', async () => {
    const onSelect = vi.fn();
    const instance = await openSubPage(baseConfig({
      id: 'radio-page',
      groups: [{
        items: [
          { type: 'radio', id: 'r-a', name: 'mode', value: 'a', title: 'Mode A', selected: true },
          { type: 'radio', id: 'r-b', name: 'mode', value: 'b', title: 'Mode B', onSelect },
        ],
      }],
    }));

    const radioA = instance.overlay.querySelector('#r-a') as RadioEl;
    const radioB = instance.overlay.querySelector('#r-b') as RadioEl;
    expect(radioA.checked).toBe(true);
    expect(radioB.checked).toBe(false);

    instance.overlay.querySelector('#r-b-row')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(radioB.checked).toBe(true);
    expect(radioA.checked).toBe(false);
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('invokes custom renderers with a host inside the section and a live enabled probe', async () => {
    const render = vi.fn((host: HTMLElement, isEnabled: () => boolean) => {
      host.textContent = `enabled:${isEnabled()}`;
    });
    const instance = await openSubPage(baseConfig({
      id: 'custom-page',
      groups: [{ items: [{ type: 'custom', render }] }],
    }));

    expect(render).toHaveBeenCalledTimes(1);
    const host = instance.overlay.querySelector('#subpage-custom-0-0') as HTMLElement;
    expect(host).not.toBeNull();
    expect(host.closest('#subpage-group-0')).not.toBeNull();
    expect(host.textContent).toBe('enabled:true');
  });

  it('renders the info card and wires header action, fab and footer slots', async () => {
    const headerAction = vi.fn();
    const fab = vi.fn();
    const footer = vi.fn();
    const instance = await openSubPage(baseConfig({
      id: 'slots-page',
      infoCard: { icon: 'info', title: 'Heads up', text: 'Something to know' },
      headerAction,
      fab,
      footer,
    }));

    expect(instance.overlay.querySelector('.subpage-info-title')?.textContent).toBe('Heads up');
    expect(headerAction).toHaveBeenCalledWith(
      instance.overlay.querySelector('#subpage-header-actions'), instance);
    expect(fab).toHaveBeenCalledWith(
      instance.overlay.querySelector('#subpage-fab-slot'), instance);
    expect(footer).toHaveBeenCalledWith(
      instance.overlay.querySelector('#subpage-footer'), instance);
    expect((instance.overlay.querySelector('#subpage-footer') as HTMLElement).hidden).toBe(false);
  });

  it('master toggle off disables the options wrapper until flipped on', async () => {
    cfgValues.set('master_key', '0');
    const onChange = vi.fn();
    const parentSwitch = document.createElement('div') as unknown as SwitchEl;
    parentSwitch.id = 'parent-master';
    document.body.appendChild(parentSwitch);

    const instance = await openSubPage(baseConfig({
      id: 'master-page',
      masterToggle: {
        key: 'master_key', title: 'Master', description: 'Everything',
        syncSwitchId: 'parent-master', onChange,
      },
    }));

    const wrapper = instance.overlay.querySelector('#subpage-options-wrapper')!;
    const masterSwitch = instance.overlay.querySelector('#subpage-master-switch') as SwitchEl;
    expect(masterSwitch.selected).toBe(false);
    expect(wrapper.classList.contains('subpage-options--disabled')).toBe(true);
    expect(instance.isMasterEnabled()).toBe(false);
    expect(instance.overlay.querySelector('#subpage-master-card')!
      .classList.contains('subpage-master-item--active')).toBe(false);

    masterSwitch.selected = true;
    masterSwitch.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(wrapper.classList.contains('subpage-options--disabled')).toBe(false);
    });
    expect(cfgSet).toHaveBeenCalledWith('master_key', '1');
    expect(instance.isMasterEnabled()).toBe(true);
    expect((parentSwitch as unknown as SwitchEl).selected).toBe(true);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(instance.overlay.querySelector('#subpage-master-card')!
      .classList.contains('subpage-master-item--active')).toBe(true);
  });

  it('supports a getValue/setValue master toggle without touching config keys', async () => {
    const setValue = vi.fn(async () => {});
    const instance = await openSubPage(baseConfig({
      id: 'master-custom-page',
      masterToggle: {
        title: 'Custom master', getValue: async () => false, setValue,
      },
    }));

    expect(instance.isMasterEnabled()).toBe(false);
    const masterSwitch = instance.overlay.querySelector('#subpage-master-switch') as SwitchEl;
    masterSwitch.selected = true;
    masterSwitch.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(setValue).toHaveBeenCalledWith(true));
    expect(cfgSet).not.toHaveBeenCalled();
  });

  it('returns the same instance when the same page is opened twice', async () => {
    const first = await openSubPage(baseConfig({ id: 'dedupe-page' }));
    const second = await openSubPage(baseConfig({ id: 'dedupe-page' }));
    expect(second).toBe(first);
    expect(document.querySelectorAll('#subpage-dedupe-page')).toHaveLength(1);
  });

  it('close() removes the overlay and fires onClose', async () => {
    const onClose = vi.fn();
    const instance = await openSubPage(baseConfig({ id: 'closable-page', onClose }));
    expect(document.getElementById('subpage-closable-page')).not.toBeNull();

    instance.close();
    await vi.waitFor(() => {
      expect(document.getElementById('subpage-closable-page')).toBeNull();
    }, { timeout: 2000 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.isOverlayOpen).toBe(false);
  });
});
