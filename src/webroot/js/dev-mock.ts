import { getGlobal } from './utils.js';

const MOCK_TARGET_TXT = [
  'com.example.one',
  'com.example.two!',
  'com.example.three?',
].join('\n') + '\n';

const MOCK_USER_PKGS = [
  'com.example.one',
  'com.example.two',
  'com.example.three',
  'com.example.four',
  'com.example.five',
  'com.example.six',
  'com.google.android.apps.photos',
  'com.google.android.youtube',
  'com.google.android.apps.maps',
  'com.google.android.apps.docs',
  'com.google.android.apps.gmail',
  'com.spotify.music',
  'com.twitter.android',
  'com.instagram.android',
  'com.facebook.katana',
  'com.snapchat.android',
  'com.discord',
  'com.slack',
  'com.microsoft.teams',
  'com.android.chrome',
  'org.mozilla.firefox',
  'com.opera.browser',
  'com.termux',
  'io.github.vvb2060.mahoshojo',
  'io.github.vvb2060.keyattestation',
  'com.topjohnwu.magisk',
  'com.dergoogler.mmrl',
  'com.dergoogler.mmrl.wx',
  'io.github.a13e300.ksuwebui',
  'com.henrikherzig.playintegritychecker',
  'com.reveny.nativecheck',
  'com.scottyab.rootbeer',
  'com.zhenxi.hunter',
  'com.byxiaorun.detector',
].join('\n') + '\n';

const MOCK_SYSTEM_PKGS = [
  'com.google.android.gms',
  'com.google.android.gsf',
  'com.android.vending',
  'com.google.android.gm',
  'com.android.systemui',
  'com.android.phone',
  'com.android.settings',
  'com.android.launcher3',
  'com.google.android.inputmethod.latin',
  'com.android.chrome',
].join('\n') + '\n';

const MOCK_DENYLIST = [
  'com.example.one',
  'com.topjohnwu.magisk',
  'com.scottyab.rootbeer',
].join('\n') + '\n';

const MOCK_APP_CATALOG: Record<string, string> = {
  'com.example.one': 'Example One',
  'com.example.two': 'Example Two',
  'com.example.three': 'Example Three',
  'com.example.four': 'Example Four',
  'com.example.five': 'Example Five',
  'com.example.six': 'Example Six',
  'com.google.android.apps.photos': 'Google Photos',
  'com.google.android.youtube': 'YouTube',
  'com.google.android.apps.maps': 'Google Maps',
  'com.google.android.apps.docs': 'Google Docs',
  'com.google.android.apps.gmail': 'Gmail',
  'com.spotify.music': 'Spotify',
  'com.twitter.android': 'Twitter',
  'com.instagram.android': 'Instagram',
  'com.facebook.katana': 'Facebook',
  'com.snapchat.android': 'Snapchat',
  'com.discord': 'Discord',
  'com.slack': 'Slack',
  'com.microsoft.teams': 'Microsoft Teams',
  'com.android.chrome': 'Chrome',
  'org.mozilla.firefox': 'Firefox',
  'com.opera.browser': 'Opera Browser',
  'com.termux': 'Termux',
  'io.github.vvb2060.mahoshojo': 'Maho Shojo',
  'io.github.vvb2060.keyattestation': 'Key Attestation',
  'com.topjohnwu.magisk': 'Magisk',
  'com.dergoogler.mmrl': 'MMRL',
  'com.dergoogler.mmrl.wx': 'MMRL WX',
  'io.github.a13e300.ksuwebui': 'KSU WebUI',
  'com.henrikherzig.playintegritychecker': 'Play Integrity Checker',
  'com.reveny.nativecheck': 'Native Check',
  'com.scottyab.rootbeer': 'Root Beer',
  'com.zhenxi.hunter': 'Hunter',
  'com.byxiaorun.detector': 'Detector',
  'com.google.android.gms': 'Google Play Services',
  'com.google.android.gsf': 'Google Services Framework',
  'com.android.vending': 'Google Play Store',
  'com.android.systemui': 'System UI',
  'com.android.phone': 'Phone',
  'com.android.settings': 'Settings',
  'com.android.launcher3': 'Launcher',
  'com.google.android.inputmethod.latin': 'Gboard',
};

const APP_LABELS_CACHE_PATH = '/data/adb/specter/app_labels.json';

