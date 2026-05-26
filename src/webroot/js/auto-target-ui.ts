import { exec, getModuleDir } from './bridge.js';
import { cfgGet, cfgSet, cfgInvalidate } from './cfg.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';
import { appendToOutput } from './terminal.js';
import { shellEscape } from './utils.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openAutoTargetDialog() {
  const dialog = document.createElement('md-dialog');
  dialog.id = 'auto-target-dialog';

  cfgGet('toggle_auto_target', '0').then(enabled => {
    cfgGet('auto_target_interval', '60').then(interval => {
      dialog.innerHTML = `
        <div slot="headline">
          <div class="at-dialog-headline">
            <md-icon aria-hidden="true">update</md-icon>
            <span>${t('auto_target_title', 'Auto Targeting')}</span>
          </div>
        </div>
        <div slot="content">
          <p class="at-dialog-desc">${t('auto_target_desc', 'Automatically watches for newly installed apps and adds them to Tricky Store target.txt.')}</p>

          <div class="list-container at-dialog-list">
            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">autorenew</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('auto_target_enable', 'Enable Auto Targeting')}</div>
                <span class="supporting-text">${t('auto_target_enable_desc', 'Watch for new app installs')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="at-toggle" ${enabled === '1' ? 'selected' : ''}></md-switch>
            </div>

            <div class="list-item" id="at-interval-row">
              <div class="li-icon"><md-icon aria-hidden="true">timer</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('auto_target_interval', 'Interval (seconds)')}</div>
                <span class="supporting-text">${t('auto_target_interval_desc', 'How often to check for new apps. Minimum 1 second.')}</span>
              </div>
              <div class="spacer"></div>
              <md-outlined-text-field
                id="at-interval"
                inputmode="numeric"
                pattern="[0-9]*"
                min="8"
                value="${interval}"
                class="at-interval-field"
                style="text-align:center"
                aria-label="Interval in seconds"
              ></md-outlined-text-field>
            </div>
          </div>
        </div>
        <div slot="actions">
          <md-text-button id="at-cancel" class="dialog-action-close">${t('dialog_cancel', 'Cancel')}</md-text-button>
          <md-filled-button id="at-save">${t('dialog_save', 'Save')}</md-filled-button>
        </div>
      `;

      document.body.appendChild(dialog);
      dialog.addEventListener('close', () => document.body.removeChild(dialog));

      const toggle = dialog.querySelector('#at-toggle') as MdSwitch;
      const intervalField = dialog.querySelector('#at-interval') as any;
      const saveBtn = dialog.querySelector('#at-save') as HTMLButtonElement;
      const cancelBtn = dialog.querySelector('#at-cancel') as HTMLButtonElement;

      cancelBtn.addEventListener('click', () => dialog.close());

      saveBtn.addEventListener('click', async () => {
        const newEnabled = toggle.selected ? '1' : '0';
        const newInterval = parseInt((intervalField as any).value || '60', 10);
        const clampedInterval = Math.max(8, newInterval);

        saveBtn.disabled = true;

        const modDir = getModuleDir();
        if (!modDir) {
          showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error' as any, autoCloseDelay: 3000 });
          saveBtn.disabled = false;
          return;
        }

        try {
          const oldEnabled = await cfgGet('toggle_auto_target', '0');
          cfgSet('toggle_auto_target', newEnabled);
          cfgSet('auto_target_interval', String(clampedInterval));

          if (modDir) {
            if (newEnabled === '1' && oldEnabled !== '1') {
              await exec(`sh ${shellEscape(modDir + '/features/auto_target.sh')} >/dev/null 2>&1 &`);
              appendToOutput('[AUTO_TARGET] Daemon started via UI');
            } else if (newEnabled === '0' && oldEnabled === '1') {
              await exec(`pkill -f "${shellEscape(modDir + '/features/auto_target.sh')}" 2>/dev/null || true`);
              appendToOutput('[AUTO_TARGET] Daemon stopped via UI');
            }
          }

          cfgInvalidate('toggle_auto_target');
          cfgInvalidate('auto_target_interval');

          showToast(t('auto_target_saved', 'Auto targeting settings saved'), { icon: 'check_circle', type: 'success' as any, autoCloseDelay: 2500 });
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


