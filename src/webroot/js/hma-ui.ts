import { getTranslation } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';
import { cfgGet, cfgSet } from './cfg.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export async function openHmaDialog() {
  const currentMode = (await cfgGet('hma_launch_mode', 'prompt')) || 'prompt';

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
        title: t('hma_group_app_launch', 'App Launch Policy (Action Button)'),
        description: t(
          'hma_group_app_launch_desc',
          'Choose how Specter handles opening HMA-OSS to reload its configuration after generating rules.'
        ),
        items: [
          {
            type: 'radio',
            id: 'hma-launch-prompt',
            name: 'hma_launch_mode_radio',
            value: 'prompt',
            title: t('hma_launch_prompt', 'Manual (Default)'),
            description: t('hma_launch_prompt_desc', 'Do not open HMA-OSS automatically. Apply the config by long-pressing the status card or rebooting.'),
            selected: currentMode === 'prompt',
            onSelect: (val) => cfgSet('hma_launch_mode', val),
          },
          {
            type: 'radio',
            id: 'hma-launch-always',
            name: 'hma_launch_mode_radio',
            value: 'always',
            title: t('hma_launch_always', 'Always Open'),
            description: t('hma_launch_always_desc', 'Open HMA-OSS after writing the config and attempt the live reload gesture.'),
            selected: currentMode === 'always',
            onSelect: (val) => cfgSet('hma_launch_mode', val),
          },
          {
            type: 'radio',
            id: 'hma-launch-never',
            name: 'hma_launch_mode_radio',
            value: 'never',
            title: t('hma_launch_never', 'Never Open'),
            description: t('hma_launch_never_desc', 'Never open HMA-OSS automatically. Apply the config manually later or after a reboot.'),
            selected: currentMode === 'never',
            onSelect: (val) => cfgSet('hma_launch_mode', val),
          },
        ],
      },
      {
        title: t('hma_group_scope', 'Profile & Scope Options'),
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
            id: 'hma-live-reload',
            key: 'toggle_hma_live_reload',
            defaultVal: '1',
            icon: 'touch_app',
            title: t('hma_live_reload', 'Automated Reload Gesture'),
            description: t('hma_live_reload_desc', 'Simulate status card long-press when HMA-OSS opens to trigger live reload'),
          },
          {
            id: 'hma-hide-xposed',
            key: 'toggle_hma_hide_xposed',
            defaultVal: '1',
            icon: 'extension',
            title: t('hma_hide_xposed', 'Hide Detected Xposed Modules'),
            description: t('hma_hide_xposed_desc', 'Reads xposedmodule metadata from installed apps and adds matches to the hide list.'),
          },
        ],
      },
      {
        items: [
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
