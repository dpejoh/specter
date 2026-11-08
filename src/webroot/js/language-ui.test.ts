import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  currentCode: 'auto',
  subpageConfig: null as unknown,
}));

const { applyLanguage, openSubPage, wireRowActivation } = vi.hoisted(() => ({
  applyLanguage: vi.fn(async () => {}),
  openSubPage: vi.fn((config: unknown) => { h.subpageConfig = config; }),
  wireRowActivation: vi.fn(),
}));

vi.mock('./i18n.js', () => ({
  t: (_key: string, fallback = '') => fallback,
  applyLanguage,
  getCurrentLanguageCode: () => h.currentCode,
  SUPPORTED_LANGUAGES: [
    { code: 'auto', name: 'Auto', native: 'System default' },
    { code: 'en', name: 'English', native: 'English' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'ar', name: 'Arabic', native: 'العربية' },
  ],
}));
vi.mock('./subpage.js', () => ({ openSubPage }));
vi.mock('./utils.js', () => ({ wireRowActivation }));

import { openLanguageDialog, updateLanguageSummary, wireLanguageUI } from './language-ui.js';

interface LangConfig {
  groups: { items: { value: string; selected: boolean; onSelect: (v: string) => Promise<void> }[] }[];
}

describe('language ui', () => {
  beforeEach(() => {
    document.body.innerHTML = '<span id="language-summary"></span>';
    h.currentCode = 'auto';
    h.subpageConfig = null;
    vi.clearAllMocks();
    openSubPage.mockImplementation((config: unknown) => { h.subpageConfig = config; });
  });

  const summary = () => document.getElementById('language-summary')?.textContent;

  it('summarizes auto with the resolved system language name', () => {
    Object.defineProperty(window.navigator, 'language', { value: 'fr-FR', configurable: true });
    updateLanguageSummary();
    expect(summary()).toBe('Auto (Français)');
  });

  it('summarizes a fixed language by its native name', () => {
    h.currentCode = 'ar';
    updateLanguageSummary();
    expect(summary()).toBe('العربية');
  });

  it('dialog lists languages, marks the current one and applies selections', async () => {
    h.currentCode = 'fr';
    await openLanguageDialog();
    const config = h.subpageConfig as LangConfig;
    const items = config.groups[0]!.items;
    expect(items.map(i => i.value)).toEqual(['auto', 'en', 'fr', 'ar']);
    expect(items.find(i => i.value === 'fr')!.selected).toBe(true);
    expect(items.find(i => i.value === 'en')!.selected).toBe(false);

    await items.find(i => i.value === 'ar')!.onSelect('ar');
    expect(applyLanguage).toHaveBeenCalledWith('ar');
  });

  it('wireLanguageUI activates the row and refreshes on languageChanged', () => {
    document.body.innerHTML += '<div id="language-row"></div>';
    wireLanguageUI();
    expect(wireRowActivation).toHaveBeenCalledWith(
      document.getElementById('language-row'), expect.any(Function));

    h.currentCode = 'en';
    document.dispatchEvent(new Event('languageChanged'));
    expect(summary()).toBe('English');
  });
});
