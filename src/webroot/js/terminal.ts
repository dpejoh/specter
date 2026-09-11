import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/labs/segmentedbuttonset/outlined-segmented-button-set.js';
import '@material/web/labs/segmentedbutton/outlined-segmented-button.js';
import { openSubPage } from './subpage.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';
import { exec, getDataDir } from './bridge.js';
import { shellEscape } from './utils.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export interface LogEntry {
  content: string;
  error?: boolean;
}

type LogTab = 'action' | 'boot' | 'live';

const MAX_LOGS = 2000;
const liveHistory: LogEntry[] = [];
let currentLogType: LogTab = 'action';
let activeViewportEl: HTMLElement | null = null;
let activeEmptyEl: HTMLElement | null = null;

function renderLine(entry: LogEntry): HTMLElement {
  if (entry.content.trim() === '') {
    return document.createElement('br');
  }
  const p = document.createElement('p');
  p.className = 'logs-terminal-line';
  p.textContent = entry.content;
  if (entry.error) {
    p.classList.add('output-line--error');
  } else if (entry.content.startsWith('>') || entry.content.startsWith('->') || entry.content.startsWith('===')) {
    p.classList.add('logs-line--command');
  }
  return p;
}

export function appendToOutput(content: string, error = false) {
  const entry: LogEntry = { content, error };
  liveHistory.push(entry);
  if (liveHistory.length > MAX_LOGS) {
    liveHistory.shift();
  }

  if (activeViewportEl && currentLogType === 'live') {
    if (activeEmptyEl) activeEmptyEl.style.display = 'none';
    activeViewportEl.appendChild(renderLine(entry));
    activeViewportEl.scrollTop = activeViewportEl.scrollHeight;
  }
}

async function loadDeviceLog(filename: string): Promise<LogEntry[]> {
  try {
    const dir = getDataDir() || '/data/adb/specter';
    const filePath = `${dir}/log/${filename}`;
    const res = await exec(`tail -n 500 ${shellEscape(filePath)} 2>/dev/null || cat ${shellEscape(filePath)} 2>/dev/null || true`);
    const stdout = res.stdout || '';
    if (!stdout.trim()) return [];

    return stdout.split('\n').map(line => ({
      content: line,
      error: /error|fatal|failed/i.test(line) && !line.includes('checked'),
    }));
  } catch (e) {
    console.warn(`Failed to read ${filename}:`, e);
    return [];
  }
}

async function fetchEntriesForTab(tab: LogTab): Promise<LogEntry[]> {
  if (tab === 'action') {
    return loadDeviceLog('action.log');
  }
  if (tab === 'boot') {
    return loadDeviceLog('boot.log');
  }
  return [...liveHistory];
}

async function renderCurrentLog() {
  if (!activeViewportEl) return;
  activeViewportEl.innerHTML = '';

  const entries = await fetchEntriesForTab(currentLogType);
  if (entries.length === 0) {
    if (activeEmptyEl) activeEmptyEl.style.display = 'flex';
  } else {
    if (activeEmptyEl) activeEmptyEl.style.display = 'none';
    const frag = document.createDocumentFragment();
    for (const entry of entries) {
      frag.appendChild(renderLine(entry));
    }
    activeViewportEl.appendChild(frag);
    requestAnimationFrame(() => {
      if (activeViewportEl) activeViewportEl.scrollTop = activeViewportEl.scrollHeight;
    });
  }
}

export function getCurrentLogText(): string {
  if (!activeViewportEl) return '';
  return activeViewportEl.innerText || '';
}

export async function clearCurrentLog() {
  const dir = getDataDir() || '/data/adb/specter';
  if (currentLogType === 'action') {
    await exec(`: > ${shellEscape(dir + '/log/action.log')} 2>/dev/null || true`);
  } else if (currentLogType === 'boot') {
    await exec(`: > ${shellEscape(dir + '/log/boot.log')} 2>/dev/null || true`);
  } else {
    liveHistory.length = 0;
  }
  if (activeViewportEl) activeViewportEl.innerHTML = '';
  if (activeEmptyEl) activeEmptyEl.style.display = 'flex';
}

