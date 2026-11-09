import { exec, getModuleDir, spawnCommand } from './bridge.js';
import { t } from './i18n.js';
import { showToast, showLoadingToast, updateToast } from './toast.js';
import { afterPaint, shellEscape, wireRowActivation } from './utils.js';
import { runAction } from './actions.js';
import { openSubPage } from './subpage.js';

/** Resolve after two frames, once the disabled FAB and toast have painted. */
function afterNextPaint(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame !== 'function') {
      resolve();
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function renderOmkRestartRow(
  container: HTMLElement,
  id: string,
  icon: string,
  title: string,
  description: string,
  script: string,
  friendlyNameKey: string,
) {
  const row = document.createElement('sp-settings-row');
  row.id = id;
  row.setAttribute('variant', 'action');
  row.setAttribute('headline', title);
  row.setAttribute('supporting-text', description);
  const rowIcon = document.createElement('md-icon');
  rowIcon.setAttribute('slot', 'icon');
  rowIcon.setAttribute('aria-hidden', 'true');
  rowIcon.textContent = icon;
  row.append(rowIcon);

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    row.disabled = true;
    row.loading = true;
    try {
      await runAction(script, friendlyNameKey);
    } finally {
      running = false;
      row.disabled = false;
      row.loading = false;
    }
  };
  row.addEventListener('sp-activate', () => { void run(); });
  container.replaceWith(row);
}

