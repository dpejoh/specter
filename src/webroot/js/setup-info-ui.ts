import { openSubPage } from './subpage.js';
import { t } from './i18n.js';
import { afterPaint, escapeHtml, fetchJson } from './utils.js';
import './ui/sp-skeleton.js';
import { runScript } from './bridge.js';
import { appendInfoSection, dash, formatDate, type ValueSpec } from './info-page.js';
import type { SetupInfoJson, SetupInfoModule } from './types.js';

function deviceRows(data: SetupInfoJson): ValueSpec[] {
  const device = data.device ?? {};
  return [
    { label: t('setup_android', 'Android version'), value: dash(device.android) },
    { label: t('setup_security_patch', 'Security patch'), value: dash(device.effective_patch || device.security_patch) },
    { label: t('setup_root', 'Root solution'), value: dash(device.root) },
    { label: t('setup_specter', 'Specter version'), value: dash(device.specter) },
  ];
}

function appendModuleSection(host: HTMLElement, module: SetupInfoModule): void {
  const rows: ValueSpec[] = [];
  if (module.version) {
    rows.push({ label: t('setup_version', 'Version'), value: dash(module.version) });
  }
  rows.push(...module.rows.map((row) => ({
    label: row.label,
    value: dash(row.value),
  })));
  appendInfoSection(host, module.name, rows);
}

function buildLoading(host: HTMLElement): void {
  const mkSection = (rows: number): HTMLElement => {
    const section = document.createElement('sp-settings-section');
    section.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < rows; i++) {
      const row = document.createElement('sp-settings-row');
      row.className = 'kb-skeleton-row';
      row.setAttribute('variant', 'custom');
      const lead = document.createElement('span');
      lead.setAttribute('slot', 'leading');
      lead.className = 'kb-skeleton-lead';
      const icon = document.createElement('sp-skeleton');
      icon.setAttribute('variant', 'rounded');
      icon.className = 'kb-skeleton-icon';
      lead.append(icon);
      row.append(lead);
      const headline = document.createElement('span');
      headline.setAttribute('slot', 'headline');
      const title = document.createElement('sp-skeleton');
      title.setAttribute('variant', 'text');
      title.className = 'kb-skeleton-title';
      headline.append(title);
      row.append(headline);
      const supporting = document.createElement('span');
      supporting.setAttribute('slot', 'supporting');
      const description = document.createElement('sp-skeleton');
      description.setAttribute('variant', 'text');
      description.className = 'kb-skeleton-desc';
      supporting.append(description);
      row.append(supporting);
      section.append(row);
    }
    return section;
  };
  host.append(mkSection(4), mkSection(3));
}

function buildPage(host: HTMLElement, data: SetupInfoJson | null, loading: boolean): void {
  host.replaceChildren();

  if (loading) {
    buildLoading(host);
    return;
  }
  if (!data) {
    host.innerHTML = `<div class="subpage-info-note"><md-icon aria-hidden="true">error</md-icon><div><strong>${escapeHtml(t('setup_unavailable', 'Setup information is unavailable.'))}</strong><p>${escapeHtml(t('setup_unavailable_hint', 'Open Specter again or refresh the page.'))}</p></div></div>`;
    return;
  }

  appendInfoSection(host, t('setup_device_section', 'Device'), deviceRows(data));

  for (const module of data.modules ?? []) {
    appendModuleSection(host, module);
  }

  if ((data.features ?? []).length > 0) {
    appendInfoSection(
      host,
      t('setup_features_section', 'Specter features'),
      (data.features ?? []).map((feature) => ({
        label: feature.label,
        value: dash(feature.value),
      })),
    );
  }

  if ((data.warnings ?? []).length > 0) {
    appendInfoSection(
      host,
      t('setup_warnings_section', 'Warnings'),
      (data.warnings ?? []).map((warning, index) => ({
        label: `${t('setup_warning', 'Warning')} ${index + 1}`,
        value: warning,
        tone: 'error' as const,
      })),
    );
  }

  if (data.generated_at) {
    host.insertAdjacentHTML(
      'beforeend',
      `<p class="subpage-top-desc setup-generated">${escapeHtml(t('setup_generated', 'Generated'))}: ${escapeHtml(formatDate(data.generated_at))}</p>`,
    );
  }
}

async function loadSetupInfo(): Promise<SetupInfoJson | null> {
  try {
    await runScript('setup_info.sh', 'feature');
  } catch (err) {
    console.warn('Setup info script failed:', err);
  }
  return fetchJson<SetupInfoJson>('./json/setup_info.json');
}

export async function openSetupPage(): Promise<void> {
  // The page opens on skeleton rows; once it has painted, the last
  // snapshot is fetched and rendered. The shell probe only runs when
  // there is no snapshot to show.
  let latest: SetupInfoJson | null = null;
  let loading = true;
  let hostEl: HTMLElement | null = null;

  const render = () => {
    if (hostEl) buildPage(hostEl, latest, loading);
  };

  const refresh = async () => {
    if (!latest) {
      loading = true;
      render();
    }
    const button = document.getElementById('setup-info-refresh') as HTMLElement | null;
    if (button) button.setAttribute('disabled', '');
    try {
      const next = await loadSetupInfo();
      if (next) latest = next;
    } finally {
      loading = false;
      render();
      if (button) button.removeAttribute('disabled');
    }
  };

  await openSubPage({
    id: 'setup-info',
    title: t('setup_title', 'Setup'),
    description: t('setup_desc', 'Device, keystore backend, installed modules, and Specter feature configuration.'),
    headerAction: (container) => {
      const button = document.createElement('md-icon-button');
      button.id = 'setup-info-refresh';
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
          host.className = 'setup-info-page';
          render();
        },
      }],
    }],
  });

  // First let the opened page and its skeleton paint, then fetch.
  await new Promise<void>(resolve => afterPaint(resolve, 300));

  latest = await fetchJson<SetupInfoJson>('./json/setup_info.json');
  loading = false;
  render();

  // The daemon rebuilds the snapshot when inputs change. Only run the
  // probe here when there is no cached snapshot to show.
  if (!latest) void refresh();
}
