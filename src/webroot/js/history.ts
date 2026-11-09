import { afterPaint, escapeHtml, getFriendlyNames } from './utils.js';
import { STORAGE_KEY, MAX_ENTRIES } from './constants.js';
import { t, tf } from './i18n.js';
import { exec, getDataDir } from './bridge.js';
import { shellEscape } from './utils.js';


interface HistoryEntry { script: string; output: string; time: string; code?: number; }

export function getHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

let _deviceHistory: HistoryEntry[] | null = null;
let _lastPreviewSignature = '';

async function fetchDeviceHistory(): Promise<HistoryEntry[]> {
  try {
    const dir = getDataDir() || '/data/adb/specter';
    const r = await exec(`cat ${shellEscape(dir + '/log/history.jsonl')} 2>/dev/null || true`);
    if (!r.stdout) return [];
    return r.stdout.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) as HistoryEntry; } catch { return null; } }).filter((e): e is HistoryEntry => e !== null);
  } catch { return []; }
}

/** Read the device log once per session; Home must not run a shell call per visit. */
async function getDeviceHistory(): Promise<HistoryEntry[]> {
  if (_deviceHistory) return _deviceHistory;
  _deviceHistory = await fetchDeviceHistory();
  return _deviceHistory;
}

function mergeHistory(local: HistoryEntry[], device: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set(local.map(e => e.script + e.time));
  for (const e of device) {
    if (!seen.has(e.script + e.time)) local.push(e);
  }
  return local.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

export function addEntry(scriptName: string, output: string, code?: number) {
  if (typeof output !== 'string') output = String(output || '');
  if (!output.trim()) return;
  const entries = getHistory();
  entries.unshift({ script: scriptName, output, time: new Date().toISOString(), code });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch {}
}

function clearHistory() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

async function clearDeviceHistory() {
  try { await exec('rm -f /data/adb/specter/log/history.jsonl'); } catch {}
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t('home_just_now', 'Just now');
    if (m < 60) return tf('home_min_ago', '{0}m ago', m);
    const h = Math.floor(m / 60);
    if (h < 24) return tf('home_hour_ago', '{0}h ago', h);
    return tf('home_day_ago', '{0}d ago', Math.floor(h / 24));
  } catch { return ''; }
}

let _previewWired = false;

function wirePreviewClear() {
  if (_previewWired) return;
  _previewWired = true;
  document.getElementById('clear-history-btn')?.addEventListener('click', () => {
    clearHistory();
    _deviceHistory = [];
    clearDeviceHistory();
    renderActivityPreview();
  });
}

function renderPreviewEntries(container: HTMLElement, allEntries: HistoryEntry[]) {
  const countEl = document.getElementById('activity-count');
  const count = allEntries.length;
  if (countEl) countEl.textContent = tf('home_events', '{0} events', count);
  container.innerHTML = '';

  const VISIBLE = 4;
  for (let i = 0; i < count; i++) {
    const entry = allEntries[i]!;
    const isError = entry.code !== undefined ? entry.code !== 0 : entry.output.toLowerCase().includes('error');
    const friendlyName = entry.script === 'action.sh' ? t('history_action', 'Action') : (t(getFriendlyNames()[entry.script] ?? '', '') || entry.script);
    const stripLog = (l: string) => l.replace(/^\[\d{2}:\d{2}:\d{2}\] \[[DIWE]\] \[[^\]]*\] /, '');
    const desc = entry.output.split('\n').map(stripLog).reverse().find(l => l.trim() && !/^(>|x |\[!\])/.test(l))?.slice(0, 50) || '';
    const item = document.createElement('div');
    item.className = 'recent-activity-item';
    if (i >= VISIBLE) item.style.display = 'none';
    item.innerHTML = `<div class="recent-activity-item-icon recent-activity-item-icon--${isError ? 'error' : 'success'}"><md-icon aria-hidden="true">${isError ? 'error' : 'check_circle'}</md-icon></div>
      <div class="recent-activity-item-content"><p class="recent-activity-item-title">${escapeHtml(friendlyName)}</p><p class="recent-activity-item-desc">${escapeHtml(desc)}</p></div>
      <span class="recent-activity-item-time">${formatRelativeTime(entry.time)}</span>`;
    container.appendChild(item);
  }

  if (count > VISIBLE) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'recent-activity-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = t('home_show_all', 'Show all') + ` (${count})`;
    let expanded = false;
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      toggle.setAttribute('aria-expanded', String(expanded));
      container.querySelectorAll('.recent-activity-item').forEach((el, i) => {
        (el as HTMLElement).style.display = !expanded && i >= VISIBLE ? 'none' : '';
      });
      toggle.textContent = expanded
        ? t('home_show_less', 'Show less')
        : t('home_show_all', 'Show all') + ` (${count})`;
    });
    container.appendChild(toggle);
  }
}

function previewSignature(entries: HistoryEntry[]): string {
  const first = entries[0];
  return `${entries.length}|${first?.time ?? ''}|${first?.script ?? ''}|${first?.code ?? ''}`;
}

export async function renderActivityPreview(force = false) {
  const container = document.getElementById('activity-list');
  if (!container) return;

  wirePreviewClear();

  // Local history is synchronous; paint it before waiting on the device log.
  const local = getHistory();
  const localSignature = previewSignature(local);
  if (force || localSignature !== _lastPreviewSignature) {
    renderPreviewEntries(container, local);
    _lastPreviewSignature = localSignature;
  }

  const device = await new Promise<HistoryEntry[]>(resolve => {
    afterPaint(() => { getDeviceHistory().then(resolve).catch(() => resolve([])); });
  });
  if (device.length === 0) return;

  const merged = mergeHistory(local, device);
  const mergedSignature = previewSignature(merged);
  if (force || mergedSignature !== _lastPreviewSignature) {
    renderPreviewEntries(container, merged);
    _lastPreviewSignature = mergedSignature;
  }
}
