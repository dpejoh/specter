// Shared regenerate confirmation used by both app-list pages. Callers pass
// translated copy, their script runner, and their log strings so the dialog
// shape and async restore behavior stay identical without sharing page keys.
import { showDialog } from './dialog.js';
import { escapeHtml } from './utils.js';
import { showToast } from './toast.js';
import { appendToOutput } from './terminal.js';

export interface AppRegenerateDialogOptions {
  confirmId: string;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  successLabel: string;
  loading: HTMLElement;
  list: HTMLElement;
  run: () => Promise<void>;
  refresh: () => Promise<void>;
  logStart: string;
  logDone: string;
  logFailed: string;
}

export function openAppRegenerateDialog(options: AppRegenerateDialogOptions): void {
  const d = showDialog(
    escapeHtml(options.title),
    `<p class="supporting-text">${escapeHtml(options.body)}</p>`,
    `<md-text-button class="dialog-action-close">${escapeHtml(options.cancelLabel)}</md-text-button>
     <md-filled-button id="${escapeHtml(options.confirmId)}">${escapeHtml(options.confirmLabel)}</md-filled-button>`
  );

  d.querySelector(`#${options.confirmId}`)!.addEventListener('click', async () => {
    d.close();
    options.loading.style.display = '';
    options.list.style.display = 'none';

    appendToOutput(options.logStart);
    try {
      await options.run();
      appendToOutput(options.logDone);
      showToast(options.successLabel, { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
      await options.refresh();
    } catch (e) {
      appendToOutput(`${options.logFailed}: ${e}`, true);
    } finally {
      options.loading.style.display = 'none';
      options.list.style.display = '';
    }
  });

  d.querySelector('.dialog-action-close')!.addEventListener('click', () => d.close());
}
