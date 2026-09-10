import { getTranslation } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openPropHandlerDialog() {
  openSubPage({
    id: 'prop-handler',
    title: t('prop_handler_dialog_title', 'Boot Spoofing'),
    masterToggle: {
      key: 'toggle_prop_handler',
      defaultVal: '1',
      title: t('control_toggle_prop_handler_master', 'Use Boot Spoofing'),
      syncSwitchId: 'toggle-prop_handler',
    },
    groups: [
      {
        items: [
          {
            id: 'ph-state',
            key: 'toggle_boot_state_props',
            defaultVal: '1',
            title: t('prop_handler_boot_state', 'Lock Bootloader'),
            description: t('prop_handler_boot_state_desc', 'Spoof bootloader lock, verified boot, dm-verity, and build signatures'),
          },
          {
            id: 'ph-bootmode',
            key: 'toggle_bootmode_spoof',
            defaultVal: '1',
            title: t('prop_handler_bootmode', 'Hide Recovery'),
            description: t('prop_handler_bootmode_desc', 'Override ro.bootmode to hide that device booted from recovery'),
          },
        ],
      },
    ],
    infoCard: {
      icon: 'info',
      title: t('prop_handler_info_title', 'About Boot Spoofing'),
      text: t(
        'prop_handler_dialog_desc',
        'Manage boot-time property spoofing and cleanup. Locks bootloader state, verified boot, flash.locked, and hides recovery bootmode to prevent root and bootloader detection.'
      ),
    },
  });
}

export function wirePropHandler() {
  wireRowDialog('toggle-prop_handler-row', openPropHandlerDialog);
}
