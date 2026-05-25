import { cfgGet, cfgSet } from './cfg.js';
import enStrings from '../lang/source/string.json';

let currentStrings: Record<string, string> = {};
const fallbackStrings: Record<string, string> = enStrings;

export async function initI18n() {
  const saved = await cfgGet('lang', 'auto') || 'auto';
  await applyLanguage(saved);
  wireLanguageSelect(saved);
}

export async function applyLanguage(langCode: string) {
  cfgSet('lang', langCode);

  let targetLang = langCode;
  const available = ['en', 'zh', 'ru', 'es', 'ar'];
  if (langCode === 'auto') {
    targetLang = (navigator.language || '').slice(0, 2);
    if (!available.includes(targetLang)) targetLang = 'en';
  }

  if (targetLang === 'en') {
    currentStrings = enStrings;
    applyTranslations();
    document.documentElement.dir = 'ltr';
    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { langCode } }));
    return;
  }

  const cached = localStorage.getItem('i18n_' + targetLang);
  if (cached) {
    try {
      currentStrings = JSON.parse(cached);
      applyTranslations();
    } catch (_e) { /* */ }
  }

  const ts = String(Date.now());
  try {
    const res = await fetch('lang/' + targetLang + '.json?ts=' + ts);
    currentStrings = await res.json();
    applyTranslations();
    localStorage.setItem('i18n_' + targetLang, JSON.stringify(currentStrings));
  } catch (_e) {
    console.warn('Failed to load language:', _e);
  }

  document.documentElement.dir = targetLang === 'ar' ? 'rtl' : 'ltr';
  document.dispatchEvent(new CustomEvent('languageChanged', { detail: { langCode } }));
}

export function getTranslation(key: string): string | null {
  return currentStrings[key] || fallbackStrings[key] || null;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = (el as HTMLElement).dataset.i18n;
    if (!key) return;

    if (el.tagName === 'TITLE') {
      const val = currentStrings[key] || fallbackStrings[key];
      if (val) document.title = val;
      return;
    }

    const val = currentStrings[key] || fallbackStrings[key];
    if (!val) return;

    if (el.tagName === 'MD-NAVIGATION-TAB' || el.tagName === 'MD-ASSIST-CHIP' || el.tagName === 'MD-FILTER-CHIP') {
      (el as any).label = val;
      setAriaLabel(el, val);
      return;
    }

    if (val.includes('<')) {
      el.innerHTML = val;
    } else {
      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(document.createTextNode(val));
    }
  });

  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = (el as HTMLElement).dataset.i18nAria;
    if (!key) return;
    const val = currentStrings[key] || fallbackStrings[key];
    if (val) setAriaLabel(el, val);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = (el as HTMLElement).dataset.i18nPlaceholder;
    if (!key) return;
    const val = currentStrings[key] || fallbackStrings[key];
    if (val) (el as any).placeholder = val;
  });
}

function setAriaLabel(el: Element, val: string) {
  if (el.hasAttribute('aria-label')) {
    el.setAttribute('aria-label', val);
  }
}

function wireLanguageSelect(currentLang: string) {
  const select = document.getElementById('language-select') as HTMLSelectElement | null;
  if (!select) return;

  select.innerHTML = '';

  const LANGUAGES: [string, string, string][] = [
    ['auto', '🌐', getTranslation('theme_mode_auto') || 'Auto'],
    ['en', '🇬🇧', 'English'],
    ['zh', '🇨🇳', '中文'],
    ['ru', '🇷🇺', 'Русский'],
    ['es', '🇪🇸', 'Español'],
    ['ar', '🇸🇦', 'العربية'],
  ];

  LANGUAGES.forEach(([code, flag, name]) => {
    const item = document.createElement('option');
    item.value = code;
    item.textContent = `${flag} ${name}`;
    select.appendChild(item);
  });

  select.value = currentLang;

  select.addEventListener('change', async () => {
    try {
      await applyLanguage(select.value);
    } catch (e) {
      console.warn('Language change failed:', e);
    }
  });

  document.addEventListener('languageChanged', () => {
    const autoOption = select.querySelector('option[value="auto"]');
    if (autoOption) {
      autoOption.textContent = `🌐 ${getTranslation('theme_mode_auto') || 'Auto'}`;
    }
  });
}
