export const EXEC_TIMEOUT_MS: number = 60000;
export const ONLINE_ENDPOINTS: string[] = [
  'https://clients3.google.com/generate_204',
  'https://www.gstatic.com/generate_204',
];
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
}

export const CONTROL_TOGGLES: ToggleDef[] = [
  { id: 'toggle-prop_handler', key: 'toggle_prop_handler', icon: 'lock', section: 'boot' },
  { id: 'toggle-rom_fingerprint', key: 'toggle_rom_fingerprint', default: '1', icon: 'fingerprint', section: 'boot' },
  { id: 'toggle-adb_disabler', key: 'toggle_adb_disabler', default: '0', icon: 'usb_off', section: 'boot' },
  { id: 'toggle-action_gms', key: 'toggle_action_gms', icon: 'block', section: 'action' },
  { id: 'toggle-action_target', key: 'toggle_action_target', icon: 'list_alt', section: 'action' },
  { id: 'toggle-action_security_patch', key: 'toggle_action_security_patch', icon: 'security_update_good', section: 'action' },
  { id: 'toggle-action_pif', key: 'toggle_action_pif', icon: 'fingerprint', section: 'action' },
  { id: 'toggle-action_keybox', key: 'toggle_action_keybox', icon: 'vpn_key', section: 'action' },
  { id: 'toggle-background_auto_target', key: 'toggle_auto_target', icon: 'my_location', section: 'background' },
  { id: 'toggle-background_keybox_info', key: 'toggle_keybox_info', icon: 'refresh', section: 'background' },
  { id: 'toggle-background_autopif', key: 'toggle_autopif', default: '0', icon: 'fingerprint', section: 'background' },
  { id: 'toggle-background_autokeybox', key: 'toggle_autokeybox', default: '0', icon: 'vpn_key', section: 'background' },
];

export const FEATURE_I18N_KEYS: Record<string, string> = {
  prop_handler: 'control_toggle_prop_handler',
  security_patch: 'control_toggle_action_security_patch',
  target: 'control_toggle_action_target',
  boot_hash: 'prop_handler_boot_hash',
};

export const TRICKY_DIR = '/data/adb/tricky_store';

export function defaultSecurityPatch(): string {
  const now = new Date();
  const m = now.getMonth();
  const prevM = m === 0 ? 12 : m;
  const prevY = m === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return `${prevY}-${String(prevM).padStart(2, '0')}-05`;
}
