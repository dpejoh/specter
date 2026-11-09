import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';


const HOURS_TO_SECONDS = 3600;
const DEFAULT_HOURS = 24;
const MIN_HOURS = 1;

function storedSecondsToHours(raw: string | null | undefined): number {
  const seconds = parseInt(raw || '', 10);
  if (!Number.isFinite(seconds)) return DEFAULT_HOURS;
  const hours = Math.round(seconds / HOURS_TO_SECONDS);
  return hours > 0 ? hours : DEFAULT_HOURS;
}

function inputHours(value: string): number {
  const hours = parseInt(value, 10);
  return Number.isFinite(hours) ? Math.max(MIN_HOURS, hours) : DEFAULT_HOURS;
}

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
              try {
                const raw = await cfgGet('autopif_interval', String(DEFAULT_HOURS * HOURS_TO_SECONDS));
                return String(storedSecondsToHours(raw));
              } catch {
                return String(DEFAULT_HOURS);
              }
            },
            onChange: (val) => {
              cfgSet('autopif_interval', String(inputHours(val) * HOURS_TO_SECONDS));
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
