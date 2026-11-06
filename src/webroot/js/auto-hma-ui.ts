import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';
import { rowContent, rowIcon, rowShell } from './ui-row.js';


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
            type: 'custom',
            id: 'auto-hma-interval',
            render: async (container) => {
              const raw = await cfgGet('hma_interval', '21600');
              const hours = Math.max(1, Math.round(parseInt(raw || '21600', 10) / 3600));

              container.innerHTML = rowShell({
                className: 'list-item--only list-item--input',
                leading: rowIcon('timer'),
                content: rowContent({
                  title: t('auto_hma_interval', 'Interval (hours)'),
                  description: t('auto_hma_interval_desc', 'How often the background job regenerates the HMA profile. Minimum 1 hour.'),
                }),
                trailing: `<div class="spacer"></div>
                  <div class="subpage-input-wrapper">
                    <input type="number" id="auto-hma-interval-input" class="subpage-inline-input" min="1" max="168" value="${hours}" aria-label="${t('auto_hma_interval_aria', 'HMA update interval in hours')}">
                    <span class="subpage-input-unit">h</span>
                  </div>`,
              });

              const input = container.querySelector('#auto-hma-interval-input') as HTMLInputElement | null;
              input?.addEventListener('input', () => {
                const value = Math.min(168, Math.max(1, parseInt(input.value || '6', 10)));
                cfgSet('hma_interval', String(value * 3600));
              });
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
