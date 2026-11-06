import { isModuleInstalled } from './modules.js';

/** Show the Tools Play Integrity section only when the PIF module is present. */
export async function updatePlayIntegritySectionVisibility(): Promise<boolean> {
  const installed = await isModuleInstalled('playintegrityfix').catch(() => false);
  const section = document.getElementById('pif-tools-section');
  if (section) section.hidden = !installed;
  return installed;
}
