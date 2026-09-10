import { getTranslation } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openRomFingerprintDialog() {
  openSubPage({
    id: 'rom-fingerprint',
    title: t('rom_fingerprint_dialog_title', 'ROM & Build Cleanup'),
    description: t(
      'rom_fingerprint_dialog_desc',
      'Clean custom ROM traces, debug build types, and module residue from properties.'
    ),
    masterToggle: {
      key: 'toggle_rom_fingerprint',
      defaultVal: '1',
      title: t('control_toggle_rom_fingerprint_master', 'Use ROM Cleaner'),
      syncSwitchId: 'toggle-rom_fingerprint',
    },
    groups: [
      {
        items: [
          {
            id: 'rf-hexpatch',
            key: 'toggle_rom_fingerprint_names',
            defaultVal: '1',
            title: t('rom_fingerprint_hexpatch', 'Delete ROM Prop Traces'),
            description: t('rom_fingerprint_hexpatch_desc', 'Delete build props containing known ROM names (Lineage, crDroid, PixelOS, etc.)'),
          },
          {
            id: 'rf-crom',
            key: 'toggle_custom_rom_props',
            defaultVal: '0',
            title: t('rom_fingerprint_custom_props', 'Custom ROM Props'),
            description: t('rom_fingerprint_custom_props_desc', 'Delete custom ROM identity props at boot (can break ROM OTAs)'),
          },
          {
            id: 'rf-prefix',
            key: 'toggle_rom_fingerprint_prefix',
            defaultVal: '1',
            title: t('rom_fingerprint_prefix', 'Strip ROM Prefixes'),
            description: t('rom_fingerprint_prefix_desc', 'Strip custom ROM prefixes (aosp_, lineage_) from build fingerprint and display id'),
          },
          {
            id: 'rf-pif',
            key: 'toggle_rom_fingerprint_pif',
            defaultVal: '1',
            title: t('rom_fingerprint_pif', 'Delete PIF Props'),
            description: t('rom_fingerprint_pif_desc', 'Delete Play Integrity Fix properties (pihook, pixelprops, spoof traces)'),
          },
          {
            id: 'rf-spoof',
            key: 'toggle_rom_fingerprint_build_type',
            defaultVal: '1',
            title: t('prop_handler_spoof_build', 'Clean Build Type'),
            description: t('prop_handler_spoof_build_desc', 'Strip userdebug/eng traces from build.flavor and build.fingerprint'),
          },
        ],
      },
    ],
    infoCard: {
      icon: 'info',
      text: t(
        'rom_fingerprint_info_desc',
        'Stripping custom ROM identifiers helps prevent detection, but removing custom props may disable ROM-specific features or OTA updates.'
      ),
    },
  });
}

export function wireRomFingerprint() {
  wireRowDialog('toggle-rom_fingerprint-row', openRomFingerprintDialog);
}
