import { escapeHtml, getFriendlyNames } from './utils.js';
import { STORAGE_KEY, MAX_ENTRIES } from './constants.js';
import { getTranslation } from './i18n.js';
import { showToast } from './toast.js';
import { exec, getDataDir } from './bridge.js';
import { shellEscape } from './utils.js';
import '@material/web/iconbutton/icon-button.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

interface HistoryEntry { script: string; output: string; time: string; code?: number; }

export function getHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

async function fetchDeviceHistory(): Promise<HistoryEntry[]> {
  try {
    const dir = getDataDir() || '/data/adb/specter';
    const r = await exec(`cat ${shellEscape(dir + '/log/history.jsonl')} 2>/dev/null || true`);
    if (!r.stdout) return [];
    return r.stdout.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) as HistoryEntry; } catch { return null; } }).filter((e): e is HistoryEntry => e !== null);
  } catch { return []; }
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

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const ts = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return (t('time_today', 'Today at ')) + ts;
    const yesterday = new Date(now.getTime() - 86400000);
    if (d.toDateString() === yesterday.toDateString()) return (t('time_yesterday', 'Yesterday at ')) + ts;
    return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }) + (t('time_at', ' at ')) + ts;
  } catch { return iso; }
}

export function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t('home_just_now', 'Just now');
    if (m < 60) return `${m}${t('home_min_ago', 'm ago')}`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}${t('home_hour_ago', 'h ago')}`;
    return `${Math.floor(h / 24)}${t('home_day_ago', 'd ago')}`;
  } catch { return ''; }
}

export async function openRecentActivity(devMode = false) {
  const [device, local] = await Promise.all([fetchDeviceHistory(), Promise.resolve(getHistory())]);
  const entries = mergeHistory(local, device);
  if (!entries || entries.length === 0) {
    const d = document.createElement('md-dialog');
    d.innerHTML = `<div slot="headline">${t('history_title', 'Recent Activity')}</div>
      <div slot="content"><div class="activity-empty"><p class="md-typescale-title-medium">${t('history_empty', 'No activity yet')}</p></div></div>
      <div slot="actions"><md-text-button class="dialog-action-close">${t('dialog_close', 'Close')}</md-text-button></div>`;
    document.body.appendChild(d);
    d.querySelector('.dialog-action-close')!.addEventListener('click', () => d.close());
    d.addEventListener('close', () => document.body.removeChild(d));
    d.show();
    return;
  }

  const list = document.createElement('div');
  list.className = 'activity-list';

  for (const entry of entries) {
    const friendlyName = entry.script === 'action.sh' ? 'Action' : (t(getFriendlyNames()[entry.script] ?? '', '') || entry.script);
    const isError = entry.output.includes('[!]') || entry.output.toLowerCase().includes('error');
    const card = document.createElement('md-elevated-card');
    card.className = 'activity-card' + (isError ? ' activity-card--error' : ' activity-card--success');
    card.innerHTML = `<div class="activity-card__header">
        <div class="activity-card__leading"><md-icon class="activity-card__icon">${isError ? 'error' : 'check_circle'}</md-icon></div>
        <div class="activity-card__content"><span class="activity-card__name">${escapeHtml(friendlyName)}</span><span class="activity-card__time">${formatTime(entry.time)}</span></div>
        <div class="activity-card__actions" style="display:flex;align-items:center;gap:4px">
          <md-icon-button class="activity-card__header-copy-btn" aria-label="${t('history_copy', 'Copy')}"><md-icon>content_copy</md-icon></md-icon-button>
        </div>
      </div>`;
    card.querySelector('.activity-card__header-copy-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(entry.output).then(() => showToast(t('history_copied', 'Copied!'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2000 }))
        .catch(() => showToast(t('history_copy_failed', 'Failed to copy'), { icon: 'error', type: 'error', autoCloseDelay: 2000 }));
    });
    if (devMode) {
      const body = document.createElement('div');
      body.className = 'activity-card__body';
      body.innerHTML = `<pre>${escapeHtml(entry.output)}</pre>`;
      card.appendChild(body);
      card.querySelector('.activity-card__header')?.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.activity-card__header-copy-btn')) return;
        body.classList.toggle('open');
      });
    }
    list.appendChild(card);
  }

  const dialog = document.createElement('md-dialog');
  dialog.innerHTML = `<div slot="headline">${t('history_title', 'Recent Activity')}</div>
    <div slot="content"></div>
    <div slot="actions"><md-text-button class="dialog-action-clear">${t('dialog_clear', 'Clear')}</md-text-button><md-text-button class="dialog-action-close">${t('dialog_close', 'Close')}</md-text-button></div>`;
  dialog.querySelector('[slot="content"]')!.appendChild(list);
  document.body.appendChild(dialog);
  dialog.querySelector('.dialog-action-clear')!.addEventListener('click', async () => { clearHistory(); await clearDeviceHistory(); dialog.close(); setTimeout(() => openRecentActivity(devMode), 100); });
  dialog.querySelector('.dialog-action-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.body.removeChild(dialog));
  dialog.show();
}

export async function renderActivityPreview() {
  const container = document.getElementById('activity-list');
  const countEl = document.getElementById('activity-count');
  if (!container) return;

  document.getElementById('clear-history-btn')?.addEventListener('click', () => { clearHistory(); clearDeviceHistory(); renderActivityPreview(); });

  const [device, local] = await Promise.all([fetchDeviceHistory(), Promise.resolve(getHistory())]);
  const allEntries = mergeHistory(local, device);
  const count = allEntries.length;
  if (countEl) countEl.textContent = `${count} ${t('home_events', 'events')}`;
  container.innerHTML = '';

  const VISIBLE = 4;
  for (let i = 0; i < Math.min(count, VISIBLE); i++) {
    const entry = allEntries[i]!;
    const isError = entry.code !== undefined ? entry.code !== 0 : entry.output.toLowerCase().includes('error');
    const friendlyName = entry.script === 'action.sh' ? 'Action' : (t(getFriendlyNames()[entry.script] ?? '', '') || entry.script);
    const stripLog = (l: string) => l.replace(/^\[\d{2}:\d{2}:\d{2}\] \[[DIWE]\] \[[^\]]*\] /, '');
    const desc = entry.output.split('\n').map(stripLog).reverse().find(l => l.trim() && !/^(>|x |\[!\])/.test(l))?.slice(0, 50) || '';
    const item = document.createElement('div');
    item.className = 'recent-activity-item';
    item.innerHTML = `<div class="recent-activity-item-icon recent-activity-item-icon--${isError ? 'error' : 'success'}"><md-icon aria-hidden="true">${isError ? 'error' : 'check_circle'}</md-icon></div>
      <div class="recent-activity-item-content"><p class="recent-activity-item-title">${escapeHtml(friendlyName)}</p><p class="recent-activity-item-desc">${escapeHtml(desc)}</p></div>
      <span class="recent-activity-item-time">${formatRelativeTime(entry.time)}</span>`;
    container.appendChild(item);
  }

  if (count > VISIBLE) {
    const toggle = document.createElement('div');
    toggle.className = 'recent-activity-toggle';
    toggle.textContent = t('home_show_all', 'Show all') + ` (${count})`;
    toggle.addEventListener('click', () => {
      const expanded = toggle.textContent?.startsWith('Show less');
      if (expanded) {
        container.querySelectorAll('.recent-activity-item').forEach((el, i) => (el as HTMLElement).style.display = i >= VISIBLE ? 'none' : '');
        toggle.textContent = t('home_show_all', 'Show all') + ` (${count})`;
      } else {
        for (let i = VISIBLE; i < count; i++) {
          const e = allEntries[i]; if (!e) continue;
          const item = document.createElement('div');
          item.className = 'recent-activity-item';
          item.innerHTML = `<div class="recent-activity-item-icon recent-activity-item-icon--success"><md-icon>check_circle</md-icon></div>
            <div class="recent-activity-item-content"><p class="recent-activity-item-title">${escapeHtml(e.script)}</p></div>`;
          container.insertBefore(item, toggle);
        }
        toggle.textContent = t('home_show_less', 'Show less');
      }
    });
    container.appendChild(toggle);
  }
}
