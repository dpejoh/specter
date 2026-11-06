import { describe, expect, it } from 'vitest';
import { infoGroup, valueRow, dash, formatSize } from './info-page.js';

describe('read-only info rows', () => {
  it('renders grouped label/value rows with grouped corners', () => {
    const html = infoGroup('Overview', [
      { label: 'Name', value: 'beebox by mhmrdd' },
      { label: 'Status', value: 'Active' },
    ]);
    const host = document.createElement('div');
    host.innerHTML = html;

    expect(host.querySelector('.list-title')?.textContent).toBe('Overview');
    expect(host.querySelectorAll('.list-item--value')).toHaveLength(2);
    expect(host.querySelector('.list-item--first')).toBeTruthy();
    expect(host.querySelector('.list-item--last')).toBeTruthy();
    expect(host.textContent).toContain('beebox by mhmrdd');
  });

  it('renders a copy control only for copyable values', () => {
    const withCopy = valueRow({ label: 'Serial', value: 'abc123', copy: true }, 'list-item--only');
    const withoutCopy = valueRow({ label: 'Status', value: 'Active' }, 'list-item--only');

    const host = document.createElement('div');
    host.innerHTML = withCopy + withoutCopy;

    expect(host.querySelectorAll('[data-copy]')).toHaveLength(1);
    expect(host.querySelector('[data-copy]')?.getAttribute('data-copy')).toBe('abc123');
  });

  it('dashes empty values and formats sizes', () => {
    expect(dash(undefined)).toBe('—');
    expect(dash('')).toBe('—');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
