import { cfgGet } from './cfg.js';
import { t } from './i18n.js';

interface PreferredDevice {
  model: string;
  product: string;
}

function parsePreferred(raw: string): PreferredDevice[] {
  const out: PreferredDevice[] = [];
  for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
    const i = line.indexOf('|');
    if (i < 0) continue;
    const model = line.slice(0, i);
    const product = line.slice(i + 1);
    if (product) out.push({ model, product });
  }
  return out;
}

async function loadPreferred(): Promise<PreferredDevice[]> {
  const raw = (await cfgGet('pif_preferred_devices', '')) || '';
  if (raw.trim()) return parsePreferred(raw);
  const product = (await cfgGet('pif_preferred_product', '')) || '';
  const model = (await cfgGet('pif_preferred_model', '')) || '';
  return product ? [{ model, product }] : [];
}

async function loadBlacklist(): Promise<Set<string>> {
  const raw = (await cfgGet('pif_blacklist', '')) || '';
  const set = new Set<string>();
  for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
    const prod = line.includes('|') ? line.split('|')[1]?.trim() : line;
    if (prod) set.add(prod);
  }
  return set;
}


/** Update the "Choose PIF Device" row summary without loading the full picker. */
export async function refreshPifChooseDesc(): Promise<void> {
  const desc = document.getElementById('pif-choose-device-desc');
  if (!desc) return;
  const [preferred, blacklist] = await Promise.all([loadPreferred(), loadBlacklist()]);
  if (preferred.length === 1) {
    const label = preferred[0]?.model || preferred[0]?.product || '';
    desc.textContent = t('menu_pif_choose_current', 'Current: {0}').replace('{0}', label);
    return;
  }
  if (preferred.length > 1) {
    desc.textContent = t('menu_pif_choose_current_many', 'Current: {0} devices').replace(
      '{0}',
      String(preferred.length)
    );
    return;
  }
  if (blacklist.size > 0) {
    desc.textContent = t('menu_pif_random_blacklisted', 'Random Canary ({0} blacklisted)').replace(
      '{0}',
      String(blacklist.size)
    );
    return;
  }
  desc.textContent = t('menu_pif_choose_desc', 'Pick which Pixel Canary models Specter may fetch');
}
