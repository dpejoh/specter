import { beforeEach, describe, expect, it } from 'vitest';
import './sp-settings-row.js';
import './sp-settings-section.js';
import type { SpSettingsRow } from './sp-settings-row.js';
import type { SpSettingsSection } from './sp-settings-section.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function addRow(section: SpSettingsSection, headline: string): SpSettingsRow {
  const row = document.createElement('sp-settings-row') as SpSettingsRow;
  row.headline = headline;
  section.appendChild(row);
  return row;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('sp-settings-section', () => {
  it('renders an optional label and description', async () => {
    const section = document.createElement('sp-settings-section') as SpSettingsSection;
    section.label = 'Appearance';
    section.description = 'Theme and color';
    document.body.appendChild(section);
    await section.updateComplete;

    const root = section.shadowRoot!;
    expect(root.querySelector('.label')?.textContent?.trim()).toBe('Appearance');
    expect(root.querySelector('.description')?.textContent?.trim()).toBe('Theme and color');
  });

  it('accepts slotted label and description content', async () => {
    const section = document.createElement('sp-settings-section') as SpSettingsSection;
    const label = document.createElement('span');
    label.setAttribute('slot', 'label');
    label.textContent = 'Slotted label';
    const description = document.createElement('span');
    description.setAttribute('slot', 'description');
    description.textContent = 'Slotted description';
    section.append(label, description);
    document.body.appendChild(section);
    await section.updateComplete;
    await tick();

    const root = section.shadowRoot!;
    const labelSlot = root.querySelector('slot[name="label"]') as HTMLSlotElement;
    const descriptionSlot = root.querySelector('slot[name="description"]') as HTMLSlotElement;
    expect(labelSlot.assignedElements()[0]?.textContent).toBe('Slotted label');
    expect(descriptionSlot.assignedElements()[0]?.textContent).toBe('Slotted description');
  });

  it('assigns only/first/middle/last positions', async () => {
    const section = document.createElement('sp-settings-section') as SpSettingsSection;
    document.body.appendChild(section);
    const rows = [addRow(section, 'One'), addRow(section, 'Two'), addRow(section, 'Three')];
    await section.updateComplete;
    await tick();

    expect(rows[0]!.getAttribute('data-position')).toBe('first');
    expect(rows[1]!.getAttribute('data-position')).toBe('middle');
    expect(rows[2]!.getAttribute('data-position')).toBe('last');
    expect(rows[0]!.style.getPropertyValue('--sp-settings-row-radius')).toBe('24px 24px 4px 4px');
    expect(rows[2]!.style.getPropertyValue('--sp-settings-row-radius')).toBe('4px 4px 24px 24px');
  });

  it('recomputes when a row is hidden', async () => {
    const section = document.createElement('sp-settings-section') as SpSettingsSection;
    document.body.appendChild(section);
    const rows = [addRow(section, 'One'), addRow(section, 'Two'), addRow(section, 'Three')];
    await section.updateComplete;
    await tick();

    rows[1]!.hidden = true;
    await tick();
    await tick();

    expect(rows[0]!.getAttribute('data-position')).toBe('first');
    expect(rows[1]!.hasAttribute('data-position')).toBe(false);
    expect(rows[2]!.getAttribute('data-position')).toBe('last');
    expect(rows[0]!.style.getPropertyValue('--sp-settings-row-radius')).toBe('24px 24px 4px 4px');
    expect(rows[2]!.style.getPropertyValue('--sp-settings-row-radius')).toBe('4px 4px 24px 24px');
  });

  it('uses the only position for a single visible row', async () => {
    const section = document.createElement('sp-settings-section') as SpSettingsSection;
    document.body.appendChild(section);
    const row = addRow(section, 'Only');
    await section.updateComplete;
    await tick();

    expect(row.getAttribute('data-position')).toBe('only');
    expect(row.style.getPropertyValue('--sp-settings-row-radius')).toBe('24px');
  });
});
