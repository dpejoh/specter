import { cfgGet, cfgSet, cfgInvalidate } from './cfg.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openBootHardenDialog() {
  const dialog = document.createElement('md-dialog');

  cfgGet('boot_hardening_selinux', '1').then(selinux => {
    cfgGet('boot_hardening_bootmode', '1').then(bootmode => {
      dialog.innerHTML = `
        <div slot="headline">
          <div class="at-dialog-headline">
            <md-icon aria-hidden="true">security</md-icon>
            <span>${t('boot_harden_dialog_title', 'Boot Hardening')}</span>
          </div>
        </div>
        <div slot="content">
          <p class="at-dialog-desc">${t('boot_harden_dialog_desc', 'Choose which hardening measures to apply at boot.')}</p>
          <div class="list-container at-dialog-list">
            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">security</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('boot_harden_selinux', 'SELinux & Proc Protection')}</div>
                <span class="supporting-text">${t('boot_harden_selinux_desc', 'Protect SELinux enforce, /proc/cmdline, /proc/net/unix, install-recovery.sh')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="bh-selinux" ${selinux === '1' ? 'selected' : ''}></md-switch>
            </div>

            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">smartphone</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('boot_harden_bootmode', 'Hide Recovery Bootmode')}</div>
                <span class="supporting-text">${t('boot_harden_bootmode_desc', 'Spoof bootmode away from "recovery" to hide recovery status')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="bh-bootmode" ${bootmode === '1' ? 'selected' : ''}></md-switch>
            </div>
          </div>
        </div>
        <div slot="actions">
          <md-text-button id="bh-cancel" class="dialog-action-close">${t('dialog_cancel', 'Cancel')}</md-text-button>
          <md-filled-button id="bh-save">${t('dialog_save', 'Save')}</md-filled-button>
        </div>
      `;

      document.body.appendChild(dialog);
      dialog.addEventListener('close', () => document.body.removeChild(dialog));

      const saveBtn = dialog.querySelector('#bh-save') as HTMLButtonElement;
      const cancelBtn = dialog.querySelector('#bh-cancel') as HTMLButtonElement;

      cancelBtn.addEventListener('click', () => dialog.close());

      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
          const s = dialog.querySelector('#bh-selinux') as MdSwitch;
          const b = dialog.querySelector('#bh-bootmode') as MdSwitch;
          cfgSet('boot_hardening_selinux', s.selected ? '1' : '0');
          cfgSet('boot_hardening_bootmode', b.selected ? '1' : '0');
          cfgInvalidate('boot_hardening_selinux');
          cfgInvalidate('boot_hardening_bootmode');
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

export function wireBootHarden() {
  const row = document.getElementById('toggle-boot_hardening-row');
  if (!row) return;
  const content = row.querySelector('.list-item-content') as HTMLElement | null;
  if (!content) return;
  content.style.cursor = 'pointer';
  content.addEventListener('click', openBootHardenDialog);
}
