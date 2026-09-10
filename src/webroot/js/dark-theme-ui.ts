import { getTranslation } from './i18n.js';
import { cfgGet, cfgSet } from './cfg.js';
import { applyMode } from './theme.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

function isDarkActive(): boolean {
  const mode = document.documentElement.getAttribute('data-theme') || 'dark';
  if (mode === 'dark' || mode === 'amoled') return true;
  if (mode === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return false;
}

export function updateDarkThemeSummary() {
  const summaryEl = document.getElementById('dark-theme-summary');
  const sw = document.getElementById('dark-theme-switch') as MdSwitch | null;
  const isDark = isDarkActive();

  if (sw) sw.selected = isDark;

  if (summaryEl) {
    const mode = document.documentElement.getAttribute('data-theme') || 'dark';
    if (mode === 'amoled') {
      summaryEl.textContent = t('settings_theme_status_on_amoled', 'On (AMOLED)');
    } else if (mode === 'dark') {
      summaryEl.textContent = t('settings_theme_status_on_standard', 'On (Standard)');
    } else if (mode === 'light') {
      summaryEl.textContent = t('settings_theme_status_off', 'Off');
    } else if (mode === 'auto') {
      summaryEl.textContent = t('settings_theme_status_auto', 'Follow system');
    }
  }
}

export async function openDarkThemeDialog() {
  const currentMode = (await cfgGet('theme', 'dark')) || 'dark';
  let darkVariant = (await cfgGet('theme_dark_variant', currentMode === 'amoled' ? 'amoled' : 'dark')) || 'dark';

  openSubPage({
    id: 'dark-theme',
    title: t('settings_dark_theme_title', 'Dark theme'),
    description: t(
      'settings_dark_theme_desc',
      'Use a dark background to reduce battery usage and make your screen more comfortable to view.'
    ),
    masterToggle: {
      title: t('settings_dark_theme_master', 'Use Dark theme'),
      syncSwitchId: 'dark-theme-switch',
      getValue: () => isDarkActive(),
      setValue: (enabled: boolean) => {
        if (enabled) {
          const target = darkVariant === 'amoled' ? 'amoled' : 'dark';
          applyMode(target);
        } else {
          applyMode('light');
        }
        updateDarkThemeSummary();
      },
    },
    groups: [
      {
        title: t('settings_dark_theme_options', 'Options'),
        items: [
          {
            type: 'radio',
            id: 'theme-variant-standard',
            name: 'dark_theme_variant',
            value: 'dark',
            title: t('settings_dark_standard', 'Standard'),
            description: t('settings_dark_standard_desc', 'Turns on standard dark theme for the app'),
            selected: darkVariant !== 'amoled',
            onSelect: () => {
              darkVariant = 'dark';
              cfgSet('theme_dark_variant', 'dark');
              if (isDarkActive()) {
                applyMode('dark');
              }
              updateDarkThemeSummary();
            },
          },
          {
            type: 'radio',
            id: 'theme-variant-amoled',
            name: 'dark_theme_variant',
            value: 'amoled',
            title: t('settings_dark_amoled', 'AMOLED (Pure Black)'),
            description: t(
              'settings_dark_amoled_desc',
              'Pure black #000000 background for AMOLED screens to save battery and increase contrast'
            ),
            selected: darkVariant === 'amoled',
            onSelect: () => {
              darkVariant = 'amoled';
              cfgSet('theme_dark_variant', 'amoled');
              if (isDarkActive()) {
                applyMode('amoled');
              }
              updateDarkThemeSummary();
            },
          },
        ],
      },
      {
        title: t('settings_dark_theme_timing', 'Timing'),
        items: [
          {
            id: 'theme-auto-switch',
            key: 'theme_follow_system',
            defaultVal: currentMode === 'auto' ? '1' : '0',
            title: t('settings_dark_theme_auto', 'Follow system'),
            description: t(
              'settings_dark_theme_auto_desc',
              'Automatically match your device\'s dark or light theme'
            ),
            onChange: (isAuto: boolean) => {
              if (isAuto) {
                applyMode('auto');
              } else {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                applyMode(isDark ? darkVariant : 'light');
              }
              updateDarkThemeSummary();
            },
          },
        ],
      },
    ],
    infoCard: {
      icon: 'info',
      text: t(
        'settings_dark_theme_note',
        'If you experience issues with the AMOLED option, use the standard option.'
      ),
    },
    onClose: () => {
      updateDarkThemeSummary();
    },
  });
}

export function wireDarkTheme() {
  const row = document.getElementById('dark-theme-row');
  const sw = document.getElementById('dark-theme-switch') as MdSwitch | null;

  if (sw) {
    sw.selected = isDarkActive();
    sw.addEventListener('change', async () => {
      const darkVariant = (await cfgGet('theme_dark_variant', 'dark')) || 'dark';
      if (sw.selected) {
        applyMode(darkVariant === 'amoled' ? 'amoled' : 'dark');
      } else {
        applyMode('light');
      }
      updateDarkThemeSummary();
    });
  }

  if (row) {
    row.addEventListener('click', (e) => {
      if (e.composedPath().some(n => n instanceof Element && n.localName === 'md-switch')) return;
      openDarkThemeDialog();
    });
  }

  updateDarkThemeSummary();
}
