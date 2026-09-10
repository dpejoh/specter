import '@material/web/labs/segmentedbuttonset/outlined-segmented-button-set.js';
import '@material/web/labs/segmentedbutton/outlined-segmented-button.js';
import { cfgGet, cfgSet } from './cfg.js';
import { getTranslation } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function openAutoTargetDialog() {
  openSubPage({
    id: 'auto-target',
    title: t('auto_target_title', 'Auto Targeting'),
    masterToggle: {
      key: 'toggle_auto_target',
      defaultVal: '1',
      title: t('control_toggle_auto_target_master', 'Use Auto-Targeting'),
      syncSwitchId: 'toggle-background_auto_target',
    },
    groups: [
      {
        items: [
          {
            type: 'custom',
            id: 'at-custom-controls',
            render: async (container) => {
              const [method, interval] = await Promise.all([
                cfgGet('auto_target_method', 'instant'),
                cfgGet('auto_target_interval', '300'),
              ]);
              const isPolling = method === 'polling';

              container.innerHTML = `
                <div class="list-item" style="flex-direction: column; align-items: stretch; gap: 12px; cursor: default;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="toggle-text">${t('auto_target_method', 'Detection Method')}</div>
                  </div>
                  <md-outlined-segmented-button-set style="width: 100%;">
                    <md-outlined-segmented-button value="instant" ${method === 'instant' ? 'selected' : ''}>
                      <md-icon slot="icon">bolt</md-icon>
                      ${t('auto_target_method_instant', 'Instant')}
                    </md-outlined-segmented-button>
                    <md-outlined-segmented-button value="polling" ${method === 'polling' ? 'selected' : ''}>
                      <md-icon slot="icon">schedule</md-icon>
                      ${t('auto_target_method_polling', 'Polling')}
                    </md-outlined-segmented-button>
                  </md-outlined-segmented-button-set>
                  <div class="supporting-text" id="at-method-help">
                    ${isPolling ? t('auto_target_method_polling_help', 'Checks periodically at a set interval') : t('auto_target_method_instant_help', 'Detects new installs immediately via inotifyd (recommended)')}
                  </div>
                </div>

                <div class="list-item list-item--input" id="at-interval-row" style="${isPolling ? '' : 'display: none;'}">
                  <div class="li-icon"><md-icon aria-hidden="true">timer</md-icon></div>
                  <div class="list-item-content">
                    <div class="toggle-text">${t('auto_target_interval', 'Interval (seconds)')}</div>
                    <span class="supporting-text">${t('auto_target_interval_desc', 'How often to check for new apps. Minimum 3 seconds.')}</span>
                  </div>
                  <div class="spacer"></div>
                  <div class="subpage-input-wrapper">
                    <input type="number" id="at-interval-input" class="subpage-inline-input" min="3" value="${interval}" aria-label="${t('auto_target_interval_aria', 'Interval in seconds')}">
                    <span class="subpage-input-unit">sec</span>
                  </div>
                </div>
              `;

              const helpEl = container.querySelector('#at-method-help') as HTMLElement;
              const intervalRow = container.querySelector('#at-interval-row') as HTMLElement;
              const intervalInput = container.querySelector('#at-interval-input') as HTMLInputElement;

              container.querySelectorAll('md-outlined-segmented-button').forEach(btn => {
                btn.addEventListener('click', () => {
                  const val = btn.getAttribute('value') || 'instant';
                  const polling = val === 'polling';
                  cfgSet('auto_target_method', val);
                  helpEl.textContent = polling
                    ? t('auto_target_method_polling_help', 'Checks periodically at a set interval')
                    : t('auto_target_method_instant_help', 'Detects new installs immediately via inotifyd (recommended)');
                  intervalRow.style.display = polling ? '' : 'none';
                });
              });

              intervalInput?.addEventListener('input', () => {
                const num = parseInt(intervalInput.value || '15', 10);
                cfgSet('auto_target_interval', String(Math.max(3, num)));
              });
            },
          },
        ],
      },
    ],
    infoCard: {
      icon: 'info',
      title: t('auto_target_title', 'Auto Targeting'),
      text: t('auto_target_desc', 'Automatically watches for newly installed apps and adds them to Tricky Store target.txt.'),
    },
  });
}

export function wireAutoTarget() {
  wireRowDialog('toggle-background_auto_target-row', openAutoTargetDialog);
}
