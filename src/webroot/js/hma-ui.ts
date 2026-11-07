import { t } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';
import { exec } from './bridge.js';


const HMA_AUTO_RELOAD_VERSION = 175;

async function getHmaVersion(): Promise<number | null> {
  try {
    const { stdout } = await exec(
      "v=$(cat /data/adb/modules/hma_oss_zygisk/module.prop /data/adb/modules_update/hma_oss_zygisk/module.prop /data/adb/modules/hma_oss/module.prop /data/adb/modules_update/hma_oss/module.prop 2>/dev/null | sed -n 's/^version=//p' | head -1); " +
      '[ -n "$v" ] || v=$(dumpsys package org.frknkrc44.hma_oss 2>/dev/null | sed -n "s/.*versionName=//p" | head -1); ' +
      'printf \'%s\' "$v"'
    );
    const match = stdout.match(/(\d+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export async function openHmaDialog() {
  const hmaVersion = await getHmaVersion();
  const oldHma = hmaVersion !== null && hmaVersion < HMA_AUTO_RELOAD_VERSION;

  openSubPage({
    id: 'hma-config',
    title: t('hma_dialog_title', 'HMA-OSS Configs'),
    description: t(
      'hma_dialog_desc',
      'Generates a custom HMA-OSS hiding profile from installed packages and merges it into the service configuration.'
    ),
    groups: [
      {
        items: [
          {
            id: 'hma-force-regen',
            key: 'toggle_action_force_hma',
            defaultVal: '0',
            icon: 'restart_alt',
            title: t('hma_force_regen', 'Always Re-Generate HMA-OSS Config'),
            description: t('hma_force_regen_desc', 'Force config generation on every action run, even when Auto-Update HMA Config is enabled.'),
          },
        ],
      },
    ],
    infoCard: oldHma ? {
      icon: 'warning',
      title: `${t('hma_version_old_title', 'Update HMA-OSS')} (oss-${hmaVersion})`,
      text: t(
        'hma_version_old_text',
        'This HMA-OSS service is older than oss-175, so it will not apply generated config changes automatically. Update the HMA-OSS Zygisk module, or open HMA-OSS and long-press the Home status card to apply the generated config.'
      ),
    } : undefined,
  });
}

export function wireHma() {
  wireRowDialog('toggle-action_hma-row', openHmaDialog);
}