export async function openLogsSubPage() {
  currentLogType = 'action';

  await openSubPage({
    id: 'logs',
    title: t('terminal_title', 'Logs'),
    description: t('settings_logs_desc', 'View terminal output and execution logs'),
    headerAction: (container) => {
      container.innerHTML = `
        <md-icon-button id="logs-refresh-btn" aria-label="${t('btn_refresh', 'Refresh')}">
          <md-icon aria-hidden="true">refresh</md-icon>
        </md-icon-button>
        <md-icon-button id="logs-copy-btn" aria-label="${t('terminal_copy', 'Copy')}">
          <md-icon aria-hidden="true">content_copy</md-icon>
        </md-icon-button>
        <md-icon-button id="logs-clear-btn" aria-label="${t('terminal_clear', 'Clear')}">
          <md-icon aria-hidden="true">delete_sweep</md-icon>
        </md-icon-button>
      `;

      container.querySelector('#logs-refresh-btn')?.addEventListener('click', async () => {
        await renderCurrentLog();
        showToast(t('toast_refreshed', 'Refreshed'), { icon: 'refresh', type: 'info', autoCloseDelay: 1500 });
      });

      container.querySelector('#logs-copy-btn')?.addEventListener('click', () => {
        const text = getCurrentLogText();
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          showToast(t('terminal_copied', 'Copied!'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2000 });
        }).catch((err) => {
          console.error('Failed to copy logs:', err);
          showToast(t('terminal_copy_failed', 'Failed to copy'), { icon: 'error', type: 'error', autoCloseDelay: 2000 });
        });
      });

      container.querySelector('#logs-clear-btn')?.addEventListener('click', async () => {
        await clearCurrentLog();
        showToast(t('terminal_clear', 'Clear'), { icon: 'delete_sweep', type: 'info', autoCloseDelay: 1500 });
      });
    },
    groups: [
      {
        items: [
          {
            type: 'custom',
            render: (host: HTMLElement) => {
              host.className = 'logs-subpage-wrapper';
              host.innerHTML = `
                <div class="logs-filter-container">
                  <md-outlined-segmented-button-set id="logs-tab-set">
                    <md-outlined-segmented-button value="action" label="Action" ${currentLogType === 'action' ? 'selected' : ''}></md-outlined-segmented-button>
                    <md-outlined-segmented-button value="boot" label="Boot" ${currentLogType === 'boot' ? 'selected' : ''}></md-outlined-segmented-button>
                    <md-outlined-segmented-button value="live" label="Live" ${currentLogType === 'live' ? 'selected' : ''}></md-outlined-segmented-button>
                  </md-outlined-segmented-button-set>
                </div>
                <div class="logs-card">
                  <div class="logs-empty-state" id="logs-empty-view">
                    <md-icon class="logs-empty-icon" aria-hidden="true">terminal</md-icon>
                    <div class="logs-empty-title">${t('logs_empty_title', 'No logs yet')}</div>
                    <div class="logs-empty-desc">${t('logs_empty_desc', 'Script execution and terminal output will appear here')}</div>
                  </div>
                  <div class="logs-viewport" id="logs-viewport"></div>
                </div>
              `;

              activeViewportEl = host.querySelector('#logs-viewport');
              activeEmptyEl = host.querySelector('#logs-empty-view');

              host.querySelectorAll('#logs-tab-set md-outlined-segmented-button').forEach(b => {
                b.addEventListener('click', async () => {
                  const val = (b as HTMLElement & { value: string }).value as LogTab;
                  if (val && val !== currentLogType) {
                    currentLogType = val;
                    host.querySelectorAll('#logs-tab-set md-outlined-segmented-button').forEach(other => {
                      (other as HTMLElement & { selected: boolean }).selected = ((other as HTMLElement & { value: string }).value === val);
                    });
                    await renderCurrentLog();
                  }
                });
              });

              renderCurrentLog().catch(console.error);
            }
          }
        ]
      }
    ],
    onClose: () => {
      activeViewportEl = null;
      activeEmptyEl = null;
    }
  });
}

export function initTerminal() {
  const row = document.getElementById('row-logs');
  if (row) {
    row.addEventListener('click', () => {
      openLogsSubPage().catch(console.error);
    });
    row.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLogsSubPage().catch(console.error);
      }
    });
  }
}
