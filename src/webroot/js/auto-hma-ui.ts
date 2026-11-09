import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';


const HOURS_TO_SECONDS = 3600;
const DEFAULT_HOURS = 6;
const MIN_HOURS = 1;
const MAX_HOURS = 168;

function clampHours(hours: number): number {
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(hours)));
}

function storedSecondsToHours(raw: string | null | undefined): number {
  const seconds = parseInt(raw || '', 10);
  return Number.isFinite(seconds) ? clampHours(seconds / HOURS_TO_SECONDS) : DEFAULT_HOURS;
}

function inputHours(value: string): number {
  const hours = parseInt(value, 10);
  return Number.isFinite(hours) ? clampHours(hours) : DEFAULT_HOURS;
}

export function openAutoHmaDialog() {
  openSubPage({
    id: 'auto-hma',
    title: t('auto_hma_title', 'Auto-Update HMA Config'),
    description: t(
      'auto_hma_desc',
      'Regenerates the HMA-OSS hiding profile in the background. The action button skips HMA generation while this is enabled.'
    ),
    masterToggle: {
      key: 'toggle_auto_hma',
      defaultVal: '0',
      title: t('auto_hma_master', 'Use Auto-Update HMA Config'),
      syncSwitchId: 'toggle-background_auto_hma',
    },
    groups: [
      {
        items: [
          {
            type: 'input',
            id: 'auto-hma-interval-input',
            icon: 'timer',
            title: t('auto_hma_interval', 'Interval (hours)'),
            description: t('auto_hma_interval_desc', 'How often the background job regenerates the HMA profile. Minimum 1 hour.'),
            inputType: 'number',
            min: 1,
            max: 168,
            step: 1,
            unit: 'h',
            ariaLabel: t('auto_hma_interval_aria', 'HMA update interval in hours'),
            getValue: async () => {
              try {
                const raw = await cfgGet('hma_interval', String(DEFAULT_HOURS * HOURS_TO_SECONDS));
                return String(storedSecondsToHours(raw));
              } catch {
                return String(DEFAULT_HOURS);
              }
            },
            onChange: (value: string) => {
              cfgSet('hma_interval', String(inputHours(value) * HOURS_TO_SECONDS));
            },
          },
        ],
      },
    ],
    infoCard: {
      icon: 'info',
      title: t('auto_hma_info_title', 'Background Updates'),
      text: t(
        'auto_hma_info_text',
        'Background updates regenerate the HMA-OSS config after app installs/updates and on the configured schedule; HMA-OSS reloads it while its service is running. If it does not pick it up, reboot or long-press the HMA-OSS Home status card. If the config is missing or empty, the action button regenerates it. Enable Always Re-Generate HMA-OSS Config in the HMA-OSS Configs page to force regeneration on every action run.'
      ),
    },
  });
}

export function wireAutoHma() {
  wireRowDialog('toggle-background_auto_hma-row', openAutoHmaDialog);
}
