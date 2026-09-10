import { getTranslation } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openAdbDisablerDialog() {
  openSubPage({
    id: 'adb-disabler',
    title: t('control_toggle_adb_disabler', 'ADB Lock'),
    description: t(
      'adb_disabler_dialog_desc',
      'Choose which developer settings to disable at boot to prevent detection by banking apps, games, and security frameworks that check for ADB or developer mode.'
    ),
    masterToggle: {
      key: 'toggle_adb_disabler',
      defaultVal: '1',
      title: t('control_toggle_adb_disabler_master', 'Use ADB Lock'),
      syncSwitchId: 'toggle-adb_disabler',
    },
    groups: [
      {
        items: [
          {
            id: 'adb-dev-options',
            key: 'toggle_adb_disabler_dev_options',
            defaultVal: '1',
            title: t('adb_disabler_dev_options', 'Disable Developer Options'),
            description: t('adb_disabler_dev_options_desc', 'Disables developer options toggle in Settings'),
          },
          {
            id: 'adb-usb-debug',
            key: 'toggle_adb_disabler_usb_debug',
            defaultVal: '1',
            title: t('adb_disabler_usb_debug', 'Disable USB Debugging'),
            description: t('adb_disabler_usb_debug_desc', 'Disables ADB, strips adb from USB config, locks OEM unlock'),
          },
          {
            id: 'adb-oem-unlock',
            key: 'toggle_adb_disabler_oem_unlock',
            defaultVal: '1',
            title: t('adb_disabler_oem_unlock', 'Hide OEM Unlock Support'),
            description: t('adb_disabler_oem_unlock_desc', 'Hides OEM unlock toggle from developer options'),
          },
        ],
      },
    ],
  });
}

export function wireAdbDisabler() {
  wireRowDialog('toggle-adb_disabler-row', openAdbDisablerDialog);
}
