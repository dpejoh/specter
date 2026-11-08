import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  devs: null as unknown,
  fetchFails: false,
}));

const { fetchJson, openUrl } = vi.hoisted(() => ({
  fetchJson: vi.fn(async () => {
    if (h.fetchFails) throw new Error('offline');
    return h.devs;
  }),
  openUrl: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  fetchJson,
  escapeHtml: (v: string) => v.replace(/</g, '&lt;'),
}));
vi.mock('./i18n.js', () => ({ getTranslation: () => '' }));
vi.mock('./redirect.js', () => ({ openUrl }));

import { loadContributors } from './contributors.js';

describe('contributors', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="contributors-grid"></div>';
    h.devs = null;
    h.fetchFails = false;
    fetchJson.mockClear();
    openUrl.mockClear();
  });

  it('renders cards with roles and opens profiles on click and keyboard', async () => {
    h.devs = [
      { name: 'Alice', role: 'lead', github: 'https://github.com/alice', avatar: 'https://img/a.png' },
      { name: 'Bob <b>', role: 'docs', github: 'https://github.com/bob', avatar: '' },
    ];
    await loadContributors();

    const cards = document.querySelectorAll('.contributor-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.querySelector('.contributor-name')?.textContent?.trim()).toBe('Alice');
    expect(cards[0]!.querySelector('.contributor-role')?.textContent?.trim()).toBe('lead');
    expect(cards[1]!.querySelector('.contributor-name')?.innerHTML).toContain('Bob &lt;b&gt;');

    cards[0]!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(openUrl).toHaveBeenCalledWith('https://github.com/alice');

    cards[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(openUrl).toHaveBeenCalledWith('https://github.com/bob');

    // Non-activation keys don't open anything
    openUrl.mockClear();
    cards[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('hides avatars that fail to load', async () => {
    h.devs = [{ name: 'A', role: 'r', github: '', avatar: 'https://img/x.png' }];
    await loadContributors();
    const img = document.querySelector('.contributor-avatar') as HTMLImageElement;
    img.dispatchEvent(new Event('error'));
    expect(img.style.display).toBe('none');
  });

  it('leaves the grid untouched when the fetch fails or returns nothing', async () => {
    const grid = document.getElementById('contributors-grid')!;
    grid.innerHTML = 'placeholder';

    h.fetchFails = true;
    await loadContributors();
    expect(grid.innerHTML).toBe('placeholder');

    h.fetchFails = false;
    h.devs = [];
    await loadContributors();
    expect(grid.innerHTML).toBe('placeholder');
  });

  it('does nothing without a grid element', async () => {
    document.body.innerHTML = '';
    await loadContributors();
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
