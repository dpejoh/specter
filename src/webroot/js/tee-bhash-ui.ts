import { spawnScript } from './bridge.js';
import { appendToOutput } from './terminal.js';
import { getTranslation } from './i18n.js';
import { showToast } from './toast.js';
import { addEntry } from './history.js';
const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

export function wireTeeHash() {
  const btn = document.getElementById('tee-hash-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const progress = document.getElementById('progress-dialog') as MdDialog | null;
    const label = document.getElementById('progress-label');
    if (label) label.textContent = t('check_tee_hash', 'TEE & Boot Hash');
    progress?.show();

    const lines: string[] = [];
    const child = spawnScript('check_tee_bhash.sh', 'common');
    child.stdout.on('data', (line: string) => {
      appendToOutput(line);
      lines.push(line);
    });
    child.on('exit', (code: number) => {
      progress?.close();
      const clean = lines.filter(l => l.includes('='));
      if (code !== 0 && !clean.length) {
        showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
        addEntry('check_tee_bhash.sh', lines.join('\n'), code);
        return;
      }
      const params: Record<string, string> = {};
      for (const kv of clean) {
        const m = kv.match(/^(\w+)=(.+)$/);
        if (m) params[m[1]!] = m[2]!.trim();
      }
      showResultDialog(
        params['tee_status'] || 'unknown',
        params['tee_bhash'] || '',
        params['boot_hash'] || '',
        params['vbmeta_hash'] || '',
        params['tee_tier'] || '',
      );
      addEntry('check_tee_bhash.sh', lines.join('\n'), code);
    });
    child.on('error', () => {
      progress?.close();
      showToast(t('simple_toast_error', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 3000 });
    });
  });
}

function showResultDialog(teeStatus: string, teeHash: string, bootHash: string, vbmetaHash: string, teeTier: string) {
  const statusIcon = teeStatus === 'normal' ? 'check_circle' : teeStatus === 'broken' ? 'error' : 'help';
  const statusClass = `tee-status--${teeStatus === 'normal' ? 'normal' : teeStatus === 'broken' ? 'broken' : 'unknown'}`;
  const statusLabel = teeStatus === 'normal' ? t('tee_status_normal', 'Normal')
    : teeStatus === 'broken' ? t('tee_status_broken', 'Broken')
    : teeStatus === 'error' ? t('tee_status_error', 'Error')
    : t('tee_status_unknown', 'Unknown');

  const tierIcon = teeTier === '2' ? 'verified' : teeTier === '1' ? 'security' : 'shield';
  const tierLabel = teeTier === '2' ? t('tee_tier_strongbox', 'StrongBox')
    : teeTier === '1' ? t('tee_tier_tee', 'TEE')
    : teeTier === '0' ? t('tee_tier_software', 'Software')
    : t('tee_tier_unknown', 'Unknown');

  const mismatch = vbmetaHash && teeHash && vbmetaHash !== teeHash;
  const teeClass = mismatch ? 'boot-hash-text boot-hash-text--mismatch' : 'boot-hash-text';
  const vbmetaClass = mismatch ? 'boot-hash-text boot-hash-text--mismatch' : 'boot-hash-text';

  function hashRow(label: string, hash: string, id: string, extraClass: string): string {
    if (!hash) return '';
    return `<div class="tee-hash-row">
      <span class="tee-hash-label">${label}</span>
      <span class="tee-hash-value">
        <code class="${extraClass}">${hash}</code>
        <md-icon-button id="${id}" aria-label="${t('history_copy', 'Copy')}">
          <md-icon aria-hidden="true">content_copy</md-icon>
        </md-icon-button>
      </span>
    </div>`;
  }

  const content = `<div class="tee-hash-row">
      <span class="tee-hash-label">${t('tee_status_label', 'TEE Status')}</span>
      <span class="tee-hash-value">
        <span class="tee-status-badge ${statusClass}"><md-icon aria-hidden="true">${statusIcon}</md-icon> ${statusLabel}</span>
      </span>
    </div>
    <div class="tee-hash-row">
      <span class="tee-hash-label">${t('tee_tier_label', 'Security Tier')}</span>
      <span class="tee-hash-value">
        <span class="tee-tier-badge"><md-icon aria-hidden="true">${tierIcon}</md-icon> ${tierLabel}</span>
      </span>
    </div>
    <md-divider class="settings-divider"></md-divider>
    ${hashRow(t('boot_hash_tee', 'Boot Hash (TEE)'), teeHash, 'tee-hash-copy-tee', teeClass)}
    ${hashRow(t('boot_hash_prop', 'Boot Hash (Prop)'), bootHash, 'tee-hash-copy-prop', 'boot-hash-text')}
    ${hashRow(t('boot_hash_calc', 'Boot Hash (Calc)'), vbmetaHash, 'tee-hash-copy-calc', vbmetaClass)}`;

  const dialog = document.createElement('md-dialog');
  dialog.innerHTML = `<div slot="headline">${t('check_tee_hash', 'TEE & Boot Hash')}</div>
    <div slot="content">${content}</div>
    <div slot="actions"><md-text-button id="tee-hash-close">${t('dialog_close', 'Close')}</md-text-button></div>`;
  document.body.appendChild(dialog);

  dialog.querySelector('#tee-hash-close')!.addEventListener('click', () => dialog.close());

  const copyMap: Record<string, string> = { 'tee-hash-copy-tee': teeHash, 'tee-hash-copy-prop': bootHash, 'tee-hash-copy-calc': vbmetaHash };
  for (const [id, hash] of Object.entries(copyMap)) {
    dialog.querySelector(`#${id}`)?.addEventListener('click', () => {
      if (!hash) return;
      navigator.clipboard.writeText(hash).then(() => showToast(t('history_copied', 'Copied!'), { icon: 'check_circle', type: 'success', autoCloseDelay: 2000 }))
        .catch(() => showToast(t('history_copy_failed', 'Failed'), { icon: 'error', type: 'error', autoCloseDelay: 2000 }));
    });
  }

  dialog.addEventListener('close', () => document.body.removeChild(dialog));
  dialog.show();
}
