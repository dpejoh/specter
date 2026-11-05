import { escapeHtml } from './utils.js';
import { getTranslation } from './i18n.js';

export type DialogVariant = 'normal' | 'danger';

export interface ConfirmOptions {
  variant?: DialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function createDialog(headline: string, content: string, actions: string): MdDialog {
  const dialog = document.createElement('md-dialog');
  dialog.innerHTML = `
    <div slot="headline">${headline}</div>
    <div slot="content">${content}</div>
    <div slot="actions">${actions}</div>
  `;
  document.body.appendChild(dialog);
  // `closed` fires after the closing animation; `close` would remove the
  // element mid-animation and defeat focus restoration.
  dialog.addEventListener('closed', () => dialog.remove());
  return dialog;
}

export function showDialog(headline: string, content: string, actions: string): MdDialog {
  const dialog = createDialog(headline, content, actions);
  dialog.show();
  return dialog;
}

export function showConfirm(title: string, message: string, options: ConfirmOptions = {}): Promise<boolean> {
  const { variant = 'normal', confirmLabel, cancelLabel } = options;
  const isDanger = variant === 'danger';
  return new Promise(resolve => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const dialog = showDialog(
      escapeHtml(title),
      `<p class="danger-dialog-msg">${escapeHtml(message)}</p>`,
      `<md-text-button id="dialog-cancel">${escapeHtml(cancelLabel || getTranslation('dialog_cancel') || 'Cancel')}</md-text-button>
       <md-filled-button id="dialog-confirm"${isDanger ? ' class="danger-dialog-confirm"' : ''}>${escapeHtml(confirmLabel || (isDanger ? (getTranslation('danger_confirm') || 'Proceed') : (getTranslation('dialog_confirm') || 'OK')))}</md-filled-button>`
    );

    dialog.querySelector('#dialog-cancel')!.addEventListener('click', () => { settle(false); dialog.close(); });
    dialog.querySelector('#dialog-confirm')!.addEventListener('click', () => { settle(true); dialog.close(); });
    // Escape and scrim click must settle the promise too.
    dialog.addEventListener('cancel', () => settle(false));
    dialog.addEventListener('closed', () => settle(false));
  });
}

export function showErrorDialog(title: string, content: string) {
  const dialog = showDialog(
    escapeHtml(title),
    `<div class="error-dialog-content"><div class="terminal"><pre id="dialog-error-output"></pre></div></div>`,
    `<md-text-button class="dialog-action-close">${escapeHtml(getTranslation('dialog_close') || 'Close')}</md-text-button>`
  );
  // Set raw output as text, not HTML: this is the single escaping boundary.
  const output = dialog.querySelector('#dialog-error-output');
  if (output) output.textContent = content;
  dialog.querySelector('.dialog-action-close')!.addEventListener('click', () => dialog.close());
}
