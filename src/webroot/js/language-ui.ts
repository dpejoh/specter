import { getTranslation, applyLanguage, getCurrentLanguageCode, SUPPORTED_LANGUAGES } from './i18n.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function updateLanguageSummary() {
  const summaryEl = document.getElementById('language-summary');
  if (!summaryEl) return;

  const currentCode = getCurrentLanguageCode();
  const langObj = SUPPORTED_LANGUAGES.find(l => l.code === currentCode);

  if (currentCode === 'auto') {
    const sysCode = (navigator.language || '').slice(0, 2);
    const resolved = SUPPORTED_LANGUAGES.find(l => l.code === sysCode);
    const resolvedName = resolved ? resolved.native : 'English';
    summaryEl.textContent = `${t('theme_mode_auto', 'Auto')} (${resolvedName})`;
  } else if (langObj) {
    summaryEl.textContent = langObj.native;
  } else {
    summaryEl.textContent = currentCode;
  }
}

export async function openLanguageDialog() {
  const currentCode = getCurrentLanguageCode();

  openSubPage({
    id: 'language',
    title: t('settings_language', 'Language'),
    description: t(
      'language_subpage_desc',
      'Select display language for Specter WebUI'
    ),
    groups: [
      {
        title: t('settings_language', 'Language'),
        items: SUPPORTED_LANGUAGES.map(item => ({
          type: 'radio' as const,
          id: `lang-option-${item.code}`,
          name: 'specter_language_radio',
          value: item.code,
          title: item.native,
          description: item.code === 'auto'
            ? t('settings_theme_status_auto', 'Follow system')
            : item.name,
          selected: item.code === currentCode,
          onSelect: async (val: string) => {
            await applyLanguage(val);
            updateLanguageSummary();
          },
        })),
      },
    ],
  });
}

export function wireLanguageUI() {
  const row = document.getElementById('language-row');
  if (row) {
    row.addEventListener('click', () => {
      openLanguageDialog().catch(console.error);
    });
  }

  document.addEventListener('languageChanged', () => {
    updateLanguageSummary();
  });

  updateLanguageSummary();
}
