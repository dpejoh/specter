import { cfgSet } from './cfg.js';
import { exec, getModuleDir } from './bridge.js';
import { shellEscape } from './utils.js';
import { refreshKeyboxStatus } from './device.js';
import { runAction } from './actions.js';
import { t } from './i18n.js';

export interface InstallKeyboxOptions {
  /** Custom keybox URL/path. Omit when installing a catalog entry. */
  text?: string;
  privateKeybox?: boolean;
  /** Display name of what is being installed, for the success toast. */
  label?: string;
  onInstalled?: () => void;
}

/**
 * Single keybox install pipeline: write custom-source config, run keybox.sh,
 * refresh keybox info/description, then refresh the hero card. Callers only
 * own their selection/config bookkeeping and user-facing copy.
 */
export async function installKeybox(options: InstallKeyboxOptions = {}): Promise<boolean> {
  if (options.text !== undefined) {
    cfgSet('keybox_private', options.privateKeybox ? 'true' : '');
    cfgSet('keybox_custom_type', /^https?:\/\//i.test(options.text) ? 'url' : 'path');
    cfgSet('keybox_custom_value', options.text);
  }

  const moddir = getModuleDir();
  if (!moddir) return false;

  const code = await runAction('keybox.sh', undefined, {
    feedback: 'toast',
    loadingLabel: t('kb_installing', 'Installing keybox…'),
    successLabel: options.label
      ? `${options.label} · ${t('kb_installed_badge', 'Installed')}`
      : t('kb_install_success', 'Keybox installed'),
  });
  if (code !== 0) return false;

  await exec(`sh ${shellEscape(moddir + '/features/keybox_info.sh')}`).catch(() => {});
  await exec(`sh ${shellEscape(moddir + '/refresh_desc.sh')}`).catch(() => {});
  // A failed status refresh must not reject an otherwise successful install:
  // the caller still needs onInstalled to re-render its catalog/hero state.
  await refreshKeyboxStatus().catch(() => {});
  options.onInstalled?.();
  return true;
}
