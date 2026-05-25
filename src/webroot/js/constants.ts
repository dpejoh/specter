export const EXEC_TIMEOUT_MS: number = 15000;
export const ONLINE_ENDPOINTS: string[] = [
  'https://clients3.google.com/generate_204',
  'https://www.gstatic.com/generate_204',
];
export const STORAGE_KEY: string = 'specter_script_history';
export const MAX_ENTRIES: number = 240;
export const API_URLS: Record<string, string> = {
  KEY_CATALOG: 'https://rawbin.netlify.app/key/catalog',
  INFO: '/json/info.json',
  KEYBOX_INFO: '/json/keybox_info.json',
  GITHUB: 'https://github.com/dpejoh/specter',
  TELEGRAM: 'https://t.me/dpejoh',
};

export interface ToggleDef {
  id: string;
  key: string;
  default?: string;
}

export const CONTROL_TOGGLES: ToggleDef[] = [
  { id: 'toggle-recovery', key: 'toggle_recovery' },
  { id: 'toggle-boot_hardening', key: 'toggle_boot_hardening' },
  { id: 'toggle-prop_handler', key: 'toggle_prop_handler' },
  { id: 'toggle-lsposed', key: 'toggle_lsposed' },
  { id: 'toggle-suspicious_props', key: 'toggle_suspicious_props' },
  { id: 'toggle-action_gms', key: 'toggle_action_gms' },
  { id: 'toggle-action_target', key: 'toggle_action_target' },
  { id: 'toggle-action_security_patch', key: 'toggle_action_security_patch' },
  { id: 'toggle-action_keybox', key: 'toggle_action_keybox' },
  { id: 'toggle-action_pif', key: 'toggle_action_pif', default: '0' },
];

export function defaultSecurityPatch(): string {
  const now = new Date();
  const m = now.getMonth();
  const prevM = m === 0 ? 12 : m;
  const prevY = m === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return `${prevY}-${String(prevM).padStart(2, '0')}-05`;
}
