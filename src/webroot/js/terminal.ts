import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import { openSubPage } from './subpage.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export interface LogEntry {
  content: string;
  error?: boolean;
}

const MAX_LOGS = 2000;
const logHistory: LogEntry[] = [];
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
  } else if (entry.content.startsWith('>')) {
    p.classList.add('logs-line--command');
  }
  return p;
}

export function appendToOutput(content: string, error = false) {
  const entry: LogEntry = { content, error };
  logHistory.push(entry);
  if (logHistory.length > MAX_LOGS) {
    logHistory.shift();
  }

  if (activeViewportEl) {
    if (activeEmptyEl) activeEmptyEl.style.display = 'none';
    activeViewportEl.appendChild(renderLine(entry));
    activeViewportEl.scrollTop = activeViewportEl.scrollHeight;
  }
}

export function getLogsText(): string {
  return logHistory.map(e => e.content).join('\n');
}

export function clearLogs() {
  logHistory.length = 0;
  if (activeViewportEl) {
    activeViewportEl.innerHTML = '';
  }
  if (activeEmptyEl) {
    activeEmptyEl.style.display = 'flex';
  }
}

export async function openLogsSubPage() {
  await openSubPage({
    id: 'logs',
    title: t('terminal_title', 'Logs'),
    description: t('settings_logs_desc', 'View terminal output and execution logs'),
    headerAction: (container) => {
      container.innerHTML = `
        <md-icon-button id="logs-copy-btn" aria-label="${t('terminal_copy', 'Copy')}">
          <md-icon aria-hidden="true">content_copy</md-icon>
        </md-icon-button>
        <md-icon-button id="logs-clear-btn" aria-label="${t('terminal_clear', 'Clear')}">
          <md-icon aria-hidden="true">delete_sweep</md-icon>
        </md-icon-button>
      `;

      container.querySelector('#logs-copy-btn')?.addEventListener('click', () => {
        const text = getLogsText();
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          showToast(t('terminal_copied', 'Copied!'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2000 });
        }).catch((err) => {
          console.error('Failed to copy logs:', err);
          showToast(t('terminal_copy_failed', 'Failed to copy'), { icon: 'error', type: 'error', autoCloseDelay: 2000 });
        });
      });

      container.querySelector('#logs-clear-btn')?.addEventListener('click', () => {
        clearLogs();
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
                <div class="logs-card">
                  <div class="logs-empty-state" id="logs-empty-view" ${logHistory.length > 0 ? 'style="display: none;"' : ''}>
                    <md-icon class="logs-empty-icon" aria-hidden="true">terminal</md-icon>
                    <div class="logs-empty-title">${t('logs_empty_title', 'No logs yet')}</div>
                    <div class="logs-empty-desc">${t('logs_empty_desc', 'Script execution and terminal output will appear here')}</div>
                  </div>
                  <div class="logs-viewport" id="logs-viewport"></div>
                </div>
              `;

              activeViewportEl = host.querySelector('#logs-viewport');
              activeEmptyEl = host.querySelector('#logs-empty-view');

              if (activeViewportEl && logHistory.length > 0) {
                const frag = document.createDocumentFragment();
                for (const entry of logHistory) {
                  frag.appendChild(renderLine(entry));
                }
                activeViewportEl.appendChild(frag);
                requestAnimationFrame(() => {
                  if (activeViewportEl) activeViewportEl.scrollTop = activeViewportEl.scrollHeight;
                });
              }
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
