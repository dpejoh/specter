import { openSubPage } from './subpage.js';
import { t } from './i18n.js';
import { afterPaint, escapeHtml } from './utils.js';
import {
  appendInfoSection,
  dash,
  formatDate,
  formatSize,
  type ValueSpec,
} from './info-page.js';
import { refreshKeyboxStatus, refreshKeyboxWatch } from './device.js';
import type { KeyboxInfoJson } from './types.js';
import './ui/sp-skeleton.js';

type InfoTone = 'default' | 'error' | 'warning';

function statusOf(data: KeyboxInfoJson): { label: string; tone: InfoTone } {
  if (!data.installed) return { label: t('keybox_info_not_installed', 'Not installed'), tone: 'error' };
  if (data.revoked) {
    return {
      label: data.revocation_status === 'REVOKED'
        ? t('keybox_info_revoked_google', 'Revoked by Google')
        : t('custom_kb_revoked', 'Revoked'),
      tone: 'error',
    };
  }
  if (data.cert_validity === 'not_yet_valid') return { label: t('keybox_info_not_yet_valid', 'Not yet valid'), tone: 'error' };
  if (data.expired) return { label: t('custom_kb_expired', 'Expired'), tone: 'error' };
  if (data.softbanned) {
    return {
      label: data.revocation_status === 'SUSPENDED'
        ? t('keybox_info_suspended_google', 'Suspended by Google')
        : t('custom_kb_softbanned', 'Softbanned'),
      tone: 'warning',
    };
  }
  if (data.cert_validity !== 'valid') return { label: t('keybox_info_validity_unknown', 'Certificate validity unknown'), tone: 'warning' };
  return { label: t('custom_kb_active', 'Active'), tone: 'default' };
}

function typeOf(data: KeyboxInfoJson): string {
  if (data.is_private) return t('keybox_info_private', 'Private');
  return data.rkp ? t('keybox_info_rkp', 'RKP') : t('keybox_info_normal', 'Normal');
}

function installAction(): string {
  return `
    <div class="info-page-actions">
      <md-filled-button id="keybox-info-install">
        <md-icon slot="icon" aria-hidden="true">vpn_key</md-icon>
        ${escapeHtml(t('keybox_info_install', 'Install new keybox'))}
      </md-filled-button>
    </div>
  `;
}

function buildPage(host: HTMLElement, data: KeyboxInfoJson | null): void {
  host.replaceChildren();

  if (!data) {
    host.innerHTML = `<div class="subpage-info-note">${escapeHtml(t('keybox_info_unavailable', 'Keybox information is unavailable.'))}</div>`;
    return;
  }

  if (!data.installed) {
    host.innerHTML = `
      <div class="subpage-info-note">
        <md-icon aria-hidden="true">vpn_key_off</md-icon>
        <div>
          <strong>${escapeHtml(t('keybox_info_not_installed', 'Not installed'))}</strong>
          <p>${escapeHtml(t('keybox_info_not_installed_desc', 'Install a keybox to enable attestation.'))}</p>
        </div>
      </div>
      ${installAction()}
    `;
    return;
  }

  const status = statusOf(data);

  const healthRows: ValueSpec[] = [
    { label: t('keybox_info_status', 'Status'), value: status.label, tone: status.tone },
  ];
  if (data.revocation_reason) {
    healthRows.push({ label: t('keybox_info_reason', 'Reason'), value: data.revocation_reason });
  }
  if (data.revocation_source) {
    healthRows.push({ label: t('keybox_info_source', 'Source'), value: data.revocation_source });
  }
  const checked = formatDate(data.revocation_checked_at || data.checked_at);
  if (checked !== '—') {
    healthRows.push({ label: t('keybox_info_checked', 'Last checked'), value: checked });
  }
  appendInfoSection(host, t('keybox_info_health_section', 'Health'), healthRows);

  const keyboxRows: ValueSpec[] = [];
  keyboxRows.push({
    label: t('keybox_info_provider', 'Provider'),
    value: data.is_private
      ? t('keybox_info_private_keybox', 'Private keybox')
      : dash(data.source),
  });
  if (!data.is_private && data.source_version) {
    keyboxRows.push({
      label: t('keybox_info_installed_version', 'Installed version'),
      value: dash(data.source_version),
      mono: true,
    });
  }
  keyboxRows.push({ label: t('keybox_info_type', 'Type'), value: typeOf(data) });

  if (data.serial) {
    keyboxRows.push({
      label: t('keybox_info_serial', 'Serial'),
      value: data.serial,
      mono: true,
      copy: true,
    });
  }
  keyboxRows.push({
    label: t('keybox_info_expires', 'Expires'),
    value: data.expires_at
      ? formatDate(data.expires_at)
      : t('keybox_info_no_expiry', 'No expiry'),
  });

  if (data.file_path) {
    keyboxRows.push({
      label: t('keybox_info_file', 'File'),
      value: data.file_path,
      mono: true,
      copy: true,
    });
  }
  const size = formatSize(data.file_size);
  if (size !== '—') {
    keyboxRows.push({ label: t('keybox_info_size', 'Size'), value: size });
  }
  const modified = formatDate(data.file_modified);
  if (modified !== '—') {
    keyboxRows.push({ label: t('keybox_info_modified', 'Modified'), value: modified });
  }
  appendInfoSection(host, t('keybox_info_keybox_section', 'Keybox'), keyboxRows);

  if (data.revoked || data.expired || data.softbanned) {
    host.insertAdjacentHTML('beforeend', installAction());
  }
}

