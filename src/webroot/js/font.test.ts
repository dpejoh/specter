import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cfg: new Map<string, string>(),
}));

const { cfgGet, cfgSet } = vi.hoisted(() => ({
  cfgGet: vi.fn(async (key: string, def = '') => h.cfg.get(key) ?? def),
  cfgSet: vi.fn((key: string, value: string) => { h.cfg.set(key, value); }),
}));

vi.mock('./cfg.js', () => ({ cfgGet, cfgSet }));

import { initFonts, wireFontToggles } from './font.js';

type SwitchEl = HTMLElement & { selected: boolean };

describe('fonts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.documentElement.style.cssText = '';
    h.cfg.clear();
    cfgSet.mockClear();
  });

  it('initFonts applies enabled fonts: brand vars for Sans, @font-face for Mono', async () => {
    h.cfg.set('toggle_custom_font', '1');
    h.cfg.set('toggle_mono_font', '1');
    await initFonts();

    expect(document.documentElement.style.getPropertyValue('--md-ref-typeface-brand'))
      .toBe('"Google Sans Variable"');
    expect(document.documentElement.style.getPropertyValue('--md-ref-typeface-plain'))
      .toBe('"Google Sans Variable"');
    // Google Sans uses the static @font-face from index.html: no style node.
    expect(document.getElementById('sp-font-sans')).toBeNull();

    const monoStyle = document.getElementById('sp-font-mono');
    expect(monoStyle).not.toBeNull();
    expect(monoStyle!.textContent).toContain('JetBrainsMono-var.woff2');
    expect(document.documentElement.style.getPropertyValue('--sp-font-mono'))
      .toBe('"JetBrains Mono Variable"');
  });

  it('initFonts skips fonts whose toggles are off', async () => {
    h.cfg.set('toggle_custom_font', '0');
    h.cfg.set('toggle_mono_font', '0');
    await initFonts();
    expect(document.getElementById('sp-font-mono')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--md-ref-typeface-brand')).toBe('');
  });

  it('wireFontToggles seeds switch state and applies/removes on change', async () => {
    document.body.innerHTML = `
      <md-switch id="custom-font-switch"></md-switch>
      <md-switch id="mono-font-switch"></md-switch>`;
    h.cfg.set('toggle_mono_font', '0');
    wireFontToggles();
    await new Promise(r => setTimeout(r, 5));

    const sans = document.getElementById('custom-font-switch') as SwitchEl;
    const mono = document.getElementById('mono-font-switch') as SwitchEl;
    expect(sans.selected).toBe(true); // default '1'
    expect(mono.selected).toBe(false);

    mono.selected = true;
    mono.dispatchEvent(new Event('change'));
    expect(cfgSet).toHaveBeenCalledWith('toggle_mono_font', '1');
    expect(document.getElementById('sp-font-mono')).not.toBeNull();

    mono.selected = false;
    mono.dispatchEvent(new Event('change'));
    expect(cfgSet).toHaveBeenCalledWith('toggle_mono_font', '0');
    expect(document.getElementById('sp-font-mono')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--sp-font-mono')).toBe('');
  });
});
