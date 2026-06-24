import { spawnScript } from './bridge.js';
import { appendToOutput } from './terminal.js';
import { showToast } from './toast.js';
import { showErrorDialog } from './dialog.js';
import { addEntry } from './history.js';
import { escapeHtml } from './utils.js';
import { getTranslation } from './i18n.js';
import { getFriendlyName, isDevMode, setFriendlyNames } from './state.js';

async function confirmDestructive(friendlyName: string): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = document.createElement('md-dialog');
    dialog.className = 'danger-dialog';
    dialog.setAttribute('type', 'alert');
    dialog.innerHTML = `
      <div slot="headline">
        <span class="danger-dialog-icon"><md-icon>warning</md-icon></span>
        ${escapeHtml(friendlyName)}
      </div>
      <div slot="content">
        <p class="danger-dialog-msg">
          ${getTranslation('danger_confirm_msg') || 'This action may affect your device. Are you sure?'}
        </p>
      </div>
      <div slot="actions">
        <md-text-button id="danger-cancel">${getTranslation('dialog_cancel') || 'Cancel'}</md-text-button>
        <md-filled-button id="danger-confirm" class="danger-dialog-confirm">
          ${getTranslation('danger_confirm') || 'Proceed'}
        </md-filled-button>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector('#danger-cancel')!.addEventListener('click', () => { dialog.close(); resolve(false); });
    dialog.querySelector('#danger-confirm')!.addEventListener('click', () => { dialog.close(); resolve(true); });
    dialog.addEventListener('close', () => document.body.removeChild(dialog));
    dialog.show();
  });
}

export async function runDevAction(scriptName: string) {
  const lines: string[] = [];
  appendToOutput(`> ${scriptName}`);
  const dialog = document.createElement('md-dialog');
  dialog.className = 'dev-action-dialog';
  dialog.innerHTML = `
    <div slot="headline">${escapeHtml(scriptName)}</div>
    <div slot="content"><div class="terminal"><pre id="live-output"></pre></div></div>
    <div slot="actions">
      <md-text-button class="dev-action-close">${getTranslation('dialog_close') || 'Close'}</md-text-button>
    </div>
  `;
  document.body.appendChild(dialog);
  dialog.querySelector('.dev-action-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.body.removeChild(dialog));
  dialog.show();
  const pre = dialog.querySelector('#live-output');
  const child = spawnScript(scriptName, 'feature');
  child.stdout.on('data', (line: string) => {
    appendToOutput(line); lines.push(line);
    if (pre) pre.textContent += line + '\n';
    if (pre?.parentElement) pre.parentElement.scrollTop = pre.parentElement.scrollHeight;
  });
  child.stderr.on('data', (line: string) => {
    appendToOutput(line, true); lines.push('[!] ' + line);
    if (pre) pre.textContent += '[!] ' + line + '\n';
    if (pre?.parentElement) pre.parentElement.scrollTop = pre.parentElement.scrollHeight;
  });
  child.on('exit', (code: number) => {
    appendToOutput(`> ${scriptName} exited (code: ${code})`);
    addEntry(scriptName, lines.join('\n'), code);
  });
  child.on('error', (err: Error) => {
    const msg = err.message || getTranslation('simple_toast_error') || 'Failed';
    appendToOutput(`> Error: ${msg}`, true);
    addEntry(scriptName, msg);
  });
}

export async function runSimpleAction(scriptName: string) {
  const i18nKey = getFriendlyName(scriptName);
  const friendlyName = getTranslation(i18nKey) || i18nKey;
  const lines: string[] = [];
  appendToOutput(`> ${friendlyName}`);
  const dialog = document.getElementById('progress-dialog') as MdDialog | null;
  const label = document.getElementById('progress-label');
  const text = document.getElementById('progress-text');
  if (label) label.textContent = friendlyName;
  if (text) text.textContent = getTranslation('simple_dialog_wait') || 'This may take a moment';
  if (dialog) dialog.show();
  const child = spawnScript(scriptName, 'feature');
  child.stdout.on('data', (line: string) => {
    appendToOutput(line); lines.push(line);
  });
  child.stderr.on('data', (line: string) => {
    appendToOutput(line, true); lines.push('[!] ' + line);
  });
  child.on('exit', (code: number) => {
    appendToOutput(`> ${friendlyName} exited (code: ${code})`);
    addEntry(scriptName, lines.join('\n'), code);
    if (dialog) dialog.close();
    if (code !== 0) {
      const errorMsg = lines.find(l => l.includes('Error')) || lines[lines.length - 1] || friendlyName;
      showToast(`${getTranslation('simple_toast_error') || 'Failed'}: ${errorMsg}`, {
        icon: 'error', type: 'error',
        action: getTranslation('simple_toast_view_details') || 'View Details',
        autoCloseDelay: 8000,
        onActionClick: () => {
          showErrorDialog(getTranslation('error_dialog_title') || 'Error Details', escapeHtml(lines.join('\n')));
        },
      });
    } else {
      showToast(getTranslation('toast_success') || 'Done', {
        icon: 'check_circle', type: 'success', autoCloseDelay: 3000,
      });
    }
  });
  child.on('error', (err: Error) => {
    const msg = err.message || getTranslation('simple_toast_error') || 'Failed';
    appendToOutput(`> Error: ${msg}`, true);
    addEntry(scriptName, msg, 1);
    if (dialog) dialog.close();
    showToast(`${getTranslation('simple_toast_error') || 'Failed'}: ${friendlyName}`, {
      icon: 'error', type: 'error',
      action: getTranslation('simple_toast_view_details') || 'View Details',
      autoCloseDelay: 8000,
      onActionClick: () => {
        showErrorDialog(getTranslation('error_dialog_title') || 'Error Details', escapeHtml(msg));
      },
    });
  });
}

export function wireActions() {
  document.querySelectorAll('.list-item[data-script]').forEach(item => {
    const el = item as HTMLElement;
    item.addEventListener('click', async (_e) => {
      if ((el as HTMLButtonElement).disabled) return;
      const scriptName = el.dataset.script || '';
      const isDestructive = el.hasAttribute('data-destructive');
      if (isDestructive) {
        const i18nKey = getFriendlyName(scriptName);
        const friendlyName = getTranslation(i18nKey) || i18nKey;
        const confirmed = await confirmDestructive(friendlyName);
        if (!confirmed) return;
      }
      const spinner = item.querySelector('.action-spinner') as HTMLElement | null;
      (el as HTMLButtonElement).disabled = true;
      spinner?.classList.remove('hidden');
      try {
        if (isDevMode()) {
          await runDevAction(scriptName);
        } else {
          await runSimpleAction(scriptName);
        }
      } catch {
        console.warn('Action error:');
      } finally {
        (el as HTMLButtonElement).disabled = false;
        spinner?.classList.add('hidden');
      }
    });
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
