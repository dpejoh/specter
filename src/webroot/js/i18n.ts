import { cfgGet, cfgSet } from './cfg.js';
import enStrings from '../lang/source/string.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: 'Auto', native: 'System default' },
  { code: 'en', name: 'English', native: 'English' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar' },
  { code: 'vn', name: 'Vietnamese', native: 'Tiếng Việt' }
];

let _currentLangCode = 'auto';

export function getCurrentLanguageCode(): string {
  return _currentLangCode;
}

let currentStrings: Record<string, string> = {};
const fallbackStrings: Record<string, string> = enStrings;

const LANGUAGE_CODES = ['en', 'zh', 'ru', 'fr', 'es', 'ar', 'pl', 'tr', 'id', 'hu', 'vn'];

async function fetchLanguage(target: string): Promise<Record<string, string> | null> {
  const w = window as any;
  if (w.__langTarget === target && w.__langPromise) {
    try {
      const data = (await w.__langPromise) as Record<string, string> | null;
      if (data) return data;
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch('lang/' + target + '.json', { cache: 'no-cache' });
    return res.ok ? await res.json() as Record<string, string> : null;
  } catch {
    return null;
  }
}

export async function initI18n() {
  const saved = await cfgGet('lang', 'auto') || 'auto';
  _currentLangCode = saved;
  await applyLanguage(saved, false);
  wireLanguageSelect(saved);
}

export async function applyLanguage(langCode: string, notify = true) {
  _currentLangCode = langCode;
  cfgSet('lang', langCode);
  let target = langCode;
  if (langCode === 'auto') {
    target = (navigator.language || '').slice(0, 2);
    if (!LANGUAGE_CODES.includes(target)) target = 'en';
  }

  // Set direction before any network work so RTL layouts don't flip later.
  document.documentElement.dir = target === 'ar' ? 'rtl' : 'ltr';

  if (target !== 'en') {
    let cached: Record<string, string> | null = null;
    try {
      const raw = localStorage.getItem('i18n_' + target);
      if (raw) {
        cached = JSON.parse(raw) as Record<string, string>;
        currentStrings = cached;
        applyTranslations();
      }
    } catch { /* ignore corrupt cache */ }

    const next = await fetchLanguage(target);
    if (next && (!cached || JSON.stringify(next) !== JSON.stringify(cached))) {
      currentStrings = next;
      try { localStorage.setItem('i18n_' + target, JSON.stringify(next)); } catch {}
    }
  } else {
    currentStrings = enStrings;
  }

  applyTranslations();
  if (notify) document.dispatchEvent(new CustomEvent('languageChanged', { detail: { langCode } }));
}

export function getTranslation(key: string): string | null {
  return currentStrings[key] || fallbackStrings[key] || null;
}

export function applyTranslations() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = (el as HTMLElement).dataset.i18n;
    if (!key) continue;
    const val = currentStrings[key] || fallbackStrings[key];
    if (!val) continue;
    if (el.tagName === 'TITLE') { if (document.title !== val) document.title = val; continue; }
    if (el.tagName === 'MD-FILTER-CHIP') {
      const chip = el as HTMLElement & { label: string };
      if (chip.label !== val) chip.label = val;
      if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', val);
      continue;
    }
    if (el.textContent !== val) el.textContent = val;
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
  const langs: [string, string][] = [['auto', 'Auto'], ['en', 'English'], ['zh', '中文'], ['ru', 'Русский'], ['fr', 'Français'], ['es', 'Español'], ['ar', 'العربية'], ['pl', 'Polski'], ['tr', 'Türkçe'], ['id', 'Bahasa indonesia'], ['hu', 'Magyar'], ['vn', 'Tiếng Việt']];
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
