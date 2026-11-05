import { escapeHtml } from './utils.js';
import { getTranslation } from './i18n.js';

function toastRegion(): HTMLElement {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    document.body.appendChild(region);
  }
  return region;
}

export function showToast(message: string, options: { action?: string; icon?: string; type?: 'success' | 'error' | 'info' | 'warning'; autoCloseDelay?: number; onActionClick?: () => void } = {}) {
  const { action, icon, type, autoCloseDelay = 3000, onActionClick } = options;

  const toast = document.createElement('div');
  toast.className = 'md-toast' + (type ? ' md-toast--' + type : '');
  const isError = type === 'error';
  toast.setAttribute('role', isError ? 'alert' : 'status');
  toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  toast.setAttribute('aria-atomic', 'true');
  toast.innerHTML = `
    ${icon ? `<md-icon class="md-toast__icon" aria-hidden="true">${icon}</md-icon>` : ''}
    <span class="md-toast__message">${escapeHtml(message)}</span>
    <div class="md-toast__actions">
      ${action ? `<button class="md-toast__action">${escapeHtml(action)}</button>` : ''}
      <button class="md-toast__close" aria-label="${escapeHtml(getTranslation('dialog_close') || 'Close')}"><md-icon aria-hidden="true">close</md-icon></button>
    </div>`;

  toastRegion().appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('md-toast--open'));

  toast.querySelector('.md-toast__close')?.addEventListener('click', () => close(toast));
  if (action && onActionClick) {
    toast.querySelector('.md-toast__action')?.addEventListener('click', () => { close(toast); onActionClick(); });
  }

  if (autoCloseDelay > 0) setTimeout(() => close(toast), autoCloseDelay);
  return toast;
}

function close(toast: HTMLElement) {
  if (toast.dataset.closing) return;
  toast.dataset.closing = 'true';
  toast.classList.remove('md-toast--open');
  const cleanup = () => toast.parentNode?.removeChild(toast);
  toast.addEventListener('transitionend', cleanup, { once: true });
  setTimeout(cleanup, 300);
}

export function closeToast(toast: HTMLElement) { close(toast); }
