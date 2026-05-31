import { cfgGet, cfgSet, cfgInvalidate } from './cfg.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openPropHandlerDialog() {
  const dialog = document.createElement('md-dialog');

  cfgGet('boot_state_props', '1').then(state => {
    cfgGet('spoof_build_props', '1').then(spoof => {
      cfgGet('suspicious_props', '1').then(sp => {
          dialog.innerHTML = `
            <div slot="headline">
              <div class="at-dialog-headline">
                <md-icon aria-hidden="true">lock</md-icon>
                <span>${t('prop_handler_dialog_title', 'Boot State Props')}</span>
              </div>
            </div>
            <div slot="content">
              <p class="at-dialog-desc">${t('prop_handler_dialog_desc', 'Manage boot-time property spoofing and cleanup.')}</p>
              <div class="list-container at-dialog-list">
                <div class="list-item list-item--toggle">
                  <div class="li-icon"><md-icon aria-hidden="true">lock</md-icon></div>
                  <div class="list-item-content">
                    <div class="toggle-text">${t('prop_handler_boot_state', 'Boot State Props')}</div>
                    <span class="supporting-text">${t('prop_handler_boot_state_desc', 'Lock bootloader state, verifiedboot, flash.locked, build type/tags')}</span>
                  </div>
                  <div class="spacer"></div>
                  <md-switch icons id="ph-state" ${state === '1' ? 'selected' : ''}></md-switch>
                </div>

                <div class="list-item list-item--toggle">
                  <div class="li-icon"><md-icon aria-hidden="true">badge</md-icon></div>
                  <div class="list-item-content">
                    <div class="toggle-text">${t('prop_handler_spoof_build', 'Spoof Build Props')}</div>
                    <span class="supporting-text">${t('prop_handler_spoof_build_desc', 'Spoof ro.build.flavor to remove userdebug/eng traces')}</span>
                  </div>
                  <div class="spacer"></div>
                  <md-switch icons id="ph-spoof" ${spoof === '1' ? 'selected' : ''}></md-switch>
                </div>

                <div class="list-item list-item--toggle">
                  <div class="li-icon"><md-icon aria-hidden="true">cleaning_services</md-icon></div>
                  <div class="list-item-content">
                    <div class="toggle-text">${t('suspicious_props_clean', 'Suspicious Props Clean')}</div>
                    <span class="supporting-text">${t('suspicious_props_clean_desc', 'Delete leftover persistent props from Xposed, root flags, modding tools, dev options')}</span>
                  </div>
                  <div class="spacer"></div>
                  <md-switch icons id="ph-suspicious" ${sp === '1' ? 'selected' : ''}></md-switch>
                </div>
              </div>
            </div>
            <div slot="actions">
              <md-text-button id="ph-cancel" class="dialog-action-close">${t('dialog_cancel', 'Cancel')}</md-text-button>
              <md-filled-button id="ph-save">${t('dialog_save', 'Save')}</md-filled-button>
            </div>
          `;

          document.body.appendChild(dialog);
          dialog.addEventListener('close', () => document.body.removeChild(dialog));

          const saveBtn = dialog.querySelector('#ph-save') as HTMLButtonElement;
          const cancelBtn = dialog.querySelector('#ph-cancel') as HTMLButtonElement;

          cancelBtn.addEventListener('click', () => dialog.close());

          saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            try {
              const s = dialog.querySelector('#ph-state') as MdSwitch;
              const sp = dialog.querySelector('#ph-spoof') as MdSwitch;
              const sp2 = dialog.querySelector('#ph-suspicious') as MdSwitch;
              cfgSet('boot_state_props', s.selected ? '1' : '0');
              cfgSet('spoof_build_props', sp.selected ? '1' : '0');
              cfgSet('suspicious_props', sp2.selected ? '1' : '0');
              cfgInvalidate('boot_state_props');
              cfgInvalidate('spoof_build_props');
              cfgInvalidate('suspicious_props');
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
  });
}

export function wirePropHandler() {
  const row = document.getElementById('toggle-prop_handler-row');
  if (!row) return;
  const content = row.querySelector('.list-item-content') as HTMLElement | null;
  if (!content) return;
  content.style.cursor = 'pointer';
  content.addEventListener('click', openPropHandlerDialog);
}
