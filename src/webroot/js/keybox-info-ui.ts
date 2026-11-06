import { openSubPage } from './subpage.js';
import { t } from './i18n.js';
import { escapeHtml } from './utils.js';
import { dash, formatDate, formatSize, infoGroup, wireCopyButtons, type ValueSpec } from './info-page.js';
import { refreshKeyboxStatus, refreshKeyboxWatch } from './device.js';
import type { KeyboxInfoJson } from './types.js';

function statusOf(data: KeyboxInfoJson): { label: string; tone: ValueSpec['tone'] } {
  if (!data.installed) return { label: t('keybox_info_not_installed', 'Not installed'), tone: 'error' };
  if (data.revoked) {
    return {
      label: data.revocation_status === 'REVOKED'
        ? t('keybox_info_revoked_google', 'Revoked by Google')
        : t('custom_kb_revoked', 'Revoked'),
      tone: 'error',
    };
  }
  if (data.expired) return { label: t('custom_kb_expired', 'Expired'), tone: 'error' };
  if (data.softbanned) {
    return {
      label: data.revocation_status === 'SUSPENDED'
        ? t('keybox_info_suspended_google', 'Suspended by Google')
        : t('custom_kb_softbanned', 'Softbanned'),
      tone: 'warning',
    };
  }
  return { label: t('custom_kb_active', 'Active'), tone: 'default' };
}

function typeOf(data: KeyboxInfoJson): string {
  if (data.is_private) return t('keybox_info_private', 'Private');
  return data.rkp ? t('keybox_info_rkp', 'RKP') : t('keybox_info_normal', 'Normal');
}

function nameOf(data: KeyboxInfoJson): string {
  if (data.is_private) return t('keybox_info_private_keybox', 'Private keybox');
  const version = data.source_version
    ? (data.source_version.startsWith('v') ? data.source_version : `v${data.source_version}`)
    : '';
  const text = data.text && data.text !== data.source_version ? data.text : '';
  return [text || version, data.source && data.source !== 'Private' ? `by ${data.source}` : '']
    .filter(Boolean)
    .join(' ') || dash(data.source);
}

function revocationText(data: KeyboxInfoJson): string {
  if (data.revocation_status) {
    return data.revocation_reason
      ? `${data.revocation_status} · ${data.revocation_reason}`
      : data.revocation_status;
  }
  if (data.revoked) return t('custom_kb_revoked', 'Revoked');
  if (data.softbanned) return t('custom_kb_softbanned', 'Softbanned');
  return t('keybox_info_not_revoked', 'Not revoked');
}

function buildPage(data: KeyboxInfoJson | null): string {
  if (!data) {
    return `<div class="subpage-info-note">${escapeHtml(t('keybox_info_unavailable', 'Keybox information is unavailable.'))}</div>`;
  }

  const status = statusOf(data);
  const sections: string[] = [];

  sections.push(infoGroup(t('keybox_info_status_section', 'Overview'), [
    { label: t('keybox_info_name', 'Name'), value: nameOf(data) },
    { label: t('keybox_info_provider', 'Provider'), value: dash(data.source) },
    { label: t('keybox_info_version', 'Version'), value: dash(data.source_version), mono: true },
    {
      label: t('keybox_info_latest', 'Latest version'),
      value: data.latest_version
        ? dash(data.latest_version)
        : (data.up_to_date ? t('device_latest', 'Latest') : '—'),
    },
    { label: t('keybox_info_type', 'Type'), value: typeOf(data) },
    { label: t('keybox_info_status', 'Status'), value: status.label, tone: status.tone },
  ]));

  sections.push(infoGroup(t('keybox_info_cert_section', 'Certificate'), [
    { label: t('keybox_info_serial', 'Serial'), value: dash(data.serial), mono: true, copy: true },
    {
      label: t('keybox_info_expires', 'Expires'),
      value: data.expires_at ? formatDate(data.expires_at) : t('keybox_info_no_expiry', 'No expiry'),
    },
    { label: t('keybox_info_revocation', 'Revocation'), value: revocationText(data), tone: status.tone },
    { label: t('keybox_info_checked', 'Last checked'), value: formatDate(data.revocation_checked_at || data.checked_at) },
  ]));

  sections.push(infoGroup(t('keybox_info_file_section', 'Installation'), [
    { label: t('keybox_info_file', 'File'), value: dash(data.file_path), mono: true, copy: true },
    { label: t('keybox_info_size', 'Size'), value: formatSize(data.file_size) },
    { label: t('keybox_info_modified', 'Modified'), value: formatDate(data.file_modified) },
  ]));

  const needsInstall = !data.installed || !!data.revoked || !!data.expired;
  if (needsInstall) {
    sections.push(`
      <div class="info-page-actions">
        <md-filled-button id="keybox-info-install">
          <md-icon slot="icon" aria-hidden="true">vpn_key</md-icon>
          ${escapeHtml(t('keybox_info_install', 'Install new keybox'))}
        </md-filled-button>
      </div>
    `);
  }

  return sections.join('');
}

export async function openKeyboxInfoPage(): Promise<void> {
  let latest = await refreshKeyboxStatus();
  let hostEl: HTMLElement | null = null;
  let pageRef: { close: () => void } | null = null;

  const render = (host: HTMLElement, data: KeyboxInfoJson | null) => {
    host.innerHTML = buildPage(data);
    wireCopyButtons(host);
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
    description: t('keybox_info_desc', 'Installed keybox identity, certificate status, and file information.'),
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
          render(host, latest);
        },
      }],
    }],
  });

  pageRef = page;
}
