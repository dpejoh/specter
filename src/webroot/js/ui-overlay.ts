import { escapeHtml } from './utils.js';

export interface OverlayBackOptions {
  id: string;
  className: string;
  label: string;
  icon?: string;
}

export interface OverlayHeaderOptions {
  className: string;
  back: OverlayBackOptions;
  title: string;
  titleHtml?: string;
  titleTag?: 'h1' | 'h2';
  titleClass: string;
  titleId: string;
  actions?: string;
}

export function overlayBackButton(options: OverlayBackOptions): string {
  return `<button type="button" class="${escapeHtml(options.className)}" id="${escapeHtml(options.id)}" aria-label="${escapeHtml(options.label)}">
  <md-icon aria-hidden="true">${options.icon || 'arrow_back'}</md-icon>
  <md-ripple></md-ripple>
</button>`;
}

/** Shared overlay header: back control, labelled title, and an actions slot. */
export function overlayHeader(options: OverlayHeaderOptions): string {
  const titleTag = options.titleTag || 'h1';
  const title = options.titleHtml ?? escapeHtml(options.title);
  return `<header class="${escapeHtml(options.className)}">
  ${overlayBackButton(options.back)}
  <${titleTag} class="${escapeHtml(options.titleClass)}" id="${escapeHtml(options.titleId)}">${title}</${titleTag}>
  ${options.actions || ''}
</header>`;
}
