import { exec, getModuleDir } from './bridge.js';
import { getTranslation } from './i18n.js';
import { showToast } from './toast.js';
import { shellEscape } from './utils.js';
const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function wireOmkTrust() {
  const btn = document.getElementById('omk-trust-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const moddir = getModuleDir();
    if (!moddir) {
      showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
      return;
    }
    const scriptPath = shellEscape(moddir + '/features/omk_trust.sh');

    const dialog = document.createElement('md-dialog');
    dialog.innerHTML = `
      <div slot="headline">${t('omk_title', 'OMK OS & Boot Key')}</div>
      <div slot="content" class="omk-trust-content" style="min-height:0;display:flex;flex-direction:column;gap:16px">
        <md-outlined-text-field id="ot-os-version" type="text"
          label="${t('omk_os_version', 'OS Version')}"
          placeholder="auto"
          helper-text="${t('omk_os_version_helper', 'auto or number (e.g. 15)')}"
          style="width:100%;--md-outlined-text-field-container-shape:14px">
        </md-outlined-text-field>
        <md-outlined-text-field id="ot-vb-key" type="text"
          label="${t('omk_vb_key', 'VB Key')}"
          placeholder="auto"
          helper-text="${t('omk_vb_key_helper', 'auto, random, or 64 hex chars')}"
          maxlength="64"
          style="width:100%;--md-outlined-text-field-container-shape:14px">
        </md-outlined-text-field>
      </div>
      <div slot="actions">
        <md-text-button id="ot-cancel">${t('dialog_cancel', 'Cancel')}</md-text-button>
        <md-filled-tonal-button id="ot-save">${t('dialog_save', 'Save')}</md-filled-tonal-button>
      </div>
    `;
    document.body.appendChild(dialog);

    const osVerInput = dialog.querySelector('#ot-os-version') as HTMLInputElement | null;
    const vbKeyInput = dialog.querySelector('#ot-vb-key') as HTMLInputElement | null;

    try {
      const { stdout: osVer } = await exec(`sh ${scriptPath} --get os_version 2>/dev/null || echo ""`);
      if (osVerInput) osVerInput.value = osVer.trim();
    } catch {}
    try {
      const { stdout: vbKey } = await exec(`sh ${scriptPath} --get vb_key 2>/dev/null || echo ""`);
      if (vbKeyInput) vbKeyInput.value = vbKey.trim();
    } catch {}

    dialog.querySelector('#ot-cancel')!.addEventListener('click', () => dialog.close());
    dialog.querySelector('#ot-save')!.addEventListener('click', async () => {
      const blockClose = (e: Event) => e.preventDefault();
      dialog.addEventListener('cancel', blockClose);
      try {
        const osVer = osVerInput ? osVerInput.value.trim() : '';
        const vbKey = vbKeyInput ? vbKeyInput.value.trim() : '';

        if (vbKey && vbKey !== 'auto' && vbKey !== 'random' && !/^[0-9a-f]{64}$/i.test(vbKey)) {
          showToast(t('omk_vb_key_invalid', 'VB Key must be auto, random, or 64 hex chars'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
          return;
        }

        const args: string[] = [];
        if (osVer) args.push(shellEscape(`os_version=${osVer}`));
        if (vbKey) args.push(shellEscape(`vb_key=${vbKey}`));
        if (args.length === 0) { dialog.close(); return; }

        const cmd = `sh ${scriptPath} --set ${args.join(' ')}`;
        const result = await exec(cmd);
        if (typeof result.code === 'number' && result.code !== 0) {
          showToast(t('omk_save_error', result.stderr.trim() || 'Failed to save'), { icon: 'error', type: 'error', autoCloseDelay: 4000 });
          return;
        }
        await exec(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`);
        showToast(t('omk_saved', 'OMK OS & Boot Key saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        dialog.close();
      } catch {
        showToast(t('omk_save_error', 'Failed to save'), { icon: 'error', type: 'error', autoCloseDelay: 4000 });
      } finally {
        dialog.removeEventListener('cancel', blockClose);
      }
    });

    dialog.addEventListener('close', () => document.body.removeChild(dialog));
    dialog.show();
  });
}
