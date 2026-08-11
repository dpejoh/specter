import { cfgGet, cfgSet } from './cfg.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openRomFingerprintDialog() {
  const dialog = document.createElement('md-dialog');

  cfgGet('toggle_rom_fingerprint', '1').then(parent => {
    const enabled = parent !== '0';
    cfgGet('toggle_rom_fingerprint_names', '1').then(hex => {
      cfgGet('toggle_rom_fingerprint_prefix', '1').then(pref => {
        cfgGet('toggle_rom_fingerprint_pif', '1').then(pif => {
        cfgGet('toggle_rom_fingerprint_build_type', '1').then(spoof => {
        cfgGet('toggle_custom_rom_props', '1').then(crom => {
        const banner = enabled ? '' : `<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:var(--md-sys-color-surface-variant);border-radius:12px;margin:0 0 12px 0;color:var(--md-sys-color-on-surface-variant);font-size:0.875rem;"><md-icon>info</md-icon><span>${t('feature_disabled_desc', 'Feature is disabled, enable it in Control to configure')}</span></div>`;
        dialog.innerHTML = `
        <div slot="headline">
          <div class="at-dialog-headline">
            <md-icon aria-hidden="true">fingerprint</md-icon>
            <span>${t('rom_fingerprint_dialog_title', 'ROM Fingerprint')}</span>
          </div>
        </div>
        <div slot="content">
          <p class="at-dialog-desc">${t('rom_fingerprint_dialog_desc', 'Clean traces of custom ROM identity from build properties.')}</p>
          ${banner}
          <div class="list-container at-dialog-list">
            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">search</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('rom_fingerprint_hexpatch', 'Delete ROM Prop Traces')}</div>
                <span class="supporting-text">${t('rom_fingerprint_hexpatch_desc', 'Delete build props containing known ROM names (Lineage, crDroid, PixelOS, etc.)')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="rf-hexpatch" ${hex === '1' ? 'selected' : ''} ${enabled ? '' : 'disabled'}></md-switch>
            </div>

            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">delete_sweep</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('rom_fingerprint_custom_props', 'Custom ROM Props')}</div>
                <span class="supporting-text">${t('rom_fingerprint_custom_props_desc', 'Delete custom ROM identity props at boot (can break ROM OTAs)')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="rf-crom" ${crom === '1' ? 'selected' : ''} ${enabled ? '' : 'disabled'}></md-switch>
            </div>

            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">format_clear</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('rom_fingerprint_prefix', 'Strip ROM Prefixes')}</div>
                <span class="supporting-text">${t('rom_fingerprint_prefix_desc', 'Strip custom ROM prefixes (aosp_, lineage_) from build fingerprint and display id')}</span>
              </div>
              <div class="spacer"></div>
            <md-switch icons id="rf-prefix" ${pref === '1' ? 'selected' : ''} ${enabled ? '' : 'disabled'}></md-switch>
          </div>

          <div class="list-item list-item--toggle">
            <div class="li-icon"><md-icon aria-hidden="true">block</md-icon></div>
            <div class="list-item-content">
              <div class="toggle-text">${t('rom_fingerprint_pif', 'Delete PIF Props')}</div>
              <span class="supporting-text">${t('rom_fingerprint_pif_desc', 'Delete Play Integrity Fix properties (pihook, pixelprops, spoof traces)')}</span>
            </div>
            <div class="spacer"></div>
            <md-switch icons id="rf-pif" ${pif === '1' ? 'selected' : ''} ${enabled ? '' : 'disabled'}></md-switch>
          </div>

          <div class="list-item list-item--toggle">
            <div class="li-icon"><md-icon aria-hidden="true">badge</md-icon></div>
            <div class="list-item-content">
              <div class="toggle-text">${t('prop_handler_spoof_build', 'Clean Build Type')}</div>
              <span class="supporting-text">${t('prop_handler_spoof_build_desc', 'Strip userdebug/eng traces from build.flavor and build.fingerprint')}</span>
            </div>
            <div class="spacer"></div>
            <md-switch icons id="rf-spoof" ${spoof === '1' ? 'selected' : ''} ${enabled ? '' : 'disabled'}></md-switch>
          </div>
        </div>
        </div>
        <div slot="actions">
          <md-text-button id="rf-cancel" class="dialog-action-close">${t('dialog_cancel', 'Cancel')}</md-text-button>
          <md-filled-button id="rf-save" ${enabled ? '' : 'disabled'}>${t('dialog_save', 'Save')}</md-filled-button>
        </div>
      `;

      document.body.appendChild(dialog);
      dialog.addEventListener('close', () => document.body.removeChild(dialog));

      const saveBtn = dialog.querySelector('#rf-save') as HTMLButtonElement;
      const cancelBtn = dialog.querySelector('#rf-cancel') as HTMLButtonElement;

      cancelBtn.addEventListener('click', () => dialog.close());

      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
          const h = dialog.querySelector('#rf-hexpatch') as MdSwitch;
          const cromSw = dialog.querySelector('#rf-crom') as MdSwitch;
          const p = dialog.querySelector('#rf-prefix') as MdSwitch;
          const pif = dialog.querySelector('#rf-pif') as MdSwitch;
          const sp = dialog.querySelector('#rf-spoof') as MdSwitch;
          cfgSet('toggle_rom_fingerprint_names', h.selected ? '1' : '0');
          cfgSet('toggle_custom_rom_props', cromSw.selected ? '1' : '0');
          cfgSet('toggle_rom_fingerprint_prefix', p.selected ? '1' : '0');
          cfgSet('toggle_rom_fingerprint_pif', pif.selected ? '1' : '0');
          cfgSet('toggle_rom_fingerprint_build_type', sp.selected ? '1' : '0');
          showToast(t('toast_success', 'Done'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
          dialog.close();
        } catch (e) {
          showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
        } finally {
          saveBtn.disabled = false;
        }
      });

      dialog.show();
    });
  });
  });
  });
  });
  });
}

export function wireRomFingerprint() {
  const row = document.getElementById('toggle-rom_fingerprint-row');
  if (!row) return;
  const content = row.querySelector('.list-item-content') as HTMLElement | null;
  if (!content) return;
  content.style.cursor = 'pointer';
  content.addEventListener('click', openRomFingerprintDialog);
}
