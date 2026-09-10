import { getTranslation } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openGmsDialog() {
  openSubPage({
    id: 'gms-cleanup',
    title: t('gms_dialog_title', 'Kill Play Store'),
    masterToggle: {
      key: 'toggle_action_gms',
      defaultVal: '1',
      title: t('control_toggle_action_gms_master', 'Use GMS Cleanup'),
      syncSwitchId: 'toggle-action_gms',
    },
    groups: [
      {
        items: [
          {
            id: 'gms-force-stop',
            key: 'toggle_action_gms_force_stop',
            defaultVal: '1',
            title: t('gms_force_stop', 'Force-stop GMS Processes'),
            description: t('gms_force_stop_desc', 'Kill droidguard and force-stop Play Store, GMS, GSF, Chrome, SafetyCore, and related GMS processes'),
          },
          {
            id: 'gms-clear-data',
            key: 'toggle_action_gms_clear_data',
            defaultVal: '0',
            title: t('gms_clear_data', 'Clear Play Store Data'),
            description: t('gms_clear_data_desc', 'Run pm clear on Play Store to reset its state'),
          },
        ],
      },
    ],
    infoCard: {
      icon: 'info',
      title: t('gms_info_title', 'About GMS Cleanup'),
      text: t(
        'gms_dialog_desc',
        'Choose which GMS cleanup actions to run when triggered. Killing GMS processes forces Google Play Services to reload fresh integrity tokens and device profiles.'
      ),
    },
  });
}

export function wireGms() {
  wireRowDialog('toggle-action_gms-row', openGmsDialog);
}
