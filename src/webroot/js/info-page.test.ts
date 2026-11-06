import { describe, expect, it } from 'vitest';
import { appendInfoSection, dash, formatSize } from './info-page.js';

function rows(host: HTMLElement) {
  return [...host.querySelectorAll('sp-settings-row')].map(row => ({
    label: row.getAttribute('headline') || '',
    value: row.getAttribute('supporting-text') || '',
    mono: row.hasAttribute('mono'),
    copyable: row.hasAttribute('copyable'),
    classes: row.className,
  }));
}

describe('read-only info sections', () => {
  it('renders shared component sections and value rows', () => {
    const host = document.createElement('div');
    appendInfoSection(host, 'Overview', [
      { label: 'Name', value: 'beebox by mhmrdd' },
      { label: 'Status', value: 'Active' },
    ]);

    const section = host.querySelector('sp-settings-section');
    expect(section?.getAttribute('label')).toBe('Overview');
    expect(rows(host)).toMatchObject([
      { label: 'Name', value: 'beebox by mhmrdd' },
      { label: 'Status', value: 'Active' },
    ]);
  });

  it('marks copyable values and labels the copy action', () => {
    const host = document.createElement('div');
    appendInfoSection(host, 'Certificate', [
      { label: 'Serial', value: 'abc123', copy: true },
      { label: 'Expires', value: 'No expiry' },
    ]);

    const [serial, expires] = rows(host);
    expect(serial).toMatchObject({ label: 'Serial', copyable: true });
    expect(host.querySelector('sp-settings-row')?.getAttribute('value')).toBe('abc123');
    expect(host.querySelector('sp-settings-row')?.getAttribute('copy-label')).toContain('Serial');
    expect(expires).toMatchObject({ label: 'Expires', copyable: false });
  });

  it('applies tones and formats utility values', () => {
    const host = document.createElement('div');
    appendInfoSection(host, 'Warnings', [
      { label: 'Warning 1', value: 'No keybox is installed', tone: 'error' },
    ]);

    expect(rows(host)[0]?.classes).toContain('sp-info-value--error');
    expect(dash(undefined)).toBe('—');
    expect(dash('')).toBe('—');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
