import { exec, getModuleDir, getDataDir } from './bridge.js';
import { getTranslation } from './i18n.js';
import { showToast } from './toast.js';
import { shellEscape } from './utils.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

function configDir(): string {
  const data = getDataDir();
  return data ? data + '/config' : '';
}

export function wireBootHash() {
  const btn = document.getElementById('boot-hash-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const moddir = getModuleDir();
    const cdir = configDir();
    if (!moddir || !cdir) return;

    const hashPath = shellEscape(cdir + '/val/custom_boot_hash.val');
    const current = await exec(`cat ${hashPath} 2>/dev/null || echo ""`);
    const currentHash = (current.stdout || '').trim();

    const dialog = document.createElement('md-dialog');
    dialog.innerHTML = `
      <div slot="headline">${t('boot_hash_dialog_title', 'Custom Boot Hash')}</div>
      <div slot="content" style="min-height:0">
        <md-outlined-text-field id="boot-hash-input" type="text" label="${t('boot_hash_label', 'Boot Hash (SHA256)')}" placeholder="${t('boot_hash_placeholder', '64 hex characters')}" maxlength="64" autocapitalize="none" style="width:100%;margin-top:8px;--md-outlined-text-field-container-shape:14px;font-family:monospace;--md-outlined-field-with-trailing-content-trailing-space:24px;overflow:hidden">
          <div slot="trailing-icon" style="display:flex;align-items:center;gap:2px">
            <md-icon-button id="boot-hash-paste" style="--md-icon-button-icon-size:18px;width:32px;height:32px" aria-label="${t('kb_paste_aria', 'Paste from clipboard')}">
              <md-icon>content_paste</md-icon>
            </md-icon-button>
            <md-icon-button id="boot-hash-zero" style="--md-icon-button-icon-size:18px;width:32px;height:32px" aria-label="${t('boot_hash_zero_aria', 'Set hash to zeros')}">
              <md-icon>restart_alt</md-icon>
            </md-icon-button>
          </div>
        </md-outlined-text-field>
        <p class="md-typescale-body-small" style="margin:12px 0 4px;opacity:.7">
          ${t('boot_hash_info', 'Leave empty to use auto-computed boot hash. The hash is a 64-character hex string.')}
        </p>
      </div>
      <div slot="actions">
        <md-text-button id="boot-hash-clear">${t('dialog_clear', 'Clear')}</md-text-button>
        <md-text-button id="boot-hash-cancel">${t('dialog_cancel', 'Cancel')}</md-text-button>
        <md-filled-tonal-button id="boot-hash-save">${t('dialog_save', 'Save')}</md-filled-tonal-button>
      </div>
    `;
    document.body.appendChild(dialog);

    const input = dialog.querySelector('#boot-hash-input') as HTMLInputElement | null;
    if (input && currentHash) input.value = currentHash;

    const pasteBtn = dialog.querySelector('#boot-hash-paste') as HTMLElement | null;
    pasteBtn?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && input) input.value = text;
      } catch { /* clipboard not available */ }
    });

    const zeroBtn = dialog.querySelector('#boot-hash-zero') as HTMLElement | null;
    zeroBtn?.addEventListener('click', () => {
      if (input) input.value = '0'.repeat(64);
    });

    dialog.querySelector('#boot-hash-cancel')!.addEventListener('click', () => dialog.close());
    dialog.querySelector('#boot-hash-clear')!.addEventListener('click', async () => {
      const blockClose = (e: Event) => e.preventDefault();
      dialog.addEventListener('cancel', blockClose);
      const btn = dialog.querySelector('#boot-hash-clear') as HTMLButtonElement;
      btn.disabled = true;
      try {
        await exec(`rm -f ${hashPath}`);
        await exec(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`);
        showToast(t('boot_hash_cleared', 'Custom boot hash cleared'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        dialog.close();
      } catch {
        showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
      } finally {
        dialog.removeEventListener('cancel', blockClose);
        btn.disabled = false;
      }
    });

    dialog.querySelector('#boot-hash-save')!.addEventListener('click', async () => {
      const blockClose = (e: Event) => e.preventDefault();
      dialog.addEventListener('cancel', blockClose);
      const btn = dialog.querySelector('#boot-hash-save') as HTMLButtonElement;
      btn.disabled = true;
      try {
        const val = input!.value.trim();
        if (val && !/^[a-f0-9]{64}$/.test(val)) {
          showToast(t('boot_hash_invalid', 'Invalid hash (must be 64 hex characters)'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
          return;
        }
        if (val) {
          await exec(`mkdir -p ${shellEscape(cdir)} && printf '%s' ${shellEscape(val)} > ${hashPath}`);
          await exec(`su -c "resetprop -n ro.boot.vbmeta.digest ${shellEscape(val)}" 2>/dev/null || true`);
        } else {
          await exec(`rm -f ${hashPath}`);
        }
        await exec(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`);
        showToast(t('boot_hash_saved', 'Custom boot hash saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        dialog.close();
      } catch {
        showToast(t('boot_hash_save_error', 'Failed to save'), { icon: 'error', type: 'error', autoCloseDelay: 4000 });
      } finally {
        dialog.removeEventListener('cancel', blockClose);
        btn.disabled = false;
      }
    });

    dialog.addEventListener('close', () => document.body.removeChild(dialog));
    dialog.show();
  });
}
