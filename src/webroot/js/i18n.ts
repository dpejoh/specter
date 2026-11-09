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
}

export async function applyLanguage(langCode: string, notify = true) {
  _currentLangCode = langCode;
  cfgSet('lang', langCode);
  let target = langCode;
  if (langCode === 'auto') {
    target = (navigator.language || '').slice(0, 2);
    // Vietnamese is stored as `vn` for the existing language packs, but the
    // browser reports the BCP-47 code `vi`.
    if (target === 'vi') target = 'vn';
    if (!LANGUAGE_CODES.includes(target)) target = 'en';
  }

  // Set direction before any network work so RTL layouts don't flip later.
  document.documentElement.dir = target === 'ar' ? 'rtl' : 'ltr';
  // `vn` is an internal pack name, not a valid BCP-47 language tag.
  document.documentElement.lang = target === 'vn' ? 'vi' : target;

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

/** Translate with a literal fallback; the single shared helper for UI modules. */
export function t(key: string, fallback = ''): string {
  return getTranslation(key) || fallback;
}

/**
 * Translate and replace `{0}`, `{1}`, … placeholders with the supplied values.
 * Keeping the placeholders in the packs lets each language choose word order.
 */
export function tf(key: string, fallback = '', ...values: Array<string | number>): string {
  return t(key, fallback).replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = values[Number(index)];
    return value === undefined ? match : String(value);
  });
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
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    const val = currentStrings[(el as HTMLElement).dataset.i18nTitle!] || fallbackStrings[(el as HTMLElement).dataset.i18nTitle!];
    if (val) el.setAttribute('title', val);
  }
}
