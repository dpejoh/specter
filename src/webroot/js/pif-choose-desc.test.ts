import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cfg: new Map<string, string>(),
}));

const { cfgGet } = vi.hoisted(() => ({
  cfgGet: vi.fn(async (key: string, def = '') => h.cfg.get(key) ?? def),
}));

vi.mock('./cfg.js', () => ({ cfgGet }));
vi.mock('./i18n.js', () => ({ t: (_key: string, fallback = '') => fallback }));

import { refreshPifChooseDesc } from './pif-choose-desc.js';

describe('pif choose description', () => {
  beforeEach(() => {
    document.body.innerHTML = '<span id="pif-choose-device-desc"></span>';
    h.cfg.clear();
  });

  const desc = () => document.getElementById('pif-choose-device-desc')?.textContent;

  it('shows the single preferred device by model', async () => {
    h.cfg.set('pif_preferred_devices', 'Pixel 10 Pro|frankel');
    await refreshPifChooseDesc();
    expect(desc()).toBe('Current: Pixel 10 Pro');
  });

  it('falls back to legacy product/model keys', async () => {
    h.cfg.set('pif_preferred_product', 'tokay');
    h.cfg.set('pif_preferred_model', 'Pixel 9');
    await refreshPifChooseDesc();
    expect(desc()).toBe('Current: Pixel 9');
  });

  it('counts multiple preferred devices and skips malformed lines', async () => {
    h.cfg.set('pif_preferred_devices', 'Pixel 10|blazer\ngarbage-line\nPixel 9|tokay\nNoProduct|');
    await refreshPifChooseDesc();
    expect(desc()).toBe('Current: 2 devices');
  });

  it('mentions the blacklist when random pick has exclusions', async () => {
    h.cfg.set('pif_blacklist', 'Pixel 10|blazer\ntokay');
    await refreshPifChooseDesc();
    expect(desc()).toBe('Random Canary (2 blacklisted)');
  });

  it('shows the default prompt with no preference or blacklist', async () => {
    await refreshPifChooseDesc();
    expect(desc()).toBe('Pick which Pixel Canary models Specter may fetch');
  });

  it('does nothing without the description element', async () => {
    document.body.innerHTML = '';
    await expect(refreshPifChooseDesc()).resolves.toBeUndefined();
    expect(cfgGet).not.toHaveBeenCalled();
  });
});
