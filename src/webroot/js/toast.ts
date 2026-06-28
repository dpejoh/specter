import { escapeHtml } from './utils.js';

export function showToast(message: string, options: { action?: string; icon?: string; type?: 'success' | 'error' | 'info' | 'warning'; autoCloseDelay?: number; onActionClick?: () => void } = {}) {
  const { action, icon, type, autoCloseDelay = 3000, onActionClick } = options;

  const toast = document.createElement('div');
  toast.className = 'md-toast' + (type ? ' md-toast--' + type : '');
  toast.innerHTML = `
    ${icon ? `<md-icon class="md-toast__icon">${icon}</md-icon>` : ''}
    <span class="md-toast__message">${escapeHtml(message)}</span>
    <div class="md-toast__actions">
      ${action ? `<button class="md-toast__action">${action}</button>` : ''}
      <button class="md-toast__close" aria-label="Close"><md-icon>close</md-icon></button>
    </div>`;

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('md-toast--open'));

  toast.querySelector('.md-toast__close')?.addEventListener('click', () => close(toast));
  if (action && onActionClick) {
    toast.querySelector('.md-toast__action')?.addEventListener('click', () => { close(toast); onActionClick(); });
  }

  if (autoCloseDelay > 0) setTimeout(() => close(toast), autoCloseDelay);
  return toast;
}

function close(toast: HTMLElement) {
  toast.classList.remove('md-toast--open');
  toast.addEventListener('transitionend', () => toast.parentNode?.removeChild(toast), { once: true });
  setTimeout(() => toast.parentNode?.removeChild(toast), 300);
}

export function closeToast(toast: HTMLElement) { close(toast); }
