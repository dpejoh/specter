import { cfgGet, cfgSet } from './cfg.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openActionSecurityPatchDialog() {
  const dialog = document.createElement('md-dialog');

  cfgGet('toggle_action_security_patch', '1').then(parent => {
    const enabled = parent !== '0';
    Promise.all([
      cfgGet('toggle_action_security_patch_device', '1'),
      cfgGet('toggle_action_security_patch_bulletin', '1'),
      cfgGet('toggle_action_security_patch_synthetic', '1'),
    ]).then(([device, bulletin, synthetic]) => {
      const banner = enabled ? '' : `<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:var(--md-sys-color-surface-variant);border-radius:12px;margin:0 0 12px 0;color:var(--md-sys-color-on-surface-variant);font-size:0.875rem;"><md-icon>info</md-icon><span>${t('feature_disabled_desc', 'Feature is disabled, enable it in Control to configure')}</span></div>`;
      dialog.innerHTML = `
        <div slot="headline">
          <div class="at-dialog-headline">
            <md-icon aria-hidden="true">security_update_good</md-icon>
            <span>${t('action_sp_dialog_title', 'Security Patch Sources')}</span>
          </div>
        </div>
        <div slot="content">
          <p class="at-dialog-desc">${t('action_sp_dialog_desc', 'Action tries enabled sources top to bottom and stops at the first valid date.')}</p>
          ${banner}
          <div class="list-container at-dialog-list">
            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">smartphone</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('action_sp_device', 'Device')}</div>
                <span class="supporting-text">${t('action_sp_device_desc', 'System build.prop, then vendor security patch')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="asp-device" ${device === '1' ? 'selected' : ''} ${enabled ? '' : 'disabled'}></md-switch>
            </div>

            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">language</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('action_sp_bulletin', 'Pixel bulletin')}</div>
                <span class="supporting-text">${t('action_sp_bulletin_desc', 'Latest date from the Pixel security bulletin')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="asp-bulletin" ${bulletin === '1' ? 'selected' : ''} ${enabled ? '' : 'disabled'}></md-switch>
            </div>

            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">schedule</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('action_sp_synthetic', 'Synthetic')}</div>
                <span class="supporting-text">${t('action_sp_synthetic_desc', 'Fallback to the 5th of the current month')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="asp-synthetic" ${synthetic === '1' ? 'selected' : ''} ${enabled ? '' : 'disabled'}></md-switch>
            </div>
          </div>
        </div>
        <div slot="actions">
          <md-text-button id="asp-cancel" class="dialog-action-close">${t('dialog_cancel', 'Cancel')}</md-text-button>
          <md-filled-button id="asp-save" ${enabled ? '' : 'disabled'}>${t('dialog_save', 'Save')}</md-filled-button>
        </div>
      `;

      document.body.appendChild(dialog);
      dialog.addEventListener('close', () => document.body.removeChild(dialog));

      const saveBtn = dialog.querySelector('#asp-save') as HTMLButtonElement;
      const cancelBtn = dialog.querySelector('#asp-cancel') as HTMLButtonElement;

      cancelBtn.addEventListener('click', () => dialog.close());

      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
          const d = dialog.querySelector('#asp-device') as MdSwitch;
          const b = dialog.querySelector('#asp-bulletin') as MdSwitch;
          const s = dialog.querySelector('#asp-synthetic') as MdSwitch;
          cfgSet('toggle_action_security_patch_device', d.selected ? '1' : '0');
          cfgSet('toggle_action_security_patch_bulletin', b.selected ? '1' : '0');
          cfgSet('toggle_action_security_patch_synthetic', s.selected ? '1' : '0');
          showToast(t('toast_success', 'Done'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
          dialog.close();
        } catch {
          showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
        } finally {
          saveBtn.disabled = false;
        }
      });

      dialog.show();
    });
  });
}

export function wireActionSecurityPatch() {
  const row = document.getElementById('toggle-action_security_patch-row');
  if (!row) return;
  const content = row.querySelector('.list-item-content') as HTMLElement | null;
  if (!content) return;
  content.style.cursor = 'pointer';
  content.addEventListener('click', openActionSecurityPatchDialog);
}
