import { cfgGet, cfgSet, cfgInvalidate } from './cfg.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openGmsDialog() {
  const dialog = document.createElement('md-dialog');

  cfgGet('action_gms_force_stop', '1').then(forceStop => {
    cfgGet('action_gms_clear_data', '1').then(clearData => {
      dialog.innerHTML = `
        <div slot="headline">
          <div class="at-dialog-headline">
            <md-icon aria-hidden="true">block</md-icon>
            <span>${t('gms_dialog_title', 'Kill Play Store')}</span>
          </div>
        </div>
        <div slot="content">
          <p class="at-dialog-desc">${t('gms_dialog_desc', 'Choose which GMS cleanup actions to run when triggered.')}</p>
          <div class="list-container at-dialog-list">
            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">stop</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('gms_force_stop', 'Force-stop GMS Processes')}</div>
                <span class="supporting-text">${t('gms_force_stop_desc', 'Kill droidguard and force-stop Play Store, GMS, GSF, Chrome, SafetyCore, and related GMS processes')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="gms-force-stop" ${forceStop === '1' ? 'selected' : ''}></md-switch>
            </div>

            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">delete</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('gms_clear_data', 'Clear Play Store Data')}</div>
                <span class="supporting-text">${t('gms_clear_data_desc', 'Run pm clear on Play Store to reset its state')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="gms-clear-data" ${clearData === '1' ? 'selected' : ''}></md-switch>
            </div>
          </div>
        </div>
        <div slot="actions">
          <md-text-button id="gms-cancel" class="dialog-action-close">${t('dialog_cancel', 'Cancel')}</md-text-button>
          <md-filled-button id="gms-save">${t('dialog_save', 'Save')}</md-filled-button>
        </div>
      `;

      document.body.appendChild(dialog);
      dialog.addEventListener('close', () => document.body.removeChild(dialog));

      const saveBtn = dialog.querySelector('#gms-save') as HTMLButtonElement;
      const cancelBtn = dialog.querySelector('#gms-cancel') as HTMLButtonElement;

      cancelBtn.addEventListener('click', () => dialog.close());

      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
          const fs = dialog.querySelector('#gms-force-stop') as MdSwitch;
          const cd = dialog.querySelector('#gms-clear-data') as MdSwitch;
          cfgSet('action_gms_force_stop', fs.selected ? '1' : '0');
          cfgSet('action_gms_clear_data', cd.selected ? '1' : '0');
          cfgInvalidate('action_gms_force_stop');
          cfgInvalidate('action_gms_clear_data');
          showToast(t('toast_success', 'Done'), { icon: 'check_circle', type: 'success' as any, autoCloseDelay: 2500 });
          dialog.close();
        } catch (e) {
          showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error' as any, autoCloseDelay: 3000 });
        } finally {
          saveBtn.disabled = false;
        }
      });

      dialog.show();
    });
  });
}

export function wireGms() {
  const row = document.getElementById('toggle-action_gms-row');
  if (!row) return;
  const content = row.querySelector('.list-item-content') as HTMLElement | null;
  if (!content) return;
  content.style.cursor = 'pointer';
  content.addEventListener('click', openGmsDialog);
}
