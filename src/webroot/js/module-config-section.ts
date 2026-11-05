import { isAnyModuleInstalled } from './modules.js';

const HMA_MODULE_IDS = ['hma_oss_zygisk', 'hma_oss'];
const ZYGISK_NEXT_MODULE_IDS = ['zygisksu'];

/** Hide Module Configs rows whose module is not installed. */
export async function updateModuleConfigSectionVisibility(): Promise<void> {
  const [hma, zygiskNext] = await Promise.all([
    isAnyModuleInstalled(HMA_MODULE_IDS).catch(() => false),
    isAnyModuleInstalled(ZYGISK_NEXT_MODULE_IDS).catch(() => false),
  ]);

  const rows: Array<[string, boolean]> = [
    ['module-config-hma', hma],
    ['module-config-zygisk-next', zygiskNext],
  ];
  for (const [id, visible] of rows) {
    const row = document.getElementById(id);
    if (row) row.hidden = !visible;
  }

  const anyVisible = hma || zygiskNext;
  const title = document.getElementById('module-config-title');
  const section = document.getElementById('module-config-section');
  if (title) title.hidden = !anyVisible;
  if (section) section.hidden = !anyVisible;
}
