import { cfgGet, cfgSet, cfgInvalidate } from './cfg.js';
import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openRomFingerprintDialog() {
  const dialog = document.createElement('md-dialog');

  cfgGet('rom_fingerprint_hexpatch', '1').then(hex => {
    cfgGet('rom_fingerprint_prefix', '1').then(pref => {
      dialog.innerHTML = `
        <div slot="headline">
          <div class="at-dialog-headline">
            <md-icon aria-hidden="true">fingerprint</md-icon>
            <span>${t('rom_fingerprint_dialog_title', 'ROM Fingerprint')}</span>
          </div>
        </div>
        <div slot="content">
          <p class="at-dialog-desc">${t('rom_fingerprint_dialog_desc', 'Clean traces of custom ROM identity from build properties.')}</p>
          <div class="list-container at-dialog-list">
            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">search</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('rom_fingerprint_hexpatch', 'Delete ROM Prop Traces')}</div>
                <span class="supporting-text">${t('rom_fingerprint_hexpatch_desc', 'Delete build props containing known ROM names (Lineage, crDroid, PixelOS, etc.)')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="rf-hexpatch" ${hex === '1' ? 'selected' : ''}></md-switch>
            </div>

            <div class="list-item list-item--toggle">
              <div class="li-icon"><md-icon aria-hidden="true">format_clear</md-icon></div>
              <div class="list-item-content">
                <div class="toggle-text">${t('rom_fingerprint_prefix', 'Strip ROM Prefixes')}</div>
                <span class="supporting-text">${t('rom_fingerprint_prefix_desc', 'Strip custom ROM prefixes (aosp_, lineage_) from build fingerprint and display id')}</span>
              </div>
              <div class="spacer"></div>
              <md-switch icons id="rf-prefix" ${pref === '1' ? 'selected' : ''}></md-switch>
            </div>
          </div>
        </div>
        <div slot="actions">
          <md-text-button id="rf-cancel" class="dialog-action-close">${t('dialog_cancel', 'Cancel')}</md-text-button>
          <md-filled-button id="rf-save">${t('dialog_save', 'Save')}</md-filled-button>
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
          const p = dialog.querySelector('#rf-prefix') as MdSwitch;
          cfgSet('rom_fingerprint_hexpatch', h.selected ? '1' : '0');
          cfgSet('rom_fingerprint_prefix', p.selected ? '1' : '0');
          cfgInvalidate('rom_fingerprint_hexpatch');
          cfgInvalidate('rom_fingerprint_prefix');
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

export function wireRomFingerprint() {
  const row = document.getElementById('toggle-rom_fingerprint-row');
  if (!row) return;
  const content = row.querySelector('.list-item-content') as HTMLElement | null;
  if (!content) return;
  content.style.cursor = 'pointer';
  content.addEventListener('click', openRomFingerprintDialog);
}
