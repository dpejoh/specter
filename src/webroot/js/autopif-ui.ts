import { cfgGet, cfgSet } from './cfg.js';
import { getTranslation } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

const HOURS_TO_SECONDS = 3600;
const DEFAULT_HOURS = 24;

export function openAutopifDialog() {
  openSubPage({
    id: 'autopif',
    title: t('autopif_title', 'Auto PIF'),
    description: t('autopif_desc', 'Automatically fetches new Play Integrity fingerprints at a set interval.'),
    masterToggle: {
      key: 'toggle_autopif',
      defaultVal: '0',
      title: t('control_toggle_autopif_master', 'Use Auto PIF'),
      syncSwitchId: 'toggle-background_autopif',
    },
    groups: [
      {
        items: [
          {
            type: 'input',
            id: 'ap-interval',
            title: t('autopif_interval', 'Interval (hours)'),
            description: t('autopif_interval_desc', 'How often to check for new fingerprints. Default 24 hours (1 day).'),
            inputType: 'number',
            min: 1,
            unit: 'hrs',
            getValue: async () => {
              const raw = await cfgGet('autopif_interval', String(DEFAULT_HOURS * HOURS_TO_SECONDS));
              return String(Math.round(parseInt(raw || String(DEFAULT_HOURS * HOURS_TO_SECONDS), 10) / HOURS_TO_SECONDS) || DEFAULT_HOURS);
            },
            onChange: (val) => {
              const num = parseInt(val || String(DEFAULT_HOURS), 10);
              cfgSet('autopif_interval', String(Math.max(1, num) * HOURS_TO_SECONDS));
            },
          },
        ],
      },
    ],
  });
}

export function wireAutopif() {
  wireRowDialog('toggle-background_autopif-row', openAutopifDialog);
}