if (typeof window.ksu === 'undefined') {
  const ksuMock = {
    exec(cmd: string, _opts: string, cbName: string) {
      setTimeout(() => {
        const cb = getGlobal<(...args: unknown[]) => void>(cbName);
        if (typeof cb !== 'function') return;

        if (cmd.includes('target.txt')) {
          cb(0, MOCK_TARGET_TXT, '');
        } else if (cmd.includes('pm list packages -3')) {
          cb(0, MOCK_USER_PKGS, '');
        } else if (cmd.includes('pm list packages -s')) {
          cb(0, MOCK_SYSTEM_PKGS, '');
        } else if (cmd.includes('system_app')) {
          cb(0, 'com.google.android.gms\ncom.android.vending\n', '');
        } else if (cmd.includes('magisk --denylist ls')) {
          cb(0, MOCK_DENYLIST, '');
        } else if (cmd.includes(APP_LABELS_CACHE_PATH)) {
          cb(0, '', '');
        } else if (cmd.includes('blacklist.txt')) {
          cb(0, 'com.topjohnwu.magisk\ncom.scottyab.rootbeer\n', '');
        } else if (cmd.includes('mkdir')) {
          cb(0, '', '');
        } else if (cmd.includes('cat >')) {
          cb(0, '', '');
        } else {
          cb(0, '', '');
        }
      }, 50);
    },
    spawn(_cmd: string, _argsJson: string, _opts: string, spName: string) {
      const child = getGlobal<{ stdout?: { emit: (ev: string, data: string) => void }; emit?: (ev: string, code: number) => void }>(spName);
      if (child) {
        setTimeout(() => {
          child.stdout?.emit?.('data', '');
          child.emit?.('exit', 0);
        }, 100);
      }
    },
  };

  Object.defineProperty(window, 'ksu', {
    get() { return ksuMock; },
    configurable: true,
  });

  const origFetch = window.fetch.bind(window);
  window.fetch = function (url: RequestInfo | URL, ...rest: any[]) {
    const u = typeof url === 'string' ? url : (url as Request).url;

    if (u.startsWith('/json/module_paths.json')) {
      return origFetch(u, ...rest).then((r: Response) => {
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || !ct.includes('json')) throw new Error('not found');
        return r;
      }).catch(() =>
        Promise.resolve(new Response(JSON.stringify({ MODDIR: '/data/adb/modules/specter', SPECTER_DIR: '/data/adb/specter' }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }))
      );
    }

    if (u.includes('/json/info.json')) {
      return Promise.resolve(new Response(JSON.stringify({
        android: '15',
        kernel: '6.1.57-android14-8',
        root: 'KernelSU',
        root_sol: 'KernelSU',
        version: 'v1.7.3',
        tee_status: 'normal',
        tee_tier: 2,
        security_patch: '2026-04-05',
        build_patch: '2026-04-05',
        pif_model: 'Google Pixel 8 Pro XL Super Max Ultra Edition',
        flags: { twrp: false, blacklist: false },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }

    if (u.includes('/json/keybox_info.json')) {
      return Promise.resolve(new Response(JSON.stringify({
        installed: true,
        source: 'this-is-a-very-long-provider-name-that-should-definitely-truncate',
        source_version: '52',
        text: 'v52',
        up_to_date: true,
        revoked: false,
        softbanned: false,
        serial: 'abcd1234',
        is_private: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }

    if (u.includes('rawbin.dpejoh.com/catalog')) {
      return Promise.resolve(new Response(JSON.stringify({
        entries: [
          { source: "droidwin", version: "1", text: "v1", serial: "12345", revoked: false, softbanned: false, last_checked: new Date().toISOString(), timestamp: new Date().toISOString() },
          { source: "droidwin", version: "2", text: "v2", serial: "67890", revoked: false, softbanned: true, last_checked: new Date().toISOString(), timestamp: new Date().toISOString() },
          { source: "yuri", version: "8", text: "v8", serial: "11111", revoked: true, softbanned: false, last_checked: new Date().toISOString(), timestamp: new Date().toISOString() },
        ],
        latest: { droidwin: "2", yuri: "8" },
        working: { source: "droidwin", version: "1" },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }

    if (u.includes('rawbin.dpejoh.com/apps')) {
      return Promise.resolve(new Response(JSON.stringify(MOCK_APP_CATALOG), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    }

    return origFetch(u, ...rest);
  };
}

const MOCK_HISTORY = [
  { script: 'keybox.sh', output: 'Keybox rotated from Yuri v51 to v52\nDone', time: new Date(Date.now() - 120000).toISOString() },
  { script: 'pif.sh', output: 'Fingerprint updated successfully\nSTRONG', time: new Date(Date.now() - 840000).toISOString() },
  { script: 'gms.sh', output: 'Play Store force-stopped and cleared\nDone', time: new Date(Date.now() - 3600000).toISOString() },
  { script: 'target.sh', output: 'target.txt regenerated with 28 apps', time: new Date(Date.now() - 7200000).toISOString() },
  { script: 'cleanup.sh', output: 'All detection traces cleared', time: new Date(Date.now() - 14400000).toISOString() },
  { script: 'keybox.sh', output: 'Keybox checked — no update needed', time: new Date(Date.now() - 28800000).toISOString() },
];
if (!localStorage.getItem('specter_script_history')) {
  localStorage.setItem('specter_script_history', JSON.stringify(MOCK_HISTORY));
}

export {};
