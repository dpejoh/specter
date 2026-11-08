import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppIconManager, bufToB64, ksuGlobal, themedFallbackIcon } from './target-apps-icons.js';

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: (entries: Array<{ isIntersecting: boolean; target: Element }>) => void;
  observed = new Set<Element>();
  disconnected = false;

  constructor(cb: (entries: Array<{ isIntersecting: boolean; target: Element }>) => void) {
    this.callback = cb;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) { this.observed.add(el); }
  unobserve(el: Element) { this.observed.delete(el); }
  disconnect() { this.disconnected = true; }

  trigger(el: Element, isIntersecting = true) {
    this.callback([{ isIntersecting, target: el }]);
  }
}

describe('target apps icons', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    delete (globalThis as { ksu?: unknown }).ksu;
    delete (globalThis as { $packageManager?: unknown }).$packageManager;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bufToB64 encodes raw bytes', () => {
    const buf = new Uint8Array([104, 105, 33]).buffer;
    expect(bufToB64(buf)).toBe(btoa('hi!'));
  });

  it('themedFallbackIcon returns an encoded svg data URI', () => {
    const uri = themedFallbackIcon();
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(uri)).toContain('<svg');
  });

  it('ksuGlobal reads the injected global', () => {
    expect(ksuGlobal()).toBeUndefined();
    (globalThis as { ksu?: unknown }).ksu = { tag: 'ksu' };
    expect(ksuGlobal()).toEqual({ tag: 'ksu' });
  });

  it('createElements builds the spinner + lazy img structure', () => {
    const mgr = new AppIconManager();
    const { wrap, img, spin } = mgr.createElements('com.example.app');
    expect(wrap.className).toBe('sp-icn-w');
    expect(spin.dataset.package).toBe('com.example.app');
    expect(img.dataset.package).toBe('com.example.app');
    expect(img.loading).toBe('lazy');
    expect(wrap.contains(img)).toBe(true);
    expect(wrap.contains(spin)).toBe(true);
  });

  it('watchAll observes wrappers and loads via ksu icon URLs when available', () => {
    (globalThis as { ksu?: unknown }).ksu = { getPackagesInfo: () => '{}' };
    const mgr = new AppIconManager();
    const { wrap, img } = mgr.createElements('com.example.app');
    document.body.appendChild(wrap);

    mgr.watchAll();
    const observer = FakeIntersectionObserver.instances[0]!;
    expect(observer.observed.has(wrap)).toBe(true);

    observer.trigger(wrap, false);
    expect(img.getAttribute('src')).toBeNull();

    observer.trigger(wrap, true);
    expect(img.src).toContain('ksu://icon/com.example.app');
    expect(observer.observed.has(wrap)).toBe(false); // unobserved after fetch

    mgr.destroy();
    expect(observer.disconnected).toBe(true);
  });

  it('falls back to the themed icon when no icon source exists', () => {
    const mgr = new AppIconManager();
    const { wrap, img, spin } = mgr.createElements('com.example.app');
    document.body.appendChild(wrap);

    mgr.watchAll();
    FakeIntersectionObserver.instances[0]!.trigger(wrap, true);
    expect(img.src).toContain('data:image/svg+xml,');
    expect(spin.style.display).toBe('none');
    expect(img.style.opacity).toBe('1');
  });

  it('uses the package manager icon stream when present', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    (globalThis as { $packageManager?: unknown }).$packageManager = {
      getApplicationIcon: () => 'content://icon/1',
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => bytes.buffer })));

    const mgr = new AppIconManager();
    const { wrap, img } = mgr.createElements('com.example.app');
    document.body.appendChild(wrap);

    mgr.watchAll();
    FakeIntersectionObserver.instances[0]!.trigger(wrap, true);
    await vi.waitFor(() => {
      expect(img.src).toContain('data:image/png;base64,' + bufToB64(bytes.buffer));
    });
  });
});
