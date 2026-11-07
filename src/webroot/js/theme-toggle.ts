import { applyMode } from './theme.js';
import { t } from './i18n.js';

function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme-resolved') === 'dark';
}

function updateThemeToggle(): void {
  const button = document.getElementById('theme-toggle');
  if (!button) return;
  const dark = isDark();
  const icon = button.querySelector('md-icon');
  if (icon) icon.textContent = dark ? 'light_mode' : 'dark_mode';
  const label = dark
    ? t('theme_mode_light', 'Light')
    : t('theme_mode_dark', 'Dark');
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
}

export function initThemeToggle(): void {
  const button = document.getElementById('theme-toggle');
  if (!button) return;
  button.addEventListener('click', () => {
    applyMode(isDark() ? 'light' : 'dark');
    updateThemeToggle();
  });
  document.addEventListener('specter-theme-applied', updateThemeToggle);
  document.addEventListener('languageChanged', updateThemeToggle);
  updateThemeToggle();
}
