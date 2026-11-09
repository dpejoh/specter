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

  it('dedupes concurrent opens before the page has mounted', async () => {
    const first = openSubPage(baseConfig({ id: 'pending-page' }));
    const second = openSubPage(baseConfig({ id: 'pending-page' }));
    expect(second).toBe(first);

    const [a, b] = await Promise.all([first, second]);
    expect(b).toBe(a);
    expect(document.querySelectorAll('#subpage-pending-page')).toHaveLength(1);
  });

  it('renders input variants with attributes, descriptions, units and both value sources', async () => {
    const getValue = vi.fn(async () => 'from-getter');
    const onChange = vi.fn();
    const instance = await openSubPage({
      id: 'inputs-page',
      title: 'Inputs',
      groups: [{
        title: 'Inputs',
        description: 'Input group description',
        items: [
          {
            type: 'input', id: 'block-input', getValue, title: 'Block input',
            description: 'Block description', icon: 'timer', layout: 'block',
            inputType: 'text', mono: true, min: 1, max: 9, step: 2,
            placeholder: 'type here', maxLength: 12, autocapitalize: 'none',
            autocomplete: 'off', spellcheck: false, ariaLabel: 'Block aria label',
            unit: 'ms', onChange,
          },
          {
            type: 'input', id: 'value-input', value: '42', title: 'Value only', onChange,
          },
        ],
      }],
    });

    expect(instance.overlay.querySelector('.subpage-top-desc')).toBeNull();
    expect(instance.overlay.querySelector('.subpage-group-desc')?.textContent)
      .toBe('Input group description');

    const blockRow = instance.overlay.querySelector('#block-input-row')!;
    expect(blockRow.getAttribute('variant')).toBe('custom');
    expect(blockRow.classList.contains('subpage-input-row--block')).toBe(true);
    expect(blockRow.hasAttribute('stacked')).toBe(true);
    expect(blockRow.querySelector('md-icon[slot="icon"]')?.textContent).toBe('timer');

    const blockInput = instance.overlay.querySelector('#block-input') as HTMLInputElement;
    expect(blockInput.value).toBe('from-getter');
    expect(blockInput.type).toBe('text');
    expect(blockInput.classList.contains('subpage-inline-input--block')).toBe(true);
    expect(blockInput.classList.contains('subpage-inline-input--mono')).toBe(true);
    expect(blockInput.min).toBe('1');
    expect(blockInput.max).toBe('9');
    expect(blockInput.step).toBe('2');
    expect(blockInput.placeholder).toBe('type here');
    expect(blockInput.maxLength).toBe(12);
    expect(blockInput.getAttribute('autocapitalize')).toBe('none');
    expect(blockInput.getAttribute('autocomplete')).toBe('off');
    expect(blockInput.spellcheck).toBe(false);
    expect(blockInput.getAttribute('aria-label')).toBe('Block aria label');
    expect(blockInput.getAttribute('aria-describedby')).toBe('block-input-desc');
    expect(instance.overlay.querySelector('#block-input-desc')?.textContent)
      .toBe('Block description');
    expect(instance.overlay.querySelector('#block-input-wrapper')).toBeNull();
    expect(blockRow.querySelector('.subpage-input-wrapper--block .subpage-input-unit')?.textContent)
      .toBe('ms');

    const valueInput = instance.overlay.querySelector('#value-input') as HTMLInputElement;
    expect(valueInput.value).toBe('42');
    expect(valueInput.type).toBe('number');
    valueInput.value = '43';
    valueInput.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith('43');
    expect(cfgSet).not.toHaveBeenCalled();
  });

  it('renders switch icons and radio badges, and handles radio change events', async () => {
    const onSelect = vi.fn();
    const instance = await openSubPage(baseConfig({
      id: 'decor-page',
      groups: [{
        items: [
          { id: 'icon-sw', key: 'icon_sw', title: 'Icon switch', description: '', icon: 'bolt' },
          {
            type: 'radio', id: 'badge-radio', name: 'decor_mode', value: 'x',
            title: 'Badge radio', description: 'Radio description', badge: 'NEW', icon: 'star', onSelect,
          },
        ],
      }],
    }));

    const switchRow = instance.overlay.querySelector('#icon-sw-row')!;
    expect(switchRow.querySelector('md-icon[slot="icon"]')?.textContent).toBe('bolt');
    expect(switchRow.querySelector('#icon-sw')).not.toBeNull();

    const radio = instance.overlay.querySelector('#badge-radio') as RadioEl;
    expect(radio.getAttribute('aria-label')).toBe('Badge radio, NEW');
    expect(instance.overlay.querySelector('.subpage-radio-badge')?.textContent).toBe('NEW');
    expect(instance.overlay.querySelector('#badge-radio-row .supporting-text')?.textContent)
      .toBe('Radio description');

    instance.overlay.querySelector('#badge-radio-row')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(radio.checked).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('x');

    // Clicking the radio control itself is ignored by the row handler.
    radio.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    radio.checked = false;
    radio.dispatchEvent(new Event('change'));
    expect(onSelect).toHaveBeenCalledTimes(1);

    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('defaults an on/off master toggle on and writes the off state', async () => {
    const onChange = vi.fn();
    const instance = await openSubPage(baseConfig({
      id: 'master-on-page',
      masterToggle: {
        key: 'master_on', title: 'Master on', onChange, syncSwitchId: 'missing-parent',
      },
    }));

    expect(instance.isMasterEnabled()).toBe(true);
    expect(instance.overlay.querySelector('#subpage-master-card')!
      .classList.contains('subpage-master-item--active')).toBe(true);
    expect(instance.overlay.querySelector('#subpage-options-wrapper')!
      .classList.contains('subpage-options--disabled')).toBe(false);

    const masterSwitch = instance.overlay.querySelector('#subpage-master-switch') as SwitchEl;
    expect(masterSwitch.selected).toBe(true);
    masterSwitch.selected = false;
    masterSwitch.dispatchEvent(new Event('change'));

    await vi.waitFor(() => expect(cfgSet).toHaveBeenCalledWith('master_on', '0'));
    expect(instance.isMasterEnabled()).toBe(false);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(instance.overlay.querySelector('#subpage-master-card')!
      .classList.contains('subpage-master-item--active')).toBe(false);
    expect(instance.overlay.querySelector('#subpage-options-wrapper')!
      .classList.contains('subpage-options--disabled')).toBe(true);
  });

  it('supports a master toggle with a getter but no storage key', async () => {
    const instance = await openSubPage(baseConfig({
      id: 'master-local-page',
      masterToggle: { title: 'Local master', getValue: () => true },
    }));

    expect(instance.isMasterEnabled()).toBe(true);
    const masterSwitch = instance.overlay.querySelector('#subpage-master-switch') as SwitchEl;
    masterSwitch.selected = false;
    masterSwitch.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(instance.isMasterEnabled()).toBe(false));
    expect(cfgSet).not.toHaveBeenCalled();
  });

  it('renders info card fallbacks without a title or custom icon', async () => {
    const instance = await openSubPage({
      id: 'info-default-page',
      title: 'Info defaults',
      groups: [{ items: [] }],
      infoCard: { text: 'A plain note' },
    });

    expect(instance.overlay.querySelector('.subpage-info-note md-icon')?.textContent).toBe('info');
    expect(instance.overlay.querySelector('.subpage-info-title')).toBeNull();
    expect(instance.overlay.querySelector('.subpage-info-note p')?.textContent).toBe('A plain note');
    expect(instance.overlay.querySelector('.subpage-top-desc')).toBeNull();
  });

  it('back button delegates to history and popstate closes only for foreign entries', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const onClose = vi.fn();
    const instance = await openSubPage(baseConfig({ id: 'back-page', onClose }));

    instance.overlay.querySelector('#subpage-back')!
      .dispatchEvent(new Event('click', { bubbles: true }));
    expect(back).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new PopStateEvent('popstate', { state: { subpage: 'back-page' } }));
    window.dispatchEvent(new PopStateEvent('popstate', { state: { subpage: 'file-browser' } }));
    expect(onClose).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate', { state: { subpage: 'other' } }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Already closed: a second popstate is ignored.
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(document.getElementById('subpage-back-page')).toBeNull();
    }, { timeout: 2000 });
    back.mockRestore();
  });

  it('close() is idempotent and closes directly when history moved on', async () => {
    const onClose = vi.fn();
    const instance = await openSubPage(baseConfig({ id: 'close-twice-page', onClose }));

    history.replaceState({}, '');
    instance.close();
    instance.close();

    await vi.waitFor(() => {
      expect(document.getElementById('subpage-close-twice-page')).toBeNull();
    }, { timeout: 2000 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.isOverlayOpen).toBe(false);
  });

  it('keeps the page locked until the last subpage closes', async () => {
    const first = await openSubPage(baseConfig({ id: 'stack-a' }));
    await openSubPage(baseConfig({ id: 'stack-b' }));
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.subpage-overlay--open')).toHaveLength(2);
    });

    first.close();
    expect(window.isOverlayOpen).toBe(true);
    expect(document.documentElement.style.overflow).toBe('hidden');

    const second = document.getElementById('subpage-stack-b') as HTMLElement & {
      __spInstance?: { close: () => void };
    };
    second.__spInstance!.close();
    await vi.waitFor(() => {
      expect(document.getElementById('subpage-stack-a')).toBeNull();
      expect(document.getElementById('subpage-stack-b')).toBeNull();
    }, { timeout: 2000 });
    expect(window.isOverlayOpen).toBe(false);
    expect(document.documentElement.style.overflow).toBe('');
  });
});
