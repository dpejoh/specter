import { refreshKeystoreManager } from './device.js';
import { onToolsShow } from './navigation.js';

export function wireOmkRestart() {
  refreshKeystoreManager().catch(() => {});
  onToolsShow(() => { refreshKeystoreManager().catch(() => {}); });
}
