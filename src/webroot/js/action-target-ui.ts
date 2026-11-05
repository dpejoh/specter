import { t } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';


export function openActionTargetDialog() {
  openSubPage({
    id: 'action-target',
    title: t('action_target_dialog_title', 'Target Update'),
    description: t(
      'action_target_dialog_desc',
      'Controls how the action button updates the target list.'
    ),
    masterToggle: {
      key: 'toggle_action_target',
      defaultVal: '1',
      title: t('control_toggle_action_target_master', 'Use Target Update'),
      syncSwitchId: 'toggle-action_target',
    },
    groups: [
      {
        items: [
          {
            id: 'action-target-force-regen',
            key: 'toggle_action_force_target',
            defaultVal: '0',
            icon: 'restart_alt',
            title: t('action_target_force_regen', 'Always Re-Generate Target List'),
            description: t(
              'action_target_force_regen_desc',
              'Force target generation on every action run, even when Auto-Targeting is enabled.'
            ),
          },
        ],
      },
    ],
  });
}

export function wireActionTarget() {
  wireRowDialog('toggle-action_target-row', openActionTargetDialog);
}
