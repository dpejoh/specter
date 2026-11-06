import { cfgGet, cfgSet } from './cfg.js';
import { t } from './i18n.js';
import { wireRowDialog } from './toggles.js';
import { openSubPage } from './subpage.js';


const DEFAULT_INTERVAL_MINUTES = 5;
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 60;

type DetectionMethod = 'instant' | 'polling';

function detectionMethod(value: string | null | undefined): DetectionMethod {
  return value === 'polling' ? 'polling' : 'instant';
}

function intervalMinutes(value: string | null | undefined): number {
  const seconds = Number.parseInt(value || '', 10);
  const minutes = Number.isFinite(seconds) ? Math.round(seconds / 60) : DEFAULT_INTERVAL_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, minutes));
}

export async function openAutoTargetDialog() {
  const [methodValue, intervalValue] = await Promise.all([
    cfgGet('auto_target_method', 'instant'),
    cfgGet('auto_target_interval', String(DEFAULT_INTERVAL_MINUTES * 60)),
  ]);

  let method = detectionMethod(methodValue);
  let minutes = intervalMinutes(intervalValue);

  const storedSeconds = Number.parseInt(intervalValue || '', 10);
  if (Number.isFinite(storedSeconds) && storedSeconds !== minutes * 60) {
    cfgSet('auto_target_interval', String(minutes * 60));
  }

  let intervalRow: HTMLElement | null = null;
  let intervalInput: HTMLInputElement | null = null;
  let intervalHelp: HTMLElement | null = null;
  let hideTimer: number | null = null;

  const reducedMotion = () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clearHideTimer = () => {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const setIntervalError = (invalid: boolean) => {
    if (!intervalInput || !intervalHelp) return;
    intervalInput.classList.toggle('subpage-inline-input--invalid', invalid);
    intervalInput.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    intervalHelp.classList.toggle('supporting-text--error', invalid);
    intervalHelp.textContent = invalid
      ? t('auto_target_interval_error', 'Enter a number from 1 to 60.')
      : t('auto_target_interval_desc', 'Minimum 1 minute.');
  };

  const updateMethodUI = (animate: boolean) => {
    if (!intervalRow) return;
    clearHideTimer();
    const polling = method === 'polling';

    if (polling) {
      intervalRow.classList.remove('at-interval--leaving');
      intervalRow.hidden = false;
      intervalRow.classList.add('at-interval--visible');
      return;
    }

    if (intervalInput) intervalInput.value = String(minutes);
    setIntervalError(false);
    intervalRow.classList.remove('at-interval--visible');

    if (animate && !reducedMotion()) {
      intervalRow.classList.add('at-interval--leaving');
      hideTimer = window.setTimeout(() => {
        if (intervalRow) {
          intervalRow.hidden = true;
          intervalRow.classList.remove('at-interval--leaving');
        }
        hideTimer = null;
      }, 180);
    } else {
      intervalRow.classList.remove('at-interval--leaving');
      intervalRow.hidden = true;
    }
  };

  const selectMethod = (next: DetectionMethod) => {
    method = next;
    cfgSet('auto_target_method', next);
    updateMethodUI(true);
  };

  const commitInterval = (value: string) => {
    const next = Number(value);
    if (!Number.isInteger(next) || next < MIN_INTERVAL_MINUTES || next > MAX_INTERVAL_MINUTES) {
      setIntervalError(true);
      return;
    }
    minutes = next;
    cfgSet('auto_target_interval', String(next * 60));
    setIntervalError(false);
  };

  const instance = await openSubPage({
    id: 'auto-target',
    title: t('auto_target_title', 'Auto Targeting'),
    description: t('auto_target_desc', 'Automatically watches for newly installed apps and adds them to Tricky Store target.txt.'),
    masterToggle: {
      key: 'toggle_auto_target',
      defaultVal: '1',
      title: t('control_toggle_auto_target_master', 'Use Auto-Targeting'),
      syncSwitchId: 'toggle-background_auto_target',
    },
    groups: [
      {
        title: t('auto_target_method', 'Detection'),
        items: [
          {
            type: 'radio',
            id: 'at-method-instant',
            name: 'auto_target_method',
            value: 'instant',
            title: t('auto_target_method_instant', 'Instant detection'),
            description: t('auto_target_method_instant_help', "New apps are added as soon as they're installed."),
            badge: t('auto_target_recommended', 'Recommended'),
            selected: method === 'instant',
            onSelect: () => selectMethod('instant'),
          },
          {
            type: 'radio',
            id: 'at-method-polling',
            name: 'auto_target_method',
            value: 'polling',
            title: t('auto_target_method_polling', 'Scheduled check'),
            description: t('auto_target_method_polling_help', 'Scans for new apps at a fixed interval.'),
            selected: method === 'polling',
            onSelect: () => selectMethod('polling'),
          },
          {
            type: 'input',
            id: 'at-interval',
            icon: 'schedule',
            title: t('auto_target_interval', 'Check every'),
            description: t('auto_target_interval_desc', 'Minimum 1 minute.'),
            inputType: 'number',
            min: MIN_INTERVAL_MINUTES,
            max: MAX_INTERVAL_MINUTES,
            step: 1,
            unit: t('auto_target_interval_unit', 'minutes'),
            ariaLabel: t('auto_target_interval_aria', 'Interval in minutes'),
            getValue: () => String(minutes),
            onChange: commitInterval,
          },
        ],
      },
    ],
  });

  intervalRow = instance.overlay.querySelector('#at-interval-row');
  intervalInput = instance.overlay.querySelector('#at-interval');
  intervalHelp = intervalRow?.querySelector('[slot="supporting"], .supporting-text') || null;

  if (intervalInput && intervalHelp) {
    intervalHelp.id = 'at-interval-help';
    intervalHelp.setAttribute('aria-live', 'polite');
    intervalInput.setAttribute('aria-describedby', 'at-interval-help');
  }

  updateMethodUI(false);
}

export function wireAutoTarget() {
  wireRowDialog('toggle-background_auto_target-row', openAutoTargetDialog);
}
