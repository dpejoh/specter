import { t } from './i18n.js';
import { escapeHtml } from './utils.js';
import { rowContent, rowShell } from './ui-row.js';

export interface ValueSpec {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'default' | 'error' | 'warning';
  copy?: boolean;
}

export function dash(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return text || '—';
}

export function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatSize(value: number | undefined): string {
  if (!value || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function copyButton(value: string, label: string): string {
  return `<button type="button" class="value-copy-btn" data-copy="${escapeHtml(value)}" aria-label="${escapeHtml(`${t('common_copy', 'Copy')} ${label}`)}">
    <md-icon aria-hidden="true">content_copy</md-icon>
  </button>`;
}

export function valueRow(spec: ValueSpec, posClass: string): string {
  const toneClass = spec.tone && spec.tone !== 'default' ? ` value-text--${spec.tone}` : '';
  return rowShell({
    className: `list-item--value ${posClass}`,
    content: rowContent({
      title: spec.label,
      description: spec.value,
      descriptionClass: `value-text${spec.mono ? ' value-text--mono' : ''}${toneClass}`,
    }),
    trailing: spec.copy && spec.value !== '—' ? copyButton(spec.value, spec.label) : '',
    ripple: false,
  });
}

export function infoGroup(title: string, rows: ValueSpec[]): string {
  const body = rows.map((row, index) => {
    const posClass = rows.length === 1
      ? 'list-item--only'
      : index === 0
        ? 'list-item--first'
        : index === rows.length - 1
          ? 'list-item--last'
          : 'list-item--middle';
    return valueRow(row, posClass);
  }).join('');
  return `<h2 class="list-title">${escapeHtml(title)}</h2><div class="list-container">${body}</div>`;
}

/** Wire copy controls created by valueRow. */
export function wireCopyButtons(host: HTMLElement): void {
  host.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.dataset.copy;
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        const icon = button.querySelector('md-icon');
        if (icon) {
          const previous = icon.textContent;
          icon.textContent = 'check';
          window.setTimeout(() => { icon.textContent = previous || 'content_copy'; }, 1500);
        }
      } catch {
        /* clipboard may be unavailable */
      }
    });
  });
}
