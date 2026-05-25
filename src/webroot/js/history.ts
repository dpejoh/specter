import { escapeHtml } from './utils.js';
import { getFriendlyNames } from './state.js';
import { STORAGE_KEY, MAX_ENTRIES } from './constants.js';
import { getTranslation } from './i18n.js';
import { showToast } from './toast.js';
import '@material/web/iconbutton/icon-button.js';

interface HistoryEntry {
  script: string;
  output: string;
  time: string;
}

function getHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) { console.warn('Failed to parse history:', e); return []; }
}

export function addEntry(scriptName: string, output: string) {
  if (typeof output !== 'string') output = String(output || '');
  if (!output.trim()) return;
  const entries = getHistory();
  entries.unshift({ script: scriptName, output, time: new Date().toISOString() });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch (e) { console.warn('Failed to save history:', e); }
}

function clearHistory() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { console.warn('Failed to clear history:', e); }
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const oneDay = 86400000;
    const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    if (diff < oneDay && date.getDate() === now.getDate()) {
      return (getTranslation('time_today') || 'Today at ') + timeStr;
    }
    if (diff < 2 * oneDay && date.getDate() === new Date(now.getTime() - oneDay).getDate()) {
      return (getTranslation('time_yesterday') || 'Yesterday at ') + timeStr;
    }
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + (getTranslation('time_at') || ' at ') + timeStr;
    }
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) { console.warn('Failed to parse date:', e);
    return isoString;
  }
}

function isErrorOutput(output: string): boolean {
  return output.includes('[!]') || output.toLowerCase().includes('error');
}

export async function openRecentActivity(devMode = false) {
  const entries = getHistory();
  if (!entries || entries.length === 0) {
    const dialog = document.createElement('md-dialog');
    dialog.innerHTML = `
      <div slot="headline">${getTranslation('history_title') || 'Recent Activity'}</div>
      <div slot="content">
        <div class="activity-empty">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--md-sys-color-outline)"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18m-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
          <p class="md-typescale-title-medium">${getTranslation('history_empty') || 'No activity yet - run an action to get started'}</p>
        </div>
      </div>
      <div slot="actions">
        <md-text-button class="dialog-action-close">${getTranslation('dialog_close') || 'Close'}</md-text-button>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector('.dialog-action-close')!.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => document.body.removeChild(dialog));
    dialog.show();
    return;
  }

  const list = document.createElement('div');
  list.className = 'activity-list';

  entries.forEach((entry, index) => {
    const i18nKey = getFriendlyNames()[entry.script];
    const friendlyName = (i18nKey && getTranslation(i18nKey)) || entry.script;
    const isError = isErrorOutput(entry.output);
    const statusIcon = isError ? 'error' : 'check_circle';

    const card = document.createElement('md-elevated-card');
    card.className = 'activity-card' + (isError ? ' activity-card--error' : ' activity-card--success');

    card.innerHTML = `
      <div class="activity-card__header">
        <div class="activity-card__leading">
          <md-icon class="activity-card__icon">${statusIcon}</md-icon>
        </div>
        <div class="activity-card__content">
          <span class="activity-card__name">${escapeHtml(friendlyName)}</span>
          <span class="activity-card__time">${formatTime(entry.time)}</span>
        </div>
        <div class="activity-card__actions" style="display:flex;align-items:center;gap:4px">
          <md-icon-button class="activity-card__header-copy-btn" aria-label="${getTranslation('history_copy') || 'Copy'}">
            <md-icon>content_copy</md-icon>
          </md-icon-button>
          ${devMode ? `<md-icon class="activity-card__chevron">expand_more</md-icon>` : ''}
        </div>
      </div>
      ${devMode ? `<div class="activity-card__body">
        <pre>${escapeHtml(entry.output)}</pre>
      </div>` : ''}
    `;

    const header = card.querySelector('.activity-card__header');
    const copyBtn = card.querySelector('.activity-card__header-copy-btn');

    copyBtn!.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(entry.output).then(() => {
        showToast(getTranslation('history_copied') || 'Copied!', { icon: 'check_circle', type: 'success' as any, autoCloseDelay: 2000 });
      }).catch(() => {
        showToast(getTranslation('history_copy_failed') || 'Failed to copy', { icon: 'error', type: 'error' as any, autoCloseDelay: 2000 });
      });
    });

    if (devMode) {
      const body = card.querySelector('.activity-card__body');
      const chevron = card.querySelector('.activity-card__chevron');

      function toggle() {
        const isOpen = body!.classList.toggle('open');
        chevron!.classList.toggle('expanded', isOpen);
      }

      header!.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.activity-card__header-copy-btn')) return;
        toggle();
      });
    }

    list.appendChild(card);
  });

  const dialog = document.createElement('md-dialog');
  dialog.innerHTML = `
    <div slot="headline">${getTranslation('history_title') || 'Recent Activity'}</div>
    <div slot="content"></div>
    <div slot="actions">
      <md-text-button class="dialog-action-clear">${getTranslation('dialog_clear') || 'Clear'}</md-text-button>
      <md-text-button class="dialog-action-close">${getTranslation('dialog_close') || 'Close'}</md-text-button>
    </div>
  `;
  dialog.querySelector('[slot="content"]')!.appendChild(list);
  document.body.appendChild(dialog);

  dialog.querySelector('.dialog-action-clear')!.addEventListener('click', async () => {
    clearHistory();
    dialog.close();
    setTimeout(() => openRecentActivity(), 100);
  });
  dialog.querySelector('.dialog-action-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.body.removeChild(dialog));
  dialog.show();
}
