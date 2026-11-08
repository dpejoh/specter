import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const globals = vi.hoisted(() => new Map<string, unknown>());
const { wireRowActivation } = vi.hoisted(() => ({ wireRowActivation: vi.fn() }));

vi.mock('./utils.js', () => ({
  shellEscape: (v: string) => `'${v}'`,
  wireRowActivation,
  setGlobal: (key: string, value: unknown) => { globals.set(key, value); },
  deleteGlobal: (key: string) => { globals.delete(key); },
}));

import { initRedirect, openUrl } from './redirect.js';

describe('redirect', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    globals.clear();
    wireRowActivation.mockClear();
    delete (window as { ksu?: unknown }).ksu;
    vi.stubGlobal('open', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens allowed hosts in a browser tab without the bridge', () => {
    openUrl('https://github.com/dpejoh/specter');
    expect(window.open).toHaveBeenCalledWith('https://github.com/dpejoh/specter', '_blank');

    openUrl('https://t.me/somechannel');
    expect(window.open).toHaveBeenCalledWith('https://t.me/somechannel', '_blank');
  });

  it('rejects unlisted hosts, subdomains of lookalikes and bad protocols', () => {
    openUrl('https://evil.com/phish');
    openUrl('https://github.com.evil.com/phish');
    openUrl('ftp://github.com/file');
    openUrl('not a url');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('allows subdomains of allowed hosts', () => {
    openUrl('https://gist.github.com/dpejoh');
    expect(window.open).toHaveBeenCalledWith('https://gist.github.com/dpejoh', '_blank');
  });

  it('goes through the ksu bridge when available and cleans up its callback', () => {
    const execSpy = vi.fn((_cmd: string, _opts: string, cbName: string) => {
      const cb = globals.get(cbName) as (() => void) | undefined;
      expect(typeof cb).toBe('function');
      cb!();
      expect(globals.has(cbName)).toBe(false);
    });
    (window as { ksu?: unknown }).ksu = { exec: execSpy };

    openUrl('https://github.com/dpejoh/specter');
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining("am start -a android.intent.action.VIEW -d 'https://github.com/dpejoh/specter'"),
      '{}',
      expect.stringMatching(/^rd_/),
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it('initRedirect wires every [data-url] element', () => {
    document.body.innerHTML = `
      <div data-url="https://github.com/a"></div>
      <div data-url="https://t.me/b"></div>
      <div></div>`;
    initRedirect();
    expect(wireRowActivation).toHaveBeenCalledTimes(2);

    const handler = wireRowActivation.mock.calls[0]![1] as () => void;
    handler();
    expect(window.open).toHaveBeenCalledWith('https://github.com/a', '_blank');
  });
});
