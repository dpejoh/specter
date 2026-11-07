import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';

const DEFAULT_MINUTES = 60;

export function openKeyboxWatchDialog() {
  openSubPage({
    id: 'keybox-watch',
    title: t('keybox_refresh_title', 'Keybox refresh'),
    description: t('keybox_refresh_desc', 'Checks the installed keybox and replaces it when revoked or expired.'),
    masterToggle: {
      key: 'toggle_keybox_info',
      defaultVal: '1',
      title: t('keybox_refresh_master', 'Enable keybox refresh'),
      syncSwitchId: 'toggle-background_keybox_info',
    },
    groups: [{
      items: [
        {
          type: 'switch',
          id: 'kbw-replace',
          key: 'toggle_keybox_auto_replace',
          defaultVal: '1',
          title: t('keybox_refresh_replace', 'Replace keybox if revoked'),
          description: t('keybox_refresh_replace_desc', 'Automatically install a new keybox when the current one is revoked or expired.'),
        },
        {
          type: 'input',
          id: 'kbw-interval',
          title: t('keybox_refresh_interval', 'Check interval (minutes)'),
          description: t('keybox_refresh_interval_desc', 'Minimum 1 minute. Default 60 minutes. Opening the WebUI checks immediately.'),
          inputType: 'number',
          min: 1,
          unit: 'min',
          getValue: async () => {
            const raw = await cfgGet('keybox_watch_interval', '3600');
            const seconds = parseInt(raw || '3600', 10);
            return String(Math.max(1, Math.round((Number.isFinite(seconds) ? seconds : 3600) / 60)));
          },
          onChange: (value) => {
            const minutes = parseInt(value || String(DEFAULT_MINUTES), 10);
            cfgSet('keybox_watch_interval', String(Math.max(1, Number.isFinite(minutes) ? minutes : DEFAULT_MINUTES) * 60));
          },
        },
      ],
    }],
  });
}

export function wireKeyboxWatch() {
  wireRowDialog('toggle-background_keybox_info-row', openKeyboxWatchDialog);
}
