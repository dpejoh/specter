import { spawnScript } from './bridge.js';
import { appendToOutput } from './terminal.js';
import { showToast, showLoadingToast, updateToast } from './toast.js';
import { showConfirm, showErrorDialog } from './dialog.js';
import { addEntry } from './history.js';
import { setFriendlyNames } from './utils.js';
import { getTranslation } from './i18n.js';
import { getFriendlyName } from './utils.js';

async function confirmDestructive(friendlyName: string, msgKey?: string): Promise<boolean> {
  const msg = msgKey
    ? (getTranslation(msgKey) || getTranslation('danger_confirm_msg') || 'This action may affect your device. Are you sure?')
    : (getTranslation('danger_confirm_msg') || 'This action may affect your device. Are you sure?');
  return showConfirm(friendlyName, msg, { variant: 'danger' });
}

let actionChain: Promise<unknown> = Promise.resolve();

export interface RunActionOptions {
  /**
   * 'dialog' (default): the blocking progress dialog owns the wait.
   * 'toast': no dialog — one loading toast owns the whole lifecycle and
   * morphs into the result, while the initiating control shows its own
   * busy state. Use for actions launched from a button that can do so.
   */
  feedback?: 'dialog' | 'toast';
  loadingLabel?: string;
  successLabel?: string;
}

export function runAction(scriptName: string, friendlyNameKey?: string, options?: RunActionOptions): Promise<number> {
  const next = actionChain.then(
    () => runActionInternal(scriptName, friendlyNameKey, options),
    () => runActionInternal(scriptName, friendlyNameKey, options),
  );
  actionChain = next.catch(() => {});
  return next;
}

async function runActionInternal(scriptName: string, friendlyNameKey?: string, options?: RunActionOptions): Promise<number> {
  const i18nKey = friendlyNameKey || getFriendlyName(scriptName);
  const friendlyName = getTranslation(i18nKey) || i18nKey;
  const lines: string[] = [];
  appendToOutput(`> ${friendlyName}`);
  const useToast = options?.feedback === 'toast';
  const dialog = useToast ? null : document.getElementById('progress-dialog') as MdDialog | null;
  let loadingToast: HTMLElement | null = null;
  if (useToast) {
    loadingToast = showLoadingToast(options?.loadingLabel || friendlyName);
  } else {
    const label = document.getElementById('progress-label');
    const text = document.getElementById('progress-text');
    if (label) label.textContent = friendlyName;
    if (text) text.textContent = getTranslation('simple_dialog_wait') || 'This may take a moment';
    if (dialog) dialog.show();
  }

  return new Promise<number>(resolve => {
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      if (dialog?.hasAttribute('open')) dialog.close();
      resolve(code);
    };
    const child = spawnScript(scriptName, 'feature');
    child.stdout.on('data', (line: string) => {
      appendToOutput(line);
      lines.push(line);
    });
    child.stderr.on('data', (line: string) => {
      appendToOutput(line, true);
      lines.push('[!] ' + line);
    });
    const settleToast = (message: string, toastOptions: Parameters<typeof showToast>[1]) => {
      if (loadingToast) updateToast(loadingToast, message, toastOptions);
      else showToast(message, toastOptions);
    };
    child.on('exit', (code: number) => {
      const output = lines.join('\n');
      appendToOutput(`> ${friendlyName} exited (code: ${code})`);
      addEntry(scriptName, output, code);
      if (code !== 0) {
        const errorMsg = lines.find(l => l.includes('Error')) || lines[lines.length - 1] || friendlyName;
        settleToast(`${getTranslation('simple_toast_error') || 'Failed'}: ${errorMsg}`, {
          icon: 'error', type: 'error',
          action: getTranslation('simple_toast_view_details') || 'View Details', autoCloseDelay: 8000,
          onActionClick: () => showErrorDialog(getTranslation('error_dialog_title') || 'Error Details', output),
        });
      } else {
        settleToast(options?.successLabel || getTranslation('toast_success') || 'Done', { icon: 'check_circle', type: 'success', autoCloseDelay: 3000 });
      }
      finish(code);
    });
    child.on('error', (err: Error) => {
      const msg = err.message || getTranslation('simple_toast_error') || 'Failed';
      appendToOutput(`> Error: ${msg}`, true);
      addEntry(scriptName, msg, 1);
      settleToast(`${getTranslation('simple_toast_error') || 'Failed'}: ${friendlyName}`, {
        icon: 'error', type: 'error',
        action: getTranslation('simple_toast_view_details') || 'View Details', autoCloseDelay: 8000,
        onActionClick: () => showErrorDialog(getTranslation('error_dialog_title') || 'Error Details', msg),
      });
      finish(1);
    });
  });
}

type SettingsRowElement = HTMLElement & { disabled: boolean; loading: boolean };

export function wireActions() {
  document.querySelectorAll('sp-settings-row[data-script]').forEach(item => {
    const el = item as SettingsRowElement;

    const activate = async () => {
      if (el.disabled) return;
      const scriptName = el.dataset.script || '';
      const isDestructive = el.hasAttribute('data-destructive');
      if (isDestructive) {
        const i18nKey = getFriendlyName(scriptName);
        const friendlyName = getTranslation(i18nKey) || i18nKey;
        const confirmed = await confirmDestructive(friendlyName, el.dataset.confirmI18n);
        if (!confirmed) return;
      }

      el.disabled = true;
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('aria-busy', 'true');
      el.loading = true;

      try {
        await runAction(scriptName);
        if (scriptName === 'restore_defaults.sh') {
          const { refreshControlToggles } = await import('./toggles.js');
          await refreshControlToggles();
        }
      } catch { console.warn('Action error:'); }
      finally {
        el.disabled = false;
        el.removeAttribute('aria-disabled');
        el.removeAttribute('aria-busy');
        el.loading = false;
      }
    };

    el.addEventListener('sp-activate', () => { void activate(); });
  });
}

export function buildFriendlyNames() {
  const names: Record<string, string> = {};
  document.querySelectorAll('[data-script]').forEach(item => {
    const el = item as HTMLElement;
    const scriptName = el.dataset.script;
    if (!scriptName) return;
    const i18nEls = item.querySelectorAll('[data-i18n]');
    const titleEl = i18nEls[0] as HTMLElement | null;
    const descEl = i18nEls[1] as HTMLElement | null;
    if (titleEl) names[scriptName] = titleEl.dataset.i18n || '';
    if (descEl) names[scriptName + '_desc'] = descEl.dataset.i18n || '';
  });
  setFriendlyNames(names);
}
