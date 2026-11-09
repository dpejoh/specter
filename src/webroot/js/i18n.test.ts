import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cfg: new Map<string, string>(),
}));

const { cfgGet, cfgSet } = vi.hoisted(() => ({
  cfgGet: vi.fn(async (key: string, def = '') => h.cfg.get(key) ?? def),
  cfgSet: vi.fn((key: string, value: string) => { h.cfg.set(key, value); }),
}));

vi.mock('./cfg.js', () => ({ cfgGet, cfgSet }));

import {
  SUPPORTED_LANGUAGES, applyLanguage, applyTranslations,
  getCurrentLanguageCode, getTranslation, initI18n, t, tf,
} from './i18n.js';

const AR_STRINGS = { dialog_apply: 'تطبيق', home_events: 'أحداث' };

function stubFetchOk(data: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => data,
  })));
}

describe('i18n', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
    h.cfg.clear();
    localStorage.clear();
    cfgSet.mockClear();
    vi.unstubAllGlobals();
    delete (window as { __langTarget?: unknown }).__langTarget;
    delete (window as { __langPromise?: unknown }).__langPromise;
  });

  it('exposes the supported language list', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(12);
    expect(SUPPORTED_LANGUAGES.map(l => l.code)).toContain('ar');
    expect(SUPPORTED_LANGUAGES[0]!.code).toBe('auto');
  });

  it('falls back to the bundled English strings and literal fallbacks', async () => {
    await applyLanguage('en', false);
    expect(getTranslation('dialog_apply')).toBe('Apply');
    expect(getTranslation('no_such_key_xyz')).toBeNull();
    expect(t('no_such_key_xyz', 'Fallback')).toBe('Fallback');
    expect(t('dialog_apply', 'Fallback')).toBe('Apply');
  });

  it('replaces numbered placeholders without breaking word order', async () => {
    await applyLanguage('en', false);
    expect(tf('no_such_key_xyz', '{0} events', 3)).toBe('3 events');
    expect(tf('no_such_key_xyz', '{1} of {0}', 'ten', 2)).toBe('2 of ten');
    expect(tf('no_such_key_xyz', '{0} and {1}')).toBe('{0} and {1}');
  });

  it('initI18n applies the saved language', async () => {
    h.cfg.set('lang', 'en');
    await initI18n();
    expect(getCurrentLanguageCode()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('applyLanguage loads a pack, sets RTL, caches it and notifies', async () => {
    stubFetchOk(AR_STRINGS);
    document.body.innerHTML = '<span data-i18n="dialog_apply">Apply</span>';
    const onChange = vi.fn();
    document.addEventListener('languageChanged', onChange);

    await applyLanguage('ar');
    expect(cfgSet).toHaveBeenCalledWith('lang', 'ar');
    expect(getCurrentLanguageCode()).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(getTranslation('dialog_apply')).toBe('تطبيق');
    expect(document.querySelector('[data-i18n]')?.textContent).toBe('تطبيق');
    expect(JSON.parse(localStorage.getItem('i18n_ar') || '{}')).toEqual(AR_STRINGS);
    expect(onChange).toHaveBeenCalled();
  });

  it('maps the vn pack to the vi BCP-47 tag', async () => {
    stubFetchOk({});
    await applyLanguage('vn', false);
    expect(document.documentElement.lang).toBe('vi');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('auto resolves the browser language and maps vi to the vn pack', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'vi-VN', configurable: true });
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchSpy);

    await applyLanguage('auto', false);
    expect(fetchSpy).toHaveBeenCalledWith('lang/vn.json', expect.anything());
    expect(document.documentElement.lang).toBe('vi');
  });

  it('auto falls back to English for unsupported browser languages', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'de-DE', configurable: true });
    await applyLanguage('auto', false);
    expect(document.documentElement.lang).toBe('en');
    expect(getTranslation('dialog_apply')).toBe('Apply');
  });

  it('keeps English fallbacks when a pack fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    await applyLanguage('fr', false);
    expect(getTranslation('dialog_apply')).toBe('Apply');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('uses the preloaded language promise when one is registered', async () => {
    (window as { __langTarget?: unknown }).__langTarget = 'es';
    (window as { __langPromise?: unknown }).__langPromise = Promise.resolve({ dialog_apply: 'Aplicar' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await applyLanguage('es', false);
    expect(getTranslation('dialog_apply')).toBe('Aplicar');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('applyTranslations handles titles, chips, aria labels and placeholders', async () => {
    stubFetchOk(AR_STRINGS);
    await applyLanguage('ar', false);
    document.body.innerHTML = `
      <title data-i18n="dialog_apply">x</title>
      <md-filter-chip data-i18n="dialog_apply" aria-label="old"></md-filter-chip>
      <span data-i18n="home_events">x</span>
      <span data-i18n="missing_key">keep me</span>
      <button data-i18n-aria="dialog_apply"></button>
      <button data-i18n-title="dialog_apply" title="old"></button>
      <input data-i18n-placeholder="dialog_apply" />`;
    // <title> lives in head; move it there for a realistic query root.
    document.head.appendChild(document.querySelector('title')!);

    applyTranslations();
    expect(document.title).toBe('تطبيق');
    const chip = document.querySelector('md-filter-chip') as HTMLElement & { label: string };
    expect(chip.label).toBe('تطبيق');
    expect(chip.getAttribute('aria-label')).toBe('تطبيق');
    expect(document.querySelector('[data-i18n="home_events"]')?.textContent).toBe('أحداث');
    expect(document.querySelector('[data-i18n="missing_key"]')?.textContent).toBe('keep me');
    expect(document.querySelector('[data-i18n-aria]')?.getAttribute('aria-label')).toBe('تطبيق');
    expect(document.querySelector('[data-i18n-title]')?.getAttribute('title')).toBe('تطبيق');
    expect((document.querySelector('[data-i18n-placeholder]') as HTMLInputElement).placeholder).toBe('تطبيق');
  });
});
