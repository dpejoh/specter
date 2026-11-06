import { t } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';


export function openActionKeyboxDialog() {
  openSubPage({
    id: 'action-keybox',
    title: t('action_keybox_dialog_title', 'Keybox Installation'),
    description: t(
      'action_keybox_dialog_desc',
      'Controls how the action button refreshes the installed keybox.'
    ),
    masterToggle: {
      key: 'toggle_action_keybox',
      defaultVal: '1',
      title: t('control_toggle_action_keybox_master', 'Use Keybox Install'),
      syncSwitchId: 'toggle-action_keybox',
    },
    groups: [
      {
        items: [
          {
            id: 'action-keybox-force-install',
            key: 'toggle_action_force_keybox',
            defaultVal: '0',
            icon: 'restart_alt',
            title: t('action_keybox_force_install', 'Always Install a New Keybox'),
            description: t(
              'action_keybox_force_install_desc',
              'Install a fresh keybox on every action run, even when the installed keybox is healthy.'
            ),
          },
        ],
      },
    ],
  });
}

export function wireActionKeybox() {
  wireRowDialog('toggle-action_keybox-row', openActionKeyboxDialog);
}
