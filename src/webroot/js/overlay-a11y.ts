const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const backgroundNodes = () => document.querySelectorAll<HTMLElement>('.app-top-bar, #pages, .nav-bar');
let openOverlays = 0;

function setBackgroundInert(inert: boolean) {
  backgroundNodes().forEach(el => {
    if (inert) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  });
}

function focusable(overlay: HTMLElement): HTMLElement[] {
  return Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(el => !el.hasAttribute('inert') && el.offsetParent !== null);
}

function trapFocus(event: KeyboardEvent, overlay: HTMLElement) {
  const items = focusable(overlay);
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export interface OverlayA11yOptions {
  titleId?: string;
  onClose: () => void;
  initialFocus?: HTMLElement | null;
}

/**
 * Give a full-screen overlay dialog semantics, background inertness, a focus
 * trap, Escape handling, and focus restoration. Returns a cleanup function
 * that must run from the overlay's close path.
 */
export function setupOverlayA11y(overlay: HTMLElement, options: OverlayA11yOptions): () => void {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  if (options.titleId && document.getElementById(options.titleId)) {
    overlay.setAttribute('aria-labelledby', options.titleId);
  }

  openOverlays += 1;
  setBackgroundInert(true);

  const target = options.initialFocus || focusable(overlay)[0] || overlay;
  if (!target.hasAttribute('tabindex') && target === overlay) target.tabIndex = -1;
  requestAnimationFrame(() => { if (overlay.isConnected) target.focus(); });

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      options.onClose();
      return;
    }
    if (event.key === 'Tab') trapFocus(event, overlay);
  };
  overlay.addEventListener('keydown', onKeydown);

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    overlay.removeEventListener('keydown', onKeydown);
    openOverlays = Math.max(0, openOverlays - 1);
    if (openOverlays === 0) setBackgroundInert(false);
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  };
}
