import { exec, getModuleDir } from './bridge.js';
import { getTranslation } from './i18n.js';
import { showToast } from './toast.js';
import { shellEscape } from './utils.js';
import { runAction } from './actions.js';
import { openSubPage } from './subpage.js';
const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

function renderOmkRestartRow(
  container: HTMLElement,
  posClass: string | undefined,
  id: string,
  icon: string,
  title: string,
  description: string,
  script: string,
  friendlyNameKey: string,
) {
  container.innerHTML = `
    <div class="list-item ${posClass || 'list-item--first'}" id="${id}" role="button" tabindex="0">
      <div class="li-icon"><md-icon aria-hidden="true">${icon}</md-icon></div>
      <div class="list-item-content">
        <div class="toggle-text">${title}</div>
        <span class="supporting-text">${description}</span>
      </div>
      <div class="spacer"></div>
      <md-circular-progress indeterminate class="action-spinner hidden"></md-circular-progress>
      <md-ripple></md-ripple>
    </div>
  `;

  const row = container.querySelector(`#${id}`) as HTMLElement | null;
  if (!row) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    row.setAttribute('aria-disabled', 'true');
    const spinner = row.querySelector('.action-spinner');
    spinner?.classList.remove('hidden');
    try {
      await runAction(script, friendlyNameKey);
    } finally {
      running = false;
      row.removeAttribute('aria-disabled');
      spinner?.classList.add('hidden');
    }
  };
  row.addEventListener('click', run);
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      run();
    }
  });
}

export function wireOmkRestart() {
  const btn = document.getElementById('omk-restart-btn');
  if (!btn) return;
  btn.addEventListener('click', openOmkRestartPage);
}

export function openOmkRestartPage() {
  openSubPage({
    id: 'omk-restart',
    title: t('tools_restart_omk', 'Restart OMK'),
    description: t('tools_restart_omk_desc', 'Restart keymint or injector after OMK changes.'),
    groups: [
      {
        items: [
          {
            type: 'custom',
            id: 'omk-restart-keymint-item',
            render: (container, _isEnabled, posClass) => {
              renderOmkRestartRow(
                container,
                posClass,
                'omk-restart-keymint-row',
                'memory',
                t('tools_restart_omk_keymint', 'Restart OMK keymint'),
                t('tools_restart_omk_keymint_desc', 'Use after changing OMK OS version or boot key.'),
                'omk_restart_keymint.sh',
                'tools_restart_omk_keymint',
              );
            },
          },
          {
            type: 'custom',
            id: 'omk-restart-injector-item',
            render: (container, _isEnabled, posClass) => {
              renderOmkRestartRow(
                container,
                posClass,
                'omk-restart-injector-row',
                'tune',
                t('tools_restart_omk_injector', 'Restart OMK injector'),
                t('tools_restart_omk_injector_desc', 'Use if a target-app change didn\'t stick; then reopen the app.'),
                'omk_restart_injector.sh',
                'tools_restart_omk_injector',
              );
            },
          },
        ],
      },
    ],
  });
}

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
    let previousVbKey = '';

    try {
      const { stdout: osVer } = await exec(`sh ${scriptPath} --get os_version 2>/dev/null || echo ""`);
      if (osVerInput) osVerInput.value = osVer.trim();
    } catch {}
    try {
      const { stdout: vbKey } = await exec(`sh ${scriptPath} --get vb_key 2>/dev/null || echo ""`);
      previousVbKey = vbKey.trim();
      if (vbKeyInput) vbKeyInput.value = previousVbKey;
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

        const needsReboot = previousVbKey === 'random' && vbKey === 'auto';

        const cmd = `sh ${scriptPath} --set ${args.join(' ')}`;
        const result = await exec(cmd);
        if (typeof result.code === 'number' && result.code !== 0) {
          showToast(t('omk_save_error', result.stderr.trim() || 'Failed to save'), { icon: 'error', type: 'error', autoCloseDelay: 4000 });
          return;
        }
        await exec(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`);
        showToast(t('omk_saved', 'OMK OS & Boot Key saved'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2500 });
        if (needsReboot) {
          showToast(t('omk_vb_reboot_required', 'Device reboot required for random→auto VB key'), { icon: 'info', type: 'info', autoCloseDelay: 5000 });
        }
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
