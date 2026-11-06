import { openSubPage } from './subpage.js';
import { t } from './i18n.js';
import { escapeHtml, fetchJson } from './utils.js';
import { runScript } from './bridge.js';
import { dash, formatDate, infoGroup, type ValueSpec } from './info-page.js';
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

function moduleGroup(module: SetupInfoModule): string {
  const title = module.version
    ? `${module.name} · ${module.version}`
    : module.name;
  const rows = [...module.rows];
  return infoGroup(title, rows.map((row) => ({
    label: row.label,
    value: dash(row.value),
  })));
}

function buildPage(data: SetupInfoJson | null, loading: boolean): string {
  if (loading) {
    return `<div class="subpage-info-note"><md-circular-progress indeterminate></md-circular-progress><div><strong>${escapeHtml(t('setup_loading', 'Collecting configuration...'))}</strong></div></div>`;
  }
  if (!data) {
    return `<div class="subpage-info-note"><md-icon aria-hidden="true">error</md-icon><div><strong>${escapeHtml(t('setup_unavailable', 'Setup information is unavailable.'))}</strong><p>${escapeHtml(t('setup_unavailable_hint', 'Open Specter again or refresh the page.'))}</p></div></div>`;
  }

  const sections: string[] = [];
  sections.push(infoGroup(t('setup_device_section', 'Device'), deviceRows(data)));

  for (const module of data.modules ?? []) {
    sections.push(moduleGroup(module));
  }

  if ((data.features ?? []).length > 0) {
    sections.push(infoGroup(
      t('setup_features_section', 'Specter features'),
      (data.features ?? []).map((feature) => ({
        label: feature.label,
        value: dash(feature.value),
      })),
    ));
  }

  if ((data.warnings ?? []).length > 0) {
    sections.push(infoGroup(
      t('setup_warnings_section', 'Warnings'),
      (data.warnings ?? []).map((warning, index) => ({
        label: `${t('setup_warning', 'Warning')} ${index + 1}`,
        value: warning,
        tone: 'error' as const,
      })),
    ));
  }

  if (data.generated_at) {
    sections.push(`<p class="subpage-top-desc setup-generated">${escapeHtml(t('setup_generated', 'Generated'))}: ${escapeHtml(formatDate(data.generated_at))}</p>`);
  }

  return sections.join('');
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
  // Show the last snapshot immediately, then refresh from shell in the
  // background. This keeps page open time independent of shell startup.
  let latest = await fetchJson<SetupInfoJson>('./json/setup_info.json');
  let loading = !latest;
  let hostEl: HTMLElement | null = null;

  const render = () => {
    if (hostEl) hostEl.innerHTML = buildPage(latest, loading);
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
          // The daemon rebuilds the snapshot when inputs change. Only run the
          // probe here when there is no cached snapshot to show.
          if (!latest) void refresh();
        },
      }],
    }],
  });
}
