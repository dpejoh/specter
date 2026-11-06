import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';

const DEFAULT_MINUTES = 5;

export function openKeyboxWatchDialog() {
  openSubPage({
    id: 'keybox-watch',
    title: t('keybox_watch_title', 'Keybox revocation watch'),
    description: t('keybox_watch_desc', 'Checks the installed keybox against the Specter catalog and replaces it when Auto Keybox is enabled.'),
    masterToggle: {
      key: 'toggle_keybox_info',
      defaultVal: '1',
      title: t('keybox_watch_master', 'Watch keybox revocation'),
      syncSwitchId: 'toggle-background_keybox_info',
    },
    groups: [{
      items: [{
        type: 'input',
        id: 'kbw-interval',
        title: t('keybox_watch_interval', 'Check interval (minutes)'),
        description: t('keybox_watch_interval_desc', 'Minimum 1 minute. Default 5 minutes.'),
        inputType: 'number',
        min: 1,
        unit: 'min',
        getValue: async () => {
          const raw = await cfgGet('keybox_watch_interval', '300');
          const seconds = parseInt(raw || '300', 10);
          return String(Math.max(1, Math.round((Number.isFinite(seconds) ? seconds : 300) / 60)));
        },
        onChange: (value) => {
          const minutes = parseInt(value || String(DEFAULT_MINUTES), 10);
          cfgSet('keybox_watch_interval', String(Math.max(1, Number.isFinite(minutes) ? minutes : DEFAULT_MINUTES) * 60));
        },
      }],
    }],
  });
}

export function wireKeyboxWatch() {
  wireRowDialog('toggle-background_keybox_info-row', openKeyboxWatchDialog);
}
