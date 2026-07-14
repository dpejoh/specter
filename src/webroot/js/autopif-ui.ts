import '@material/web/button/filled-button.js';
import { cfgGet, cfgSet } from './cfg.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

const HOURS_TO_SECONDS = 3600;
const DEFAULT_HOURS = 24;

export function openAutopifDialog() {
  const dialog = document.createElement('md-dialog');
  dialog.id = 'autopif-dialog';

  cfgGet('autopif_interval', String(DEFAULT_HOURS * HOURS_TO_SECONDS)).then(interval => {
    const hours = String(Math.round(parseInt(interval || String(DEFAULT_HOURS * HOURS_TO_SECONDS), 10) / HOURS_TO_SECONDS) || DEFAULT_HOURS);

    dialog.innerHTML = `
      <div slot="headline">
        <div class="ap-dialog-headline">
          <md-icon aria-hidden="true">fingerprint</md-icon>
          <span>${t('autopif_title', 'Auto PIF')}</span>
        </div>
      </div>
      <div slot="content">
        <p class="ap-dialog-desc">${t('autopif_desc', 'Automatically fetches new Play Integrity fingerprints at a set interval.')}</p>

        <div class="list-item">
          <div class="li-icon"><md-icon aria-hidden="true">schedule</md-icon></div>
          <div class="list-item-content">
            <div class="toggle-text">${t('autopif_interval', 'Interval (hours)')}</div>
            <span class="supporting-text">${t('autopif_interval_desc', 'How often to check for new fingerprints. Default 24 hours (1 day).')}</span>
          </div>
          <div class="spacer"></div>
          <input type="number" id="ap-interval" class="ap-interval-input" min="1" value="${hours}" aria-label="${t('autopif_interval', 'Interval (hours)')}">
        </div>
      </div>
      <div slot="actions">
        <md-text-button id="ap-cancel">${t('dialog_cancel', 'Cancel')}</md-text-button>
        <md-filled-button id="ap-save">${t('dialog_save', 'Save')}</md-filled-button>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => document.body.removeChild(dialog));

    const intervalInput = dialog.querySelector('#ap-interval') as HTMLInputElement;
    const saveBtn = dialog.querySelector('#ap-save') as HTMLElement;
    const cancelBtn = dialog.querySelector('#ap-cancel') as HTMLElement;

    cancelBtn.addEventListener('click', () => dialog.close());

    saveBtn.addEventListener('click', () => {
      (saveBtn as HTMLButtonElement).disabled = true;
      try {
        const num = parseInt(intervalInput.value || String(DEFAULT_HOURS), 10);
        const seconds = String(Math.max(1, num) * HOURS_TO_SECONDS);
        cfgSet('autopif_interval', seconds);
        showToast(t('autopif_saved', 'Auto PIF settings saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        dialog.close();
      } finally {
        (saveBtn as HTMLButtonElement).disabled = false;
      }
    });

    dialog.show();
  });
}

export function wireAutopif() {
  const row = document.getElementById('toggle-background_autopif-row');
  if (!row) return;
  const content = row.querySelector('.list-item-content') as HTMLElement | null;
  if (!content) return;
  content.style.cursor = 'pointer';
  content.addEventListener('click', openAutopifDialog);
}
