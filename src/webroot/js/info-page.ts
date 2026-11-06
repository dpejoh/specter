import './ui/sp-settings-row.js';
import './ui/sp-settings-section.js';
import { t } from './i18n.js';

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

/** Append a read-only section using the shared settings components. */
export function appendInfoSection(host: HTMLElement, title: string, rows: ValueSpec[]): void {
  const section = document.createElement('sp-settings-section');
  section.setAttribute('label', title);

  for (const spec of rows) {
    const row = document.createElement('sp-settings-row');
    row.setAttribute('variant', 'value');
    row.setAttribute('headline', spec.label);
    row.setAttribute('supporting-text', spec.value);
    if (spec.mono) row.setAttribute('mono', '');
    if (spec.tone && spec.tone !== 'default') {
      row.classList.add(`sp-info-value--${spec.tone}`);
    }
    if (spec.copy && spec.value && spec.value !== '—') {
      row.setAttribute('copyable', '');
      row.setAttribute('copy-label', `${t('common_copy', 'Copy')} ${spec.label}`);
      row.setAttribute('value', spec.value);
    }
    section.append(row);
  }

  host.append(section);
}