export function wireOmkRestart() {
  const btn = document.getElementById('omk-restart-btn');
  if (!btn) return;
  wireRowActivation(btn, openOmkRestartPage);
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
            render: (container, _isEnabled) => {
              renderOmkRestartRow(
                container,
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
            render: (container, _isEnabled) => {
              renderOmkRestartRow(
                container,
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

async function readOmkValue(scriptPath: string, key: 'os_version' | 'vb_key'): Promise<string> {
  try {
    const { stdout } = await exec(`sh ${scriptPath} --get ${key} 2>/dev/null || echo ""`);
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function openOmkTrustPage(): Promise<void> {
  const moddir = getModuleDir();
  if (!moddir) {
    showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
    return;
  }

  const scriptPath = shellEscape(moddir + '/features/omk_trust.sh');

  // The page opens immediately with disabled empty fields; once it has
  // painted, the two script reads (each a shell round trip) run and fill
  // the fields in.
  let previousVbKey = '';

  const pageInstance = await openSubPage({
    id: 'omk-trust',
    title: t('omk_title', 'OMK OS & Boot Key'),
    description: t('omk_desc', 'Configure OS version and verified boot key reported by OhMyKeymint.'),
    groups: [
      {
        items: [
          {
            type: 'input',
            id: 'omk-os-version',
            icon: 'memory',
            title: t('omk_os_version', 'OS Version'),
            description: t('omk_os_version_helper', 'auto or number (e.g. 15)'),
            inputType: 'text',
            layout: 'block',
            value: '',
            placeholder: 'auto',
            autocapitalize: 'none',
            autocomplete: 'off',
            spellcheck: false,
          },
          {
            type: 'input',
            id: 'omk-vb-key',
            icon: 'vpn_key',
            title: t('omk_vb_key', 'VB Key'),
            description: t('omk_vb_key_helper', 'auto, random, or 64 hex chars'),
            inputType: 'text',
            layout: 'block',
            value: '',
            placeholder: 'auto',
            maxLength: 64,
            mono: true,
            autocapitalize: 'none',
            autocomplete: 'off',
            spellcheck: false,
          },
        ],
      },
    ],
    fab: (container, page) => {
      const fab = document.createElement('md-fab');
      fab.id = 'omk-save-fab';
      fab.className = 'subpage-fab';
      fab.setAttribute('variant', 'primary');
      fab.setAttribute('label', t('dialog_save', 'Save'));
      // Enabled once the current values have loaded, so an early tap
      // cannot save empty fields over the real configuration.
      fab.setAttribute('disabled', '');
      fab.innerHTML = '<md-icon slot="icon" aria-hidden="true">save</md-icon>';
      container.append(fab);

      const osInput = page.overlay.querySelector<HTMLInputElement>('#omk-os-version');
      const vbInput = page.overlay.querySelector<HTMLInputElement>('#omk-vb-key');
      let saving = false;

      const setVbError = (invalid: boolean) => {
        if (!vbInput) return;
        vbInput.classList.toggle('subpage-inline-input--invalid', invalid);
        vbInput.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      };
      vbInput?.addEventListener('input', () => setVbError(false));

      fab.addEventListener('click', async () => {
        if (saving) return;

        const osVer = osInput?.value.trim() ?? '';
        const vbKey = vbInput?.value.trim() ?? '';

        if (vbKey && vbKey !== 'auto' && vbKey !== 'random' && !/^[0-9a-f]{64}$/i.test(vbKey)) {
          setVbError(true);
          vbInput?.focus();
          showToast(
            t('omk_vb_key_invalid', 'VB Key must be auto, random, or 64 hex chars'),
            { icon: 'error', type: 'error', autoCloseDelay: 3000 },
          );
          return;
        }
        setVbError(false);

        const args: string[] = [];
        if (osVer) args.push(shellEscape(`os_version=${osVer}`));
        if (vbKey) args.push(shellEscape(`vb_key=${vbKey}`));
        if (args.length === 0) {
          page.close();
          return;
        }

        saving = true;
        fab.setAttribute('disabled', '');
        const loadingToast = showLoadingToast(t('common_loading', 'Loading...'));
        await afterNextPaint();
        try {
          const needsReboot = previousVbKey === 'random' && vbKey === 'auto';
          const result = await spawnCommand(`sh ${scriptPath} --set ${args.join(' ')}`);
          if (typeof result.code === 'number' && result.code !== 0) {
            updateToast(loadingToast, t('omk_save_error', result.stderr.trim() || 'Failed to save'), {
              icon: 'error',
              type: 'error',
              autoCloseDelay: 4000,
            });
            return;
          }
          await spawnCommand(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`);
          updateToast(loadingToast, t('omk_saved', 'OMK OS & Boot Key saved'), {
            icon: 'check_circle',
            type: 'success',
            autoCloseDelay: 2500,
          });
          if (needsReboot) {
            showToast(t('omk_vb_reboot_required', 'Device reboot required for random→auto VB key'), {
              icon: 'info',
              type: 'info',
              autoCloseDelay: 5000,
            });
          }
          previousVbKey = vbKey;
        } catch {
          updateToast(loadingToast, t('omk_save_error', 'Failed to save'), {
            icon: 'error',
            type: 'error',
            autoCloseDelay: 4000,
          });
        } finally {
          saving = false;
          fab.removeAttribute('disabled');
        }
      });
    },
  });

  const osInput = pageInstance.overlay.querySelector<HTMLInputElement>('#omk-os-version');
  const vbInput = pageInstance.overlay.querySelector<HTMLInputElement>('#omk-vb-key');
  // The fields stay disabled until their values land, so an early tap
  // cannot save blanks over the real values.
  if (osInput) osInput.disabled = true;
  if (vbInput) vbInput.disabled = true;

  const loadValues = async () => {
    // First let the opened page paint, then start the reads; starting them
    // in the same task as the opening can block that first paint.
    await new Promise<void>(resolve => afterPaint(resolve, 300));

    const [osVersion, vbKey] = await Promise.all([
      readOmkValue(scriptPath, 'os_version'),
      readOmkValue(scriptPath, 'vb_key'),
    ]);
    previousVbKey = vbKey;

    // Fields the user already typed into are never overwritten.
    if (osInput && !osInput.value) osInput.value = osVersion;
    if (vbInput && !vbInput.value) vbInput.value = vbKey;
    if (osInput) osInput.disabled = false;
    if (vbInput) vbInput.disabled = false;
    pageInstance.overlay.querySelector('#omk-save-fab')?.removeAttribute('disabled');
  };

  void loadValues();
}

export function wireOmkTrust() {
  const btn = document.getElementById('omk-trust-btn');
  if (!btn) return;
  wireRowActivation(btn, () => { void openOmkTrustPage(); });
}
