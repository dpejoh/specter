import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
