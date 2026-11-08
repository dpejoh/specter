import { beforeAll, describe, expect, it, vi } from 'vitest';

import './dev-mock.js';

interface KsuMock {
  exec: (cmd: string, opts: string, cbName: string) => void;
  spawn: (cmd: string, args: string, opts: string, spName: string) => void;
}

let ksu: KsuMock;
let cbSeq = 0;

function execFor(cmd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const name = `__devmock_cb_${++cbSeq}`;
    (window as unknown as Record<string, unknown>)[name] = (code: number, stdout: string, stderr: string) => {
      resolve({ code, stdout, stderr });
    };
    ksu.exec(cmd, '{}', name);
  });
}

describe('dev-mock bridge', () => {
  beforeAll(() => {
    ksu = (window as unknown as { ksu: KsuMock }).ksu;
  });

  it('installs the ksu mock and seeds demo history', () => {
    expect(ksu).toBeDefined();
    expect(typeof ksu.exec).toBe('function');
    expect(typeof ksu.spawn).toBe('function');
    const history = JSON.parse(localStorage.getItem('specter_script_history') || '[]') as unknown[];
    expect(history).toHaveLength(6);
  });

  it('answers package list commands with the mock catalogs', async () => {
    const user = await execFor('pm list packages -3');
    expect(user.code).toBe(0);
    expect(user.stdout).toContain('com.spotify.music');
    expect(user.stdout).toContain('com.topjohnwu.magisk');

    const sys = await execFor('pm list packages -s');
    expect(sys.stdout).toContain('com.google.android.gms');

    const deny = await execFor('magisk --denylist ls');
    expect(deny.stdout).toContain('com.scottyab.rootbeer');
  });

  it('answers the target list with mode suffixes', async () => {
    const res = await execFor("sh '/data/adb/modules/specter/features/target.sh' --list-raw");
    expect(res.stdout).toContain('com.example.one');
    expect(res.stdout).toContain('com.example.two!');
    expect(res.stdout).toContain('com.example.three?');
  });

  it('serves mock files through cat and reports missing ones as empty', async () => {
    const prop = await execFor("cat '/sdcard/valid.prop'");
    expect(prop.stdout).toContain('FINGERPRINT=google/blazer');
    expect(prop.stdout).toContain('MODEL=Pixel 10 Pro');

    const missing = await execFor("cat '/sdcard/nope.prop'");
    expect(missing.stdout).toBe('');
  });

  it('lists directories and round-trips imported props through cp/rm', async () => {
    const sd = await execFor("ls -1p '/sdcard'");
    expect(sd.stdout).toContain('valid.prop');
    expect(sd.stdout).toContain('Download/');

    const cp = await execFor("cp '/sdcard/valid.prop' '/data/adb/specter/pif_imported/xyz.prop'");
    expect(cp.code).toBe(0);

    const listed = await execFor("ls -1 '/data/adb/specter/pif_imported'/*.prop");
    expect(listed.stdout).toContain('xyz.prop');

    const rm = await execFor("rm -f '/data/adb/specter/pif_imported/xyz.prop'");
    expect(rm.code).toBe(0);
    const after = await execFor("ls -1 '/data/adb/specter/pif_imported'/*.prop");
    expect(after.stdout).not.toContain('xyz.prop');

    const badCp = await execFor("cp '/sdcard/ghost.prop' '/data/adb/specter/pif_imported/g.prop'");
    expect(badCp.code).toBe(1);
  });

  it('spawn emits an empty data event then exit 0', async () => {
    const child = {
      stdout: { emit: vi.fn() },
      emit: vi.fn(),
    };
    (window as unknown as Record<string, unknown>)['__devmock_child'] = child;
    ksu.spawn('script.sh', '[]', '{}', '__devmock_child');
    await vi.waitFor(() => expect(child.emit).toHaveBeenCalledWith('exit', 0));
    expect(child.stdout.emit).toHaveBeenCalledWith('data', '');
  });

  it('intercepts the JSON endpoints used by the WebUI', async () => {
    const info = await (await window.fetch('/json/info.json')).json() as { root: string; android: string };
    expect(info.root).toBe('KernelSU');
    expect(info.android).toBe('15');

    const km = await (await window.fetch('/json/keystore_manager.json')).json() as { id: string; format: string };
    expect(km.id).toBe('omk');
    expect(km.format).toBe('toml');

    const keybox = await (await window.fetch('/json/keybox_info.json')).json() as { installed: boolean };
    expect(keybox.installed).toBe(true);

    const catalog = await (await window.fetch('https://rawbin.dpejoh.com/catalog')).json() as { entries: unknown[] };
    expect(catalog.entries).toHaveLength(3);

    const apps = await (await window.fetch('https://rawbin.dpejoh.com/apps')).json() as Record<string, string>;
    expect(apps['com.spotify.music']).toBe('Spotify');
  });

  it('falls back to synthetic module paths when the dev server has none', async () => {
    const res = await window.fetch('/json/module_paths.json');
    const data = await res.json() as { MODDIR: string };
    expect(data.MODDIR).toBe('/data/adb/modules/specter');
  });
});
