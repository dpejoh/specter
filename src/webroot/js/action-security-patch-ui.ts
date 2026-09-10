import { getTranslation } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openActionSecurityPatchDialog() {
  openSubPage({
    id: 'security-patch-sources',
    title: t('action_sp_dialog_title', 'Security Patch Sources'),
    masterToggle: {
      key: 'toggle_action_security_patch',
      defaultVal: '0',
      title: t('control_toggle_action_security_patch_master', 'Use Security Patch Spoof'),
      syncSwitchId: 'toggle-action_security_patch',
    },
    groups: [
      {
        items: [
          {
            id: 'asp-device',
            key: 'toggle_action_security_patch_device',
            defaultVal: '1',
            title: t('action_sp_device', 'Device'),
            description: t('action_sp_device_desc', 'System build.prop, then vendor security patch'),
          },
          {
            id: 'asp-bulletin',
            key: 'toggle_action_security_patch_bulletin',
            defaultVal: '1',
            title: t('action_sp_bulletin', 'Pixel bulletin'),
            description: t('action_sp_bulletin_desc', 'Latest date from the Pixel security bulletin'),
          },
          {
            id: 'asp-synthetic',
            key: 'toggle_action_security_patch_synthetic',
            defaultVal: '1',
            title: t('action_sp_synthetic', 'Synthetic'),
            description: t('action_sp_synthetic_desc', 'Fallback to the 5th of the current month'),
          },
        ],
      },
    ],
    infoCard: {
      icon: 'info',
      title: t('action_sp_info_title', 'About Security Patch'),
      text: t(
        'action_sp_dialog_desc',
        'Action tries enabled sources top to bottom and stops at the first valid date.'
      ),
    },
  });
}

export function wireActionSecurityPatch() {
  wireRowDialog('toggle-action_security_patch-row', openActionSecurityPatchDialog);
}
