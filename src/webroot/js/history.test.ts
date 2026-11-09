import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  deviceLog: '',
}));

const { exec } = vi.hoisted(() => ({
  exec: vi.fn(async () => ({ stdout: h.deviceLog, stderr: '', code: 0 })),
}));

vi.mock('./bridge.js', () => ({ exec, getDataDir: () => '/data/adb/specter' }));
vi.mock('./utils.js', () => ({
  shellEscape: (v: string) => `'${v}'`,
  escapeHtml: (v: string) => v,
  getFriendlyNames: () => ({ 'keybox.sh': 'act_keybox' }),
  afterPaint: (cb: () => void) => { cb(); },
}));
// Fallback-less lookups (friendly-name keys) resolve to the key itself,
// mirroring a translation hit; everything else uses its literal fallback.
vi.mock('./i18n.js', () => ({
  t: (key: string, fallback = '') => (fallback !== '' ? fallback : key || ''),
  tf: (key: string, fallback = '', ...values: Array<string | number>) =>
    (fallback !== '' ? fallback : key || '').replace(/\{(\d+)\}/g, (match: string, index: string) =>
      values[Number(index)] === undefined ? match : String(values[Number(index)])),
}));

type HistoryModule = typeof import('./history.js');
let H: HistoryModule;

const KEY = 'specter_script_history';
const minsAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString();

function seedLocal(entries: unknown[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

function setupDom() {
  document.body.innerHTML = `
    <span id="activity-count"></span>
    <div id="activity-list"></div>
    <button id="clear-history-btn"></button>`;
}

describe('history', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    localStorage.removeItem(KEY);
    h.deviceLog = '';
    exec.mockClear();
    // Fresh module per test: the device-history cache and preview wiring
    // are module-level state by design (read once per session).
    vi.resetModules();
    H = await import('./history.js');
  });

  it('parses stored history and tolerates corrupt data', () => {
    seedLocal([{ script: 'a.sh', output: 'ok', time: minsAgo(1) }]);
    expect(H.getHistory()).toHaveLength(1);

    localStorage.setItem(KEY, '{not json');
    expect(H.getHistory()).toEqual([]);
  });

  it('addEntry prepends, stamps and persists; empty output is ignored', () => {
    seedLocal([{ script: 'old.sh', output: 'old', time: minsAgo(90) }]);
    H.addEntry('new.sh', 'fresh output', 0);
    H.addEntry('blank.sh', '   ');

    const stored = H.getHistory();
    expect(stored.map(e => e.script)).toEqual(['new.sh', 'old.sh']);
    expect(stored[0]!.code).toBe(0);
    expect(new Date(stored[0]!.time).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it('addEntry caps the stored list at MAX_ENTRIES', () => {
    const many = Array.from({ length: 245 }, (_, i) => ({
      script: `s${i}.sh`, output: 'x', time: minsAgo(i),
    }));
    seedLocal(many);
    H.addEntry('newest.sh', 'x');
    expect(H.getHistory()).toHaveLength(240);
    expect(H.getHistory()[0]!.script).toBe('newest.sh');
  });

  it('renders the local preview with counts, states and relative times', async () => {
    setupDom();
    seedLocal([
      { script: 'keybox.sh', output: 'all good\nDone', time: minsAgo(5), code: 0 },
      { script: 'target.sh', output: 'step\nError happened', time: minsAgo(180), code: 2 },
      { script: 'action.sh', output: 'ran', time: minsAgo(60 * 30), code: 0 },
    ]);

    await H.renderActivityPreview();
    const items = document.querySelectorAll('.recent-activity-item');
    expect(items).toHaveLength(3);
    expect(document.getElementById('activity-count')?.textContent).toBe('3 events');
    expect(items[0]!.querySelector('.recent-activity-item-title')?.textContent).toBe('act_keybox');
    expect(items[0]!.querySelector('.recent-activity-item-time')?.textContent).toBe('5m ago');
    expect(items[0]!.querySelector('.recent-activity-item-icon--success')).not.toBeNull();
    expect(items[1]!.querySelector('.recent-activity-item-icon--error')).not.toBeNull();
    expect(items[1]!.querySelector('.recent-activity-item-time')?.textContent).toBe('3h ago');
    expect(items[2]!.querySelector('.recent-activity-item-title')?.textContent).toBe('Action');
    expect(items[2]!.querySelector('.recent-activity-item-time')?.textContent).toBe('1d ago');
  });

  it('collapses entries beyond four behind a show-all toggle', async () => {
    setupDom();
    seedLocal(Array.from({ length: 6 }, (_, i) => ({
      script: `s${i}.sh`, output: `run ${i}`, time: minsAgo(i + 1), code: 0,
    })));

    await H.renderActivityPreview();
    const items = [...document.querySelectorAll<HTMLElement>('.recent-activity-item')];
    expect(items).toHaveLength(6);
    expect(items[4]!.style.display).toBe('none');
    expect(items[5]!.style.display).toBe('none');

    const toggle = document.querySelector('.recent-activity-toggle') as HTMLButtonElement;
    expect(toggle.textContent).toContain('Show all (6)');
    toggle.click();
    expect(items[4]!.style.display).toBe('');
    expect(toggle.textContent).toContain('Show less');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    expect(items[4]!.style.display).toBe('none');
  });

  it('merges device history, dropping duplicates and corrupt lines', async () => {
    setupDom();
    const sharedTime = minsAgo(10);
    seedLocal([{ script: 'keybox.sh', output: 'local copy', time: sharedTime, code: 0 }]);
    h.deviceLog = [
      JSON.stringify({ script: 'keybox.sh', output: 'device copy', time: sharedTime, code: 0 }),
      JSON.stringify({ script: 'pif.sh', output: 'device only', time: minsAgo(2), code: 0 }),
      '{corrupt line',
    ].join('\n');

    await H.renderActivityPreview(true);
    const titles = [...document.querySelectorAll('.recent-activity-item-title')].map(el => el.textContent);
    expect(titles).toEqual(['pif.sh', 'act_keybox']);
    expect(document.getElementById('activity-count')?.textContent).toBe('2 events');
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('history.jsonl'));
  });

  it('clears local and device history from the clear button', async () => {
    setupDom();
    seedLocal([{ script: 'a.sh', output: 'x', time: minsAgo(1), code: 0 }]);
    await H.renderActivityPreview();
    expect(document.querySelectorAll('.recent-activity-item')).toHaveLength(1);

    exec.mockClear();
    document.getElementById('clear-history-btn')!.click();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(exec).toHaveBeenCalledWith('rm -f /data/adb/specter/log/history.jsonl');
    expect(document.querySelectorAll('.recent-activity-item')).toHaveLength(0);
  });

  it('does nothing without an activity container', async () => {
    document.body.innerHTML = '';
    await expect(H.renderActivityPreview()).resolves.toBeUndefined();
    expect(exec).not.toHaveBeenCalled();
  });
});
