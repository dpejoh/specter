import { getTranslation } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export async function openHmaDialog() {
  openSubPage({
    id: 'hma-config',
    title: t('hma_dialog_title', 'HMA-OSS Configs'),
    description: t(
      'hma_dialog_desc',
      'Generates a custom HMA-OSS hiding profile from installed packages and merges it into the service configuration.'
    ),
    masterToggle: {
      key: 'toggle_action_hma',
      defaultVal: '1',
      title: t('control_toggle_action_hma_master', 'Use HMA-OSS Config Generation'),
      syncSwitchId: 'toggle-action_hma',
    },
    groups: [
      {
        title: t('hma_group_scope', 'Configuration Options'),
        items: [
          {
            id: 'hma-target-user-apps',
            key: 'toggle_hma_target_user_apps',
            defaultVal: '1',
            icon: 'apps',
            title: t('hma_target_user_apps', 'Target All User Apps'),
            description: t('hma_target_user_apps_desc', 'Automatically add all installed 3rd-party user apps to the hiding scope'),
          },
          {
            id: 'hma-hide-xposed',
            key: 'toggle_hma_hide_xposed',
            defaultVal: '1',
            icon: 'extension',
            title: t('hma_hide_xposed', 'Hide Detected Xposed Modules'),
            description: t('hma_hide_xposed_desc', 'Reads xposedmodule metadata from installed apps and adds matches to the hide list.'),
          },
          {
            id: 'hma-force-regen',
            key: 'toggle_action_force_hma',
            defaultVal: '0',
            icon: 'restart_alt',
            title: t('hma_force_regen', 'Always Re-Generate HMA-OSS Config'),
            description: t('hma_force_regen_desc', 'Force HMA-OSS config generation on every action run, even when Auto-Update HMA Config is enabled.'),
          },
        ],
      },
    ],
    infoCard: {
      icon: 'info',
      title: t('hma_info_title', 'Hide List Location'),
      text: t('hma_info_text', 'Package definitions are loaded from /data/adb/specter/config/hma-hide-list.txt. You can edit this file to add or remove hidden root apps.'),
    },
  });
}

export function wireHma() {
  wireRowDialog('toggle-action_hma-row', openHmaDialog);
}
