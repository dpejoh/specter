import { beforeEach, describe, expect, it, vi } from 'vitest';

const { applyMode } = vi.hoisted(() => ({ applyMode: vi.fn() }));

vi.mock('./theme.js', () => ({ applyMode }));
vi.mock('./i18n.js', () => ({ t: (_key: string, fallback = '') => fallback }));

import { initThemeToggle } from './theme-toggle.js';

function setupButton(resolved: string) {
  document.documentElement.setAttribute('data-theme-resolved', resolved);
  document.body.innerHTML = `
    <button id="theme-toggle"><md-icon>dark_mode</md-icon></button>`;
  return document.getElementById('theme-toggle')!;
}

describe('theme toggle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    applyMode.mockClear();
  });

  it('shows the light-mode affordance while dark is resolved', () => {
    const button = setupButton('dark');
    initThemeToggle();
    expect(button.querySelector('md-icon')?.textContent).toBe('light_mode');
    expect(button.getAttribute('aria-label')).toBe('Light');
  });

  it('clicking switches to the opposite mode', () => {
    const button = setupButton('dark');
    initThemeToggle();
    button.click();
    expect(applyMode).toHaveBeenCalledWith('light');

    document.documentElement.setAttribute('data-theme-resolved', 'light');
    button.click();
    expect(applyMode).toHaveBeenCalledWith('dark');
  });

  it('refreshes on theme-applied and languageChanged events', () => {
    const button = setupButton('light');
    initThemeToggle();
    expect(button.querySelector('md-icon')?.textContent).toBe('dark_mode');
    expect(button.getAttribute('aria-label')).toBe('Dark');

    document.documentElement.setAttribute('data-theme-resolved', 'dark');
    document.dispatchEvent(new Event('specter-theme-applied'));
    expect(button.querySelector('md-icon')?.textContent).toBe('light_mode');

    document.documentElement.setAttribute('data-theme-resolved', 'light');
    document.dispatchEvent(new Event('languageChanged'));
    expect(button.querySelector('md-icon')?.textContent).toBe('dark_mode');
  });

  it('does nothing without the button', () => {
    document.body.innerHTML = '';
    expect(() => initThemeToggle()).not.toThrow();
  });
});
