import { exec, spawnScript, getModuleDir } from './bridge.js';
import { getTranslation } from './i18n.js';
import { showToast } from './toast.js';
import { addEntry } from './history.js';
import { appendToOutput } from './terminal.js';
import { shellEscape } from './utils.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

function getSpDir(): string {
  return '/data/adb/specter';
}

function cacheDir(): string {
  const mod = getModuleDir();
  return mod || '/data/adb/modules/specter';
}

export function wireTeeHash() {
  const btn = document.getElementById('tee-hash-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const progress = document.getElementById('progress-dialog') as MdDialog | null;
    const label = document.getElementById('progress-label');
    if (label) label.textContent = t('check_tee_hash', 'TEE & Boot Hash');
    progress?.show();

    const lines: string[] = [];
    let stdout = '';

    try {
      const child = spawnScript('check_tee_hash.sh', 'common');

      child.stdout.on('data', (line: string) => {
        stdout += line + '\n';
        lines.push(line);
        appendToOutput(line);
      });
      child.stderr.on('data', (line: string) => {
        lines.push('[!] ' + line);
        appendToOutput(line, true);
      });

      const exitCode = await new Promise<number>(resolve => {
        child.on('exit', resolve);
        child.on('error', () => resolve(-1));
      });

      progress?.close();

      if (exitCode !== 0 && !lines.length) {
        showToast(t('simple_toast_error', 'Failed'), {
          icon: 'error', type: 'error', autoCloseDelay: 3000,
        });
        return;
      }

      const params: Record<string, string> = {};
      for (const kv of lines) {
        const m = kv.match(/^(\w+)=(.+)$/);
        if (m) params[m[1]!] = m[2]!.trim();
      }

      const teeStatus = params['tee_status'] || 'unknown';
      const teeHash = params['tee_hash'] || '';
      const vbmetaHash = params['vbmeta_hash'] || '';
      const bootHash = params['boot_hash'] || teeHash || vbmetaHash || t('boot_hash_unavailable', 'Not available');

      showResultDialog(teeStatus, bootHash, teeHash, vbmetaHash);

      addEntry('check_tee_hash.sh', stdout);
    } catch {
      progress?.close();
      showToast(t('simple_toast_error', 'Failed'), {
        icon: 'error', type: 'error', autoCloseDelay: 3000,
      });
    }
  });
}

function showResultDialog(
  teeStatus: string,
  bootHash: string,
  teeHash: string,
  vbmetaHash: string,
) {
  const statusIcon = teeStatus === 'normal' ? 'check_circle' : teeStatus === 'broken' ? 'error' : 'help';
  const statusClass = `tee-status--${teeStatus === 'normal' ? 'normal' : teeStatus === 'broken' ? 'broken' : 'unknown'}`;
  const statusLabel = teeStatus === 'normal' ? t('tee_status_normal', 'Normal')
    : teeStatus === 'broken' ? t('tee_status_broken', 'Broken')
    : teeStatus === 'error' ? t('tee_status_error', 'Error')
    : t('tee_status_unknown', 'Unknown');

  const content = `
    <div class="tee-hash-row">
      <span class="tee-hash-label">${t('tee_status_label', 'TEE Status')}</span>
      <span class="tee-hash-value">
        <span class="tee-status-badge ${statusClass}">
          <md-icon aria-hidden="true">${statusIcon}</md-icon>
          ${statusLabel}
        </span>
      </span>
    </div>
    <md-divider class="settings-divider"></md-divider>
    <div class="tee-hash-row">
      <span class="tee-hash-label">${t('boot_hash', 'Boot Hash')}</span>
      <span class="tee-hash-value">
        <code class="boot-hash-text">${bootHash}</code>
        <md-icon-button id="tee-hash-copy" aria-label="${t('history_copy', 'Copy')}">
          <md-icon aria-hidden="true">content_copy</md-icon>
        </md-icon-button>
      </span>
    </div>
  `;

  const actions = `
    <md-text-button id="tee-hash-close">${t('dialog_close', 'Close')}</md-text-button>
    <md-filled-tonal-button id="tee-hash-save">${t('cache_update', 'Update cache')}</md-filled-tonal-button>
  `;

  const dialog = document.createElement('md-dialog');
  dialog.innerHTML = `
    <div slot="headline">${t('check_tee_hash', 'TEE & Boot Hash')}</div>
    <div slot="content">${content}</div>
    <div slot="actions">${actions}</div>
  `;
  document.body.appendChild(dialog);

  dialog.querySelector('#tee-hash-close')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('#tee-hash-copy')?.addEventListener('click', () => {
    navigator.clipboard.writeText(bootHash).then(() => {
      showToast(t('history_copied', 'Copied!'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2000 });
    }).catch(() => {
      showToast(t('history_copy_failed', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 2000 });
    });
  });
  dialog.querySelector('#tee-hash-save')!.addEventListener('click', async () => {
    try {
      const spDir = getSpDir();
      const mod = cacheDir();
      const cmds: string[] = [];

      const teeBool = teeStatus === 'normal' ? 'false' : 'true';
      cmds.push(`mkdir -p ${shellEscape(spDir)}`);
      cmds.push(`printf 'tee_broken=%s\\n' ${shellEscape(teeBool)} > ${shellEscape(spDir + '/tee_status')}`);

      if (teeHash) {
        cmds.push(`printf '%s\\n' ${shellEscape(teeHash)} > ${shellEscape(spDir + '/tee_hash')}`);
      }
      if (vbmetaHash) {
        cmds.push(`printf '%s\\n' ${shellEscape(vbmetaHash)} > ${shellEscape(spDir + '/vbmeta_digest')}`);
      }
      cmds.push(`rm -f ${shellEscape(spDir + '/tee_reported')}`);

      await exec(cmds.join(' && '));
      showToast(t('cache_updated', 'Cache updated'), {
        icon: 'check_circle', type: 'success', autoCloseDelay: 2500,
      });
      dialog.close();
    } catch {
      showToast(t('boot_hash_save_error', 'Failed to save'), {
        icon: 'error', type: 'error', autoCloseDelay: 4000,
      });
    }
  });

  dialog.addEventListener('close', () => document.body.removeChild(dialog));
  dialog.show();
}
