export const EXEC_TIMEOUT_MS: number = 60000;
export const STORAGE_KEY: string = 'specter_script_history';
export const MAX_ENTRIES: number = 240;
export const API_URLS: Record<string, string | undefined> = {
  KEY_CATALOG: 'https://rawbin.dpejoh.com/catalog',
  INFO: '/json/info.json',
  KEYBOX_INFO: '/json/keybox_info.json',
  KEYSTORE_MANAGER: '/json/keystore_manager.json',
  GITHUB: 'https://github.com/dpejoh/specter',
  TELEGRAM: 'https://telegram.me/dpejoh',
};



export interface ToggleDef {
  id: string;
  key: string;
  default?: string;
  icon: string;
  section: 'boot' | 'action' | 'background';
  configurable?: boolean;
  title?: string;
  description?: string;
}

export const CONTROL_TOGGLES: ToggleDef[] = [
  { id: 'toggle-prop_handler', key: 'toggle_prop_handler', icon: 'lock', section: 'boot', configurable: true },
  { id: 'toggle-boot_hash', key: 'toggle_boot_hash', default: '1', icon: 'tag', section: 'boot', configurable: true },
  { id: 'toggle-rom_fingerprint', key: 'toggle_rom_fingerprint', default: '1', icon: 'fingerprint', section: 'boot', configurable: true },
  { id: 'toggle-adb_disabler', key: 'toggle_adb_disabler', default: '0', icon: 'usb_off', section: 'boot', configurable: true },
  { id: 'toggle-action_gms', key: 'toggle_action_gms', icon: 'block', section: 'action', configurable: true },
  { id: 'toggle-action_target', key: 'toggle_action_target', default: '1', icon: 'list_alt', section: 'action', configurable: true },
  { id: 'toggle-action_security_patch', key: 'toggle_action_security_patch', default: '0', icon: 'security_update_good', section: 'action', configurable: true },
  { id: 'toggle-action_pif', key: 'toggle_action_pif', icon: 'fingerprint', section: 'action' },
  { id: 'toggle-action_keybox', key: 'toggle_action_keybox', default: '1', icon: 'vpn_key', section: 'action', configurable: true },
  { id: 'toggle-action_hma', key: 'toggle_action_hma', default: '0', icon: 'visibility_off', section: 'action', configurable: true },
  { id: 'toggle-background_auto_target', key: 'toggle_auto_target', icon: 'my_location', section: 'background', configurable: true },
  { id: 'toggle-background_auto_hma', key: 'toggle_auto_hma', default: '0', icon: 'autorenew', section: 'background', configurable: true },
  { id: 'toggle-background_keybox_info', key: 'toggle_keybox_info', icon: 'refresh', section: 'background', configurable: true },
  { id: 'toggle-background_autopif', key: 'toggle_autopif', default: '0', icon: 'fingerprint', section: 'background', configurable: true },
];

export const FEATURE_I18N_KEYS: Record<string, string> = {
  prop_handler: 'control_toggle_prop_handler',
  boot_hash: 'control_toggle_boot_hash',
  security_patch: 'control_toggle_action_security_patch',
  target: 'control_toggle_action_target',
  teesim_mode: 'ta_teesim_mode_title',
};

export function defaultSecurityPatch(): string {
  const now = new Date();
  const m = now.getMonth();
  const prevM = m === 0 ? 12 : m;
  const prevY = m === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return `${prevY}-${String(prevM).padStart(2, '0')}-05`;
}
