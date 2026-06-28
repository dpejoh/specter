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
  const available = ['en', 'zh', 'ru', 'es', 'ar', 'pl', 'tr'];
  let target = langCode;
  if (langCode === 'auto') {
    target = (navigator.language || '').slice(0, 2);
    if (!available.includes(target)) target = 'en';
  }

  if (target === 'en') {
    currentStrings = enStrings;
  } else {
    try {
      const cached = localStorage.getItem('i18n_' + target);
      if (cached) { currentStrings = JSON.parse(cached); }
      const res = await fetch('lang/' + target + '.json?ts=' + Date.now());
      currentStrings = await res.json();
      localStorage.setItem('i18n_' + target, JSON.stringify(currentStrings));
    } catch { /* cached will be used if fetch failed */ }
  }

  applyTranslations();
  document.documentElement.dir = target === 'ar' ? 'rtl' : 'ltr';
  document.dispatchEvent(new CustomEvent('languageChanged', { detail: { langCode } }));
}

export function getTranslation(key: string): string | null {
  return currentStrings[key] || fallbackStrings[key] || null;
}

function applyTranslations() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = (el as HTMLElement).dataset.i18n;
    if (!key) continue;
    const val = currentStrings[key] || fallbackStrings[key];
    if (!val) continue;
    if (el.tagName === 'TITLE') { document.title = val; continue; }
    if (el.tagName.startsWith('MD-')) {
      (el as HTMLElement & { label: string }).label = val;
      if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', val);
      continue;
    }
    if (val.includes('<')) { el.innerHTML = val; } else { el.textContent = val; }
  }
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    const val = currentStrings[(el as HTMLElement).dataset.i18nAria!] || fallbackStrings[(el as HTMLElement).dataset.i18nAria!];
    if (val) el.setAttribute('aria-label', val);
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    const val = currentStrings[(el as HTMLElement).dataset.i18nPlaceholder!] || fallbackStrings[(el as HTMLElement).dataset.i18nPlaceholder!];
    if (val) (el as HTMLInputElement).placeholder = val;
  }
}

function wireLanguageSelect(currentLang: string) {
  const select = document.getElementById('language-select') as HTMLSelectElement | null;
  if (!select) return;
  select.innerHTML = '';
  const langs: [string, string][] = [['auto', 'Auto'], ['en', 'English'], ['zh', '中文'], ['ru', 'Русский'], ['es', 'Español'], ['ar', 'العربية'], ['pl', 'Polski'], ['tr', 'Türkçe']];
  for (const [code, name] of langs) {
    const opt = document.createElement('option');
    opt.value = code; opt.textContent = name; select.appendChild(opt);
  }
  select.value = currentLang;
  select.addEventListener('change', () => applyLanguage(select.value));
  document.addEventListener('languageChanged', () => {
    const auto = select.querySelector('option[value="auto"]');
    if (auto) auto.textContent = getTranslation('theme_mode_auto') || 'Auto';
  });
}
