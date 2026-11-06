import { escapeHtml } from './utils.js';

export interface RowContentOptions {
  title: string;
  description?: string;
  titleHtml?: string;
  descriptionHtml?: string;
  titleId?: string;
  titleClass?: string;
  descriptionId?: string;
  descriptionClass?: string;
}

export interface RowShellOptions {
  tag?: 'div' | 'button';
  id?: string;
  className?: string;
  leading?: string;
  content?: string;
  trailing?: string;
  spinner?: boolean;
  ripple?: boolean;
  role?: string;
  tabindex?: string;
  attributes?: Record<string, string | undefined>;
}

/** Leading round icon block used by Specter list rows. */
export function rowIcon(icon: string, toneClass = ''): string {
  return `<div class="li-icon${toneClass ? ` ${toneClass}` : ''}"><md-icon aria-hidden="true">${icon}</md-icon></div>`;
}

/** Title + supporting-text block used by Specter list rows. */
export function rowContent(options: RowContentOptions): string {
  const title = options.titleHtml ?? escapeHtml(options.title);
  const description = options.descriptionHtml ?? escapeHtml(options.description ?? '');
  return `<div class="list-item-content">
  <div class="toggle-text${options.titleClass ? ` ${options.titleClass}` : ''}"${options.titleId ? ` id="${escapeHtml(options.titleId)}"` : ''}>${title}</div>
  ${options.description ? `<span class="supporting-text${options.descriptionClass ? ` ${options.descriptionClass}` : ''}"${options.descriptionId ? ` id="${escapeHtml(options.descriptionId)}"` : ''}>${description}</span>` : ''}
</div>`;
}

export function rowSpacer(): string {
  return '<div class="spacer"></div>';
}

export function rowRipple(): string {
  return '<md-ripple></md-ripple>';
}

export function rowSpinner(): string {
  return '<md-circular-progress indeterminate class="action-spinner hidden"></md-circular-progress>';
}

/**
 * Shared outer shell for list rows. Callers provide their own leading/content/
 * trailing HTML when the row is more than the standard icon + text pattern.
 */
export function rowShell(options: RowShellOptions): string {
  const tag = options.tag || 'div';
  const attrs: string[] = [];
  const add = (name: string, value: string | undefined) => {
    if (value !== undefined && value !== '') attrs.push(`${name}="${escapeHtml(value)}"`);
  };
  add('id', options.id);
  add('class', `list-item${options.className ? ` ${options.className}` : ''}`);
  if (tag === 'button') attrs.push('type="button"');
  if (options.role) add('role', options.role);
  if (options.tabindex) add('tabindex', options.tabindex);
  for (const [name, value] of Object.entries(options.attributes || {})) add(name, value);

  const body = [
    options.leading || '',
    options.content || '',
    options.trailing || '',
    options.spinner ? rowSpinner() : '',
    options.ripple === false ? '' : rowRipple(),
  ].filter(Boolean).join('\n');

  return `<${tag} ${attrs.join(' ')}>\n${body}\n</${tag}>`;
}

export interface RowOptions {
  tag?: 'div' | 'button';
  id?: string;
  className?: string;
  icon: string;
  iconTone?: string;
  title: string;
  description?: string;
  titleHtml?: string;
  descriptionHtml?: string;
  titleId?: string;
  titleClass?: string;
  descriptionId?: string;
  descriptionClass?: string;
  trailing?: string;
  spinner?: boolean;
  ripple?: boolean;
  role?: string;
  tabindex?: string;
  attributes?: Record<string, string | undefined>;
}

/** Standard icon + title + description row. */
export function row(options: RowOptions): string {
  return rowShell({
    tag: options.tag,
    id: options.id,
    className: options.className,
    leading: rowIcon(options.icon, options.iconTone),
    content: rowContent({
      title: options.title,
      description: options.description,
      titleHtml: options.titleHtml,
      descriptionHtml: options.descriptionHtml,
      titleId: options.titleId,
      titleClass: options.titleClass,
      descriptionId: options.descriptionId,
      descriptionClass: options.descriptionClass,
    }),
    trailing: options.trailing,
    spinner: options.spinner,
    ripple: options.ripple,
    role: options.role,
    tabindex: options.tabindex,
    attributes: options.attributes,
  });
}
