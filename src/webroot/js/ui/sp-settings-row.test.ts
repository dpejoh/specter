import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './sp-settings-row.js';
import type { SpSettingsRow } from './sp-settings-row.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function makeRow(): SpSettingsRow {
  const row = document.createElement('sp-settings-row') as SpSettingsRow;
  document.body.appendChild(row);
  return row;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sp-settings-row', () => {
  it('renders headline and supporting text', async () => {
    const row = makeRow();
    row.headline = 'Wi-Fi';
    row.supportingText = 'Connected to home';
    await row.updateComplete;

    const root = row.shadowRoot!;
    expect(root.querySelector('.headline')?.textContent).toContain('Wi-Fi');
    expect(root.querySelector('.supporting')?.textContent).toContain('Connected to home');
    expect(row.hasAttribute('data-has-supporting')).toBe(true);

    const control = root.querySelector('.row') as HTMLElement;
    expect(control.getAttribute('aria-labelledby')).toContain('sp-settings-row-headline');
    expect(control.getAttribute('aria-describedby')).toContain('sp-settings-row-supporting');
  });

  it('uses a named headline slot for custom content', async () => {
    const row = makeRow();
    row.headline = 'Fallback';
    const custom = document.createElement('span');
    custom.setAttribute('slot', 'headline');
    custom.textContent = 'Custom headline';
    row.appendChild(custom);
    await row.updateComplete;

    const slot = row.shadowRoot!.querySelector('slot[name="headline"]') as HTMLSlotElement;
    expect(slot.assignedElements()[0]?.textContent).toBe('Custom headline');
  });

  it('renders a navigation row without a chevron by default', async () => {
    const row = makeRow();
    row.variant = 'navigation';
    row.headline = 'App targeting';
    await row.updateComplete;

    const control = row.shadowRoot!.querySelector('.row') as HTMLElement;
    expect(control.getAttribute('role')).toBe('button');
    expect(control.getAttribute('tabindex')).toBe('0');
    expect(control.querySelector('.chevron')).toBeNull();
  });

  it('renders a chevron only when opted in', async () => {
    const row = makeRow();
    row.variant = 'navigation';
    row.headline = 'Language';
    row.chevron = true;
    await row.updateComplete;

    expect(row.shadowRoot!.querySelector('.chevron')).not.toBeNull();
  });

  it('reflects the stacked layout for full-width trailing content', async () => {
    const row = makeRow();
    row.variant = 'custom';
    row.stacked = true;
    row.headline = 'Full-width input';
    await row.updateComplete;

    expect(row.hasAttribute('stacked')).toBe(true);
  });

  it('renders a leading control slot for radio-style rows', async () => {
    const row = makeRow();
    row.variant = 'custom';
    row.headline = 'System default';
    const control = document.createElement('div');
    control.setAttribute('slot', 'leading');
    control.textContent = 'radio';
    row.appendChild(control);
    await row.updateComplete;
    await tick();

    expect(row.hasLeading).toBe(true);
    expect(row.hasAttribute('data-has-leading')).toBe(true);
    const slot = row.shadowRoot!.querySelector('slot[name="leading"]') as HTMLSlotElement;
    expect(slot.assignedElements()[0]?.textContent).toBe('radio');
  });

  it('toggles itself and emits sp-change for a toggle row', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Dark theme';
    await row.updateComplete;

    const onChange = vi.fn();
    row.addEventListener('sp-change', onChange);
    const control = row.shadowRoot!.querySelector('.row') as HTMLElement;
    expect(control.getAttribute('role')).toBe('switch');
    expect(control.getAttribute('aria-checked')).toBe('false');

    control.click();
    await row.updateComplete;

    expect(row.selected).toBe(true);
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('activates from the keyboard', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Developer mode';
    await row.updateComplete;

    const control = row.shadowRoot!.querySelector('.row') as HTMLElement;
    control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await row.updateComplete;

    expect(row.selected).toBe(true);
  });

  it('toggles a has-page row that has no separate control', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.hasPage = true;
    row.headline = 'Toggle without a switch';
    await row.updateComplete;

    (row.shadowRoot!.querySelector('[part=row]') as HTMLElement).click();
    await row.updateComplete;
    expect(row.selected).toBe(true);
  });

  it('does not activate when disabled', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.disabled = true;
    await row.updateComplete;

    const control = row.shadowRoot!.querySelector('.row') as HTMLElement;
    control.click();
    await row.updateComplete;

    expect(row.selected).toBe(false);
    expect(control.getAttribute('aria-disabled')).toBe('true');
  });

  it('emits sp-activate for a navigation row', async () => {
    const row = makeRow();
    row.variant = 'navigation';
    row.headline = 'Keybox';
    await row.updateComplete;

    const onActivate = vi.fn();
    row.addEventListener('sp-activate', onActivate);
    (row.shadowRoot!.querySelector('.row') as HTMLElement).click();

    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('renders a real link when href is set', async () => {
    const row = makeRow();
    row.variant = 'navigation';
    row.headline = 'Source code';
    row.href = 'https://example.com';
    row.target = '_blank';
    await row.updateComplete;

    const link = row.shadowRoot!.querySelector('a.row') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders a copy button for a copyable value row', async () => {
    const row = makeRow();
    row.variant = 'value';
    row.headline = 'Serial';
    row.supportingText = 'ABC123';
    row.value = 'ABC123';
    row.copyable = true;
    row.copyLabel = 'Copy serial number';
    await row.updateComplete;

    const onCopy = vi.fn();
    row.addEventListener('sp-copy', onCopy);
    const button = row.shadowRoot!.querySelector('.copy-btn') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-label')).toBe('Copy serial number');

    button.click();
    expect(onCopy).toHaveBeenCalledOnce();
    expect((onCopy.mock.calls[0]![0] as CustomEvent).detail).toEqual({ text: 'ABC123' });
  });

  it('shows a spinner and busy state for a loading destructive row', async () => {
    const row = makeRow();
    row.variant = 'destructive';
    row.headline = 'Clear traces';
    row.loading = true;
    await row.updateComplete;

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(row.shadowRoot!.querySelector('.spinner')).not.toBeNull();
    expect(inner.getAttribute('aria-busy')).toBe('true');

    row.loading = false;
    await row.updateComplete;
    expect(row.shadowRoot!.querySelector('.spinner')).toBeNull();
    expect(inner.hasAttribute('aria-busy')).toBe(false);
  });

  it('syncs a native checkbox without shadowing checked state', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Native toggle';
    await row.updateComplete;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('slot', 'trailing');
    row.appendChild(checkbox);
    await row.updateComplete;
    await tick();

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await row.updateComplete;
    expect(row.selected).toBe(true);

    (row.shadowRoot!.querySelector('[part=row]') as HTMLElement).click();
    await row.updateComplete;
    expect(checkbox.checked).toBe(false);
    expect(row.selected).toBe(false);
  });

  it('does not toggle past a disabled trailing control', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Disabled control';
    await row.updateComplete;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('slot', 'trailing');
    checkbox.checked = false;
    checkbox.disabled = true;
    row.appendChild(checkbox);
    await row.updateComplete;
    await tick();

    (row.shadowRoot!.querySelector('[part=row]') as HTMLElement).click();
    await row.updateComplete;
    expect(checkbox.checked).toBe(false);
  });

  it('syncs a slotted trailing control', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Use custom font';
    await row.updateComplete;

    const control = document.createElement('div') as unknown as HTMLElement & { selected: boolean };
    control.setAttribute('slot', 'trailing');
    control.setAttribute('role', 'switch');
    control.selected = false;
    row.appendChild(control);
    await row.updateComplete;
    await tick();

    const inner = row.shadowRoot!.querySelector('.row') as HTMLElement;
    inner.click();
    await row.updateComplete;

    expect(row.selected).toBe(true);
    expect(control.selected).toBe(true);

    control.selected = false;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await row.updateComplete;

    expect(row.selected).toBe(false);
  });

  it('selects a radio row once and does not re-emit on a second click', async () => {
    const row = makeRow();
    row.variant = 'radio';
    row.headline = 'Choice';
    row.value = 'a';
    await row.updateComplete;

    const onChange = vi.fn();
    row.addEventListener('sp-change', onChange);
    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(inner.getAttribute('role')).toBe('radio');

    inner.click();
    await row.updateComplete;
    expect(row.selected).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
    expect((onChange.mock.calls[0]![0] as CustomEvent).detail).toEqual({ selected: true, value: 'a' });

    inner.click();
    await row.updateComplete;
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('syncs a slotted md-checkbox control', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Checkbox toggle';
    await row.updateComplete;

    const checkbox = document.createElement('md-checkbox') as HTMLElement & { checked: boolean };
    checkbox.setAttribute('slot', 'trailing');
    checkbox.checked = false;
    row.appendChild(checkbox);
    await row.updateComplete;
    await tick();

    (row.shadowRoot!.querySelector('[part=row]') as HTMLElement).click();
    await row.updateComplete;
    expect(row.selected).toBe(true);
    expect(checkbox.checked).toBe(true);

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await row.updateComplete;
    expect(row.selected).toBe(false);
  });

  it('opens links in a new tab with rel protection when target is _blank', async () => {
    const row = makeRow();
    row.variant = 'navigation';
    row.headline = 'External';
    row.href = 'https://example.com';
    row.target = '_blank';
    await row.updateComplete;

    const link = row.shadowRoot!.querySelector('a[part=row]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('focuses the inner row element', async () => {
    const row = makeRow();
    row.variant = 'navigation';
    row.headline = 'Focusable';
    await row.updateComplete;

    row.focus();
    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(row.shadowRoot!.activeElement).toBe(inner);
  });

  it('does not throw when focusing before the element has rendered', () => {
    const row = document.createElement('sp-settings-row') as SpSettingsRow;

    expect(() => row.focus()).not.toThrow();
  });

  it('renders an action row as a button and shows a spinner while loading', async () => {
    const row = makeRow();
    row.variant = 'action';
    row.headline = 'Restart';
    row.loading = true;
    await row.updateComplete;

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(inner.getAttribute('role')).toBe('button');
    expect(inner.getAttribute('aria-busy')).toBe('true');
    expect(row.shadowRoot!.querySelector('.spinner')).not.toBeNull();

    const onActivate = vi.fn();
    row.addEventListener('sp-activate', onActivate);
    inner.click();
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('renders destructive rows as buttons and emits sp-activate', async () => {
    const row = makeRow();
    row.variant = 'destructive';
    row.headline = 'Delete key';
    await row.updateComplete;

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(inner.getAttribute('role')).toBe('button');

    const onActivate = vi.fn();
    row.addEventListener('sp-activate', onActivate);
    inner.click();
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('renders value rows as static groups without a copy action', async () => {
    const row = makeRow();
    row.variant = 'value';
    row.headline = 'Fingerprint';
    row.value = 'abc123';
    await row.updateComplete;

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(inner.getAttribute('role')).toBe('group');
    expect(inner.hasAttribute('tabindex')).toBe(false);
    expect(row.shadowRoot!.querySelector('.copy-btn')).toBeNull();

    const onActivate = vi.fn();
    row.addEventListener('sp-activate', onActivate);
    inner.click();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('renders custom rows without a role and ignores activation', async () => {
    const row = makeRow();
    row.variant = 'custom';
    row.headline = 'Custom setting';
    await row.updateComplete;

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(inner.hasAttribute('role')).toBe(false);
    expect(inner.hasAttribute('tabindex')).toBe(false);

    const onActivate = vi.fn();
    row.addEventListener('sp-activate', onActivate);
    inner.click();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('renders a plain link without target or rel protection', async () => {
    const row = makeRow();
    row.variant = 'navigation';
    row.href = 'https://example.com/plain';
    await row.updateComplete;

    const link = row.shadowRoot!.querySelector('a[part=row]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.hasAttribute('target')).toBe(false);
    expect(link.hasAttribute('rel')).toBe(false);
    expect(link.hasAttribute('role')).toBe(false);
    expect(link.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('keeps an explicit non-blank target without rel protection', async () => {
    const row = makeRow();
    row.variant = 'navigation';
    row.href = 'https://example.com/self';
    row.target = '_self';
    await row.updateComplete;

    const link = row.shadowRoot!.querySelector('a[part=row]') as HTMLAnchorElement;
    expect(link.getAttribute('target')).toBe('_self');
    expect(link.hasAttribute('rel')).toBe(false);
  });

  it('renders a disabled href row as a non-link', async () => {
    const row = makeRow();
    row.variant = 'navigation';
    row.href = 'https://example.com/disabled';
    row.disabled = true;
    await row.updateComplete;

    expect(row.shadowRoot!.querySelector('a[part=row]')).toBeNull();
    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(inner.localName).toBe('div');
    expect(inner.hasAttribute('href')).toBe(false);
    expect(inner.getAttribute('aria-disabled')).toBe('true');
  });

  it('does not render an anchor for static value and custom rows with href', async () => {
    const row = makeRow();
    row.variant = 'value';
    row.headline = 'Value';
    row.href = 'https://example.com/value';
    await row.updateComplete;

    expect(row.shadowRoot!.querySelector('a[part=row]')).toBeNull();
    expect((row.shadowRoot!.querySelector('[part=row]') as HTMLElement).localName).toBe('div');

    row.variant = 'custom';
    await row.updateComplete;
    expect(row.shadowRoot!.querySelector('a[part=row]')).toBeNull();
  });

  it('marks a loading link row busy', async () => {
    const row = makeRow();
    row.variant = 'navigation';
    row.href = 'https://example.com/loading';
    row.loading = true;
    await row.updateComplete;

    const link = row.shadowRoot!.querySelector('a[part=row]') as HTMLAnchorElement;
    expect(link.getAttribute('aria-busy')).toBe('true');
    expect(link.hasAttribute('aria-disabled')).toBe(false);
  });

  it('uses an explicit label instead of generated ids', async () => {
    const row = makeRow();
    row.variant = 'navigation';
    row.label = 'Wi-Fi settings';
    row.headline = 'Wi-Fi';
    row.supportingText = 'Connected';
    await row.updateComplete;

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(inner.getAttribute('aria-label')).toBe('Wi-Fi settings');
    expect(inner.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('falls back to the supporting id when there is no headline', async () => {
    const row = makeRow();
    row.variant = 'value';
    row.supportingText = 'Connected to home';
    await row.updateComplete;

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(inner.getAttribute('aria-labelledby')).toContain('sp-settings-row-supporting');
    expect(inner.hasAttribute('aria-describedby')).toBe(false);
  });

  it('omits aria-labelledby for an empty row', async () => {
    const row = makeRow();
    await row.updateComplete;

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(inner.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('defers toggle semantics to a slotted md-switch control', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Use custom font';
    await row.updateComplete;

    const control = document.createElement('md-switch') as HTMLElement & { selected: boolean };
    control.setAttribute('slot', 'trailing');
    control.selected = false;
    row.appendChild(control);
    await row.updateComplete;
    await tick();

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(row.hasTrailingControl).toBe(true);
    expect(inner.hasAttribute('role')).toBe(false);
    expect(inner.hasAttribute('tabindex')).toBe(false);

    inner.click();
    await row.updateComplete;
    expect(row.selected).toBe(true);
    expect(control.selected).toBe(true);

    control.selected = false;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await row.updateComplete;
    expect(row.selected).toBe(false);
  });

  it('syncs a slotted md-radio control in a radio row', async () => {
    const row = makeRow();
    row.variant = 'radio';
    row.headline = 'Radio choice';
    row.value = 'b';
    await row.updateComplete;

    const radio = document.createElement('md-radio') as HTMLElement & { checked: boolean };
    radio.setAttribute('slot', 'trailing');
    radio.checked = true;
    row.appendChild(radio);
    await row.updateComplete;
    await tick();

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(inner.hasAttribute('role')).toBe(false);
    expect(row.selected).toBe(true);

    row.selected = false;
    await row.updateComplete;
    inner.click();
    await row.updateComplete;
    expect(row.selected).toBe(true);
    expect(radio.checked).toBe(true);

    row.selected = false;
    radio.checked = false;
    await row.updateComplete;
    inner.click();
    await row.updateComplete;
    expect(radio.checked).toBe(true);
  });

  it('reads and writes a slotted native radio input', async () => {
    const row = makeRow();
    row.variant = 'radio';
    row.headline = 'Native radio';
    await row.updateComplete;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.setAttribute('slot', 'trailing');
    radio.checked = true;
    row.appendChild(radio);
    await row.updateComplete;
    await tick();

    expect(row.selected).toBe(true);

    radio.checked = false;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    await row.updateComplete;
    expect(row.selected).toBe(false);
  });

  it('reads a checked property when a role=switch control has no selected state', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Role switch';
    await row.updateComplete;

    const control = document.createElement('div') as unknown as HTMLElement & { checked: boolean };
    control.setAttribute('slot', 'trailing');
    control.setAttribute('role', 'switch');
    control.checked = true;
    row.appendChild(control);
    await row.updateComplete;
    await tick();

    expect(row.selected).toBe(true);

    control.checked = false;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await row.updateComplete;
    expect(row.selected).toBe(false);
  });

  it('recognises a role=radio trailing control', async () => {
    const row = makeRow();
    row.variant = 'radio';
    row.headline = 'Role radio';
    await row.updateComplete;

    const control = document.createElement('div') as unknown as HTMLElement & { selected: boolean };
    control.setAttribute('slot', 'trailing');
    control.setAttribute('role', 'radio');
    control.selected = false;
    row.appendChild(control);
    await row.updateComplete;
    await tick();

    expect(row.hasTrailingControl).toBe(true);

    (row.shadowRoot!.querySelector('[part=row]') as HTMLElement).click();
    await row.updateComplete;
    expect(row.selected).toBe(true);
    expect(control.selected).toBe(true);
  });

  it('falls back to the row state when a trailing control has no state', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Stateless control';
    await row.updateComplete;

    const control = document.createElement('div') as HTMLElement & { selected?: boolean };
    control.setAttribute('slot', 'trailing');
    control.setAttribute('role', 'switch');
    row.appendChild(control);
    await row.updateComplete;
    await tick();

    control.dispatchEvent(new Event('change', { bubbles: true }));
    await row.updateComplete;
    expect(row.selected).toBe(false);

    (row.shadowRoot!.querySelector('[part=row]') as HTMLElement).click();
    await row.updateComplete;
    expect(row.selected).toBe(true);
    expect(control.selected).toBe(true);
  });

  it('falls back to the row state when a slotted input is not a checkbox or radio', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Changed input type';
    await row.updateComplete;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('slot', 'trailing');
    row.appendChild(input);
    await row.updateComplete;
    await tick();

    input.type = 'text';
    (row.shadowRoot!.querySelector('[part=row]') as HTMLElement).click();
    await row.updateComplete;

    expect(row.selected).toBe(true);
    expect(input.checked).toBe(true);
  });

  it('opens a has-page toggle row through its control', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.hasPage = true;
    row.headline = 'Toggle with page';
    await row.updateComplete;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('slot', 'trailing');
    row.appendChild(checkbox);
    await row.updateComplete;
    await tick();

    const onActivate = vi.fn();
    const onChange = vi.fn();
    row.addEventListener('sp-activate', onActivate);
    row.addEventListener('sp-change', onChange);

    (row.shadowRoot!.querySelector('[part=row]') as HTMLElement).click();
    await row.updateComplete;

    expect(onActivate).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(row.selected).toBe(false);
    expect(checkbox.checked).toBe(false);
  });

  it('opens a has-page radio row through its control', async () => {
    const row = makeRow();
    row.variant = 'radio';
    row.hasPage = true;
    row.headline = 'Radio with page';
    await row.updateComplete;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.setAttribute('slot', 'trailing');
    row.appendChild(radio);
    await row.updateComplete;
    await tick();

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(inner.hasAttribute('role')).toBe(false);

    const onActivate = vi.fn();
    const onChange = vi.fn();
    row.addEventListener('sp-activate', onActivate);
    row.addEventListener('sp-change', onChange);
    inner.click();
    await row.updateComplete;

    expect(onActivate).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(row.selected).toBe(false);
    expect(radio.checked).toBe(false);
  });

  it('detaches from a removed trailing control', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Removable control';
    await row.updateComplete;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('slot', 'trailing');
    row.appendChild(checkbox);
    await row.updateComplete;
    await tick();
    expect(row.hasTrailingControl).toBe(true);

    checkbox.remove();
    await tick();
    await row.updateComplete;
    expect(row.hasTrailingControl).toBe(false);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await row.updateComplete;
    expect(row.selected).toBe(false);
  });

  it('tracks slotted icon and leading content when added and removed', async () => {
    const row = makeRow();
    row.variant = 'custom';
    await row.updateComplete;

    const icon = document.createElement('span');
    icon.setAttribute('slot', 'icon');
    row.appendChild(icon);
    await tick();
    await row.updateComplete;
    expect(row.hasIcon).toBe(true);
    expect(row.hasAttribute('data-has-icon')).toBe(true);

    const secondIcon = document.createElement('span');
    secondIcon.setAttribute('slot', 'icon');
    row.appendChild(secondIcon);
    await tick();
    await row.updateComplete;
    expect(row.hasIcon).toBe(true);

    icon.remove();
    secondIcon.remove();
    await tick();
    await row.updateComplete;
    expect(row.hasIcon).toBe(false);
    expect(row.hasAttribute('data-has-icon')).toBe(false);

    const leading = document.createElement('span');
    leading.setAttribute('slot', 'leading');
    row.appendChild(leading);
    await tick();
    await row.updateComplete;
    expect(row.hasLeading).toBe(true);
    expect(row.hasAttribute('data-has-leading')).toBe(true);

    leading.remove();
    await tick();
    await row.updateComplete;
    expect(row.hasLeading).toBe(false);
    expect(row.hasAttribute('data-has-leading')).toBe(false);
  });

  it('tracks slotted headline and supporting content', async () => {
    const row = makeRow();
    row.variant = 'custom';
    await row.updateComplete;

    const headline = document.createElement('span');
    headline.setAttribute('slot', 'headline');
    headline.textContent = 'Slotted headline';
    row.appendChild(headline);
    await tick();
    await row.updateComplete;

    expect(row.hasHeadline).toBe(true);
    const headlineSlot = row.shadowRoot!.querySelector('slot[name="headline"]') as HTMLSlotElement;
    expect(headlineSlot.assignedElements()[0]?.textContent).toBe('Slotted headline');

    const secondHeadline = document.createElement('span');
    secondHeadline.setAttribute('slot', 'headline');
    secondHeadline.textContent = 'Second headline';
    row.appendChild(secondHeadline);
    await tick();
    await row.updateComplete;
    expect(row.hasHeadline).toBe(true);

    headline.remove();
    secondHeadline.remove();
    await tick();
    await row.updateComplete;
    expect(row.hasHeadline).toBe(false);

    const supporting = document.createElement('span');
    supporting.setAttribute('slot', 'supporting');
    supporting.textContent = 'Slotted supporting';
    row.appendChild(supporting);
    await tick();
    await row.updateComplete;

    expect(row.hasSupporting).toBe(true);
    expect(row.hasAttribute('data-has-supporting')).toBe(true);

    const secondSupporting = document.createElement('span');
    secondSupporting.setAttribute('slot', 'supporting');
    secondSupporting.textContent = 'Second supporting';
    row.appendChild(secondSupporting);
    await tick();
    await row.updateComplete;
    expect(row.hasSupporting).toBe(true);

    supporting.remove();
    secondSupporting.remove();
    await tick();
    await row.updateComplete;
    expect(row.hasSupporting).toBe(false);
    expect(row.hasAttribute('data-has-supporting')).toBe(false);
  });

  it('falls back to supporting text and headline when copying', async () => {
    const row = makeRow();
    row.variant = 'value';
    row.headline = 'Headline';
    row.supportingText = 'Supporting';
    row.copyable = true;
    await row.updateComplete;

    const onCopy = vi.fn();
    row.addEventListener('sp-copy', onCopy);
    const button = row.shadowRoot!.querySelector('.copy-btn') as HTMLButtonElement;
    button.click();
    expect((onCopy.mock.calls[0]![0] as CustomEvent).detail).toEqual({ text: 'Supporting' });

    row.value = '';
    row.supportingText = '';
    await row.updateComplete;
    button.click();
    expect((onCopy.mock.calls[1]![0] as CustomEvent).detail).toEqual({ text: 'Headline' });
  });

  it('uses the default copy label and skips the clipboard when it is unavailable', async () => {
    const row = makeRow();
    row.variant = 'value';
    row.value = 'ABC123';
    row.copyable = true;
    await row.updateComplete;

    const clipboard = vi
      .spyOn(navigator, 'clipboard', 'get')
      .mockReturnValue(undefined as unknown as Clipboard);
    const onCopy = vi.fn();
    row.addEventListener('sp-copy', onCopy);
    const button = row.shadowRoot!.querySelector('.copy-btn') as HTMLButtonElement;

    expect(button.getAttribute('aria-label')).toBe('Copy');
    expect(() => button.click()).not.toThrow();
    expect(clipboard).toHaveBeenCalled();
    expect(onCopy).toHaveBeenCalledOnce();
  });

  it('swallows clipboard write failures', async () => {
    const row = makeRow();
    row.variant = 'value';
    row.value = 'ABC123';
    row.copyable = true;
    await row.updateComplete;

    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new Error('denied'));
    const onCopy = vi.fn();
    row.addEventListener('sp-copy', onCopy);

    (row.shadowRoot!.querySelector('.copy-btn') as HTMLButtonElement).click();
    await tick();

    expect(writeText).toHaveBeenCalledWith('ABC123');
    expect(onCopy).toHaveBeenCalledOnce();
  });

  it('ignores unrelated keys and activates on Space', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Keyboard';
    await row.updateComplete;

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    await row.updateComplete;
    expect(row.selected).toBe(false);

    inner.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await row.updateComplete;
    expect(row.selected).toBe(true);
  });

  it('does not activate from the keyboard when disabled or static', async () => {
    const disabledRow = makeRow();
    disabledRow.variant = 'toggle';
    disabledRow.disabled = true;
    await disabledRow.updateComplete;

    disabledRow.shadowRoot!.querySelector('[part=row]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await disabledRow.updateComplete;
    expect(disabledRow.selected).toBe(false);

    const staticRow = makeRow();
    staticRow.variant = 'value';
    staticRow.headline = 'Value';
    await staticRow.updateComplete;

    const onActivate = vi.fn();
    staticRow.addEventListener('sp-activate', onActivate);
    staticRow.shadowRoot!.querySelector('[part=row]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await staticRow.updateComplete;
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('reflects selected styling and mirrors aria-disabled for hidden rows', async () => {
    const row = makeRow();
    row.variant = 'toggle';
    row.headline = 'Selected';
    row.selected = true;
    row.hidden = true;
    row.disabled = true;
    await row.updateComplete;

    const inner = row.shadowRoot!.querySelector('[part=row]') as HTMLElement;
    expect(row.hidden).toBe(true);
    expect(inner.classList.contains('row--selected')).toBe(true);
    expect(inner.classList.contains('row--disabled')).toBe(true);
    expect(inner.getAttribute('aria-disabled')).toBe('true');

    row.disabled = false;
    await row.updateComplete;
    expect(inner.hasAttribute('aria-disabled')).toBe(false);
  });
});