function buildLoading(host: HTMLElement): void {
  host.replaceChildren();
  const section = document.createElement('sp-settings-section');
  section.setAttribute('aria-hidden', 'true');
  const widths: ReadonlyArray<readonly [string, string]> = [
    ['35%', '55%'],
    ['28%', '70%'],
    ['40%', '45%'],
    ['30%', '60%'],
  ];
  for (const [labelWidth, valueWidth] of widths) {
    const row = document.createElement('sp-settings-row');
    row.setAttribute('variant', 'custom');
    const label = document.createElement('sp-skeleton');
    label.setAttribute('variant', 'text');
    label.setAttribute('slot', 'headline');
    label.style.width = labelWidth;
    const value = document.createElement('sp-skeleton');
    value.setAttribute('variant', 'text');
    value.setAttribute('slot', 'supporting');
    value.style.width = valueWidth;
    row.append(label, value);
    section.append(row);
  }
  host.append(section);
}

export async function openKeyboxInfoPage(): Promise<void> {
  // The page opens immediately on a skeleton; the keybox status (a JSON
  // snapshot refreshed by a shell script) fills in when it lands.
  // Awaiting it first used to freeze the tap.
  let latest: KeyboxInfoJson | null = null;
  let loading = true;
  let hostEl: HTMLElement | null = null;
  let pageRef: { close: () => void } | null = null;

  const render = (host: HTMLElement, data: KeyboxInfoJson | null) => {
    buildPage(host, data);
    host.querySelector('#keybox-info-install')?.addEventListener('click', () => {
      pageRef?.close();
      window.setTimeout(() => {
        void import('./keybox-catalog-ui.js').then(m => m.openKeyboxCatalogPage());
      }, 120);
    });
  };

  const refresh = async () => {
    const button = document.getElementById('keybox-info-refresh') as HTMLElement | null;
    if (button) button.setAttribute('disabled', '');
    try {
      latest = await refreshKeyboxWatch(0);
      if (hostEl) render(hostEl, latest);
    } finally {
      if (button) button.removeAttribute('disabled');
    }
  };

  const page = await openSubPage({
    id: 'keybox-info',
    title: t('keybox_info_title', 'Keybox details'),
    description: t('keybox_info_desc', 'Installed keybox identity, health, and file information.'),
    headerAction: (container) => {
      const button = document.createElement('md-icon-button');
      button.id = 'keybox-info-refresh';
      button.setAttribute('aria-label', t('common_refresh', 'Refresh'));
      button.innerHTML = '<md-icon aria-hidden="true">refresh</md-icon>';
      button.addEventListener('click', () => { void refresh(); });
      container.appendChild(button);
    },
    groups: [{
      items: [{
        type: 'custom',
        render: (host) => {
          hostEl = host;
          host.parentElement?.classList.add('info-page-container');
          host.className = 'keybox-info-page';
          if (loading) buildLoading(host);
          else render(host, latest);
        },
      }],
    }],
  });

  pageRef = page;

  // The skeleton is on screen; let it paint before the status load starts
  // so the load cannot block the page's first frame.
  await new Promise<void>(resolve => afterPaint(resolve, 300));

  latest = await refreshKeyboxStatus();
  loading = false;
  if (hostEl) render(hostEl, latest);
}
