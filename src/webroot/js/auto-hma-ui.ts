import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';


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
      defaultVal: '1',
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
              const raw = await cfgGet('hma_interval', '21600');
              return String(Math.max(1, Math.round(parseInt(raw || '21600', 10) / 3600)));
            },
            onChange: (value: string) => {
              const hours = Math.min(168, Math.max(1, parseInt(value || '6', 10)));
              cfgSet('hma_interval', String(hours * 3600));
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
        'Background updates only write the HMA-OSS config. Open HMA-OSS or reboot to apply the new profile. If the config is missing or empty, the action button regenerates it. Enable Always Re-Generate HMA-OSS Config in the HMA-OSS Configs page to force regeneration on every action run.'
      ),
    },
  });
}

export function wireAutoHma() {
  wireRowDialog('toggle-background_auto_hma-row', openAutoHmaDialog);
}
