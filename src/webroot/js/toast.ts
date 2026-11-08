import './ui/sp-snackbar.js';
import type { SpSnackbar } from './ui/sp-snackbar.js';
import { getTranslation } from './i18n.js';

export interface ToastOptions {
  action?: string;
  icon?: string;
  type?: 'success' | 'error' | 'info' | 'warning' | 'loading';
  /**
   * Auto-dismiss delay in ms; 0 keeps the toast until dismissed. Defaults
   * follow SnackbarHostState: 4000 (SnackbarDuration.Short) when there is
   * no action, indefinite when there is one.
   */
  autoCloseDelay?: number;
  onActionClick?: () => void;
  dismissible?: boolean;
}

/** How a snackbar ended — mirrors androidx.compose.material3.SnackbarResult. */
export type SnackbarResult = 'action' | 'dismissed';

type SnackbarEl = SpSnackbar & HTMLElement;

interface ToastEntry {
  bar: SnackbarEl;
  message: string;
  opts: ToastOptions;
  timer: ReturnType<typeof setTimeout> | null;
  result: Promise<SnackbarResult>;
  settle: (result: SnackbarResult) => void;
}

const TOAST_TYPES = ['success', 'error', 'info', 'warning', 'loading'] as const;

/**
 * A port of androidx.compose.material3's SnackbarHostState — the snackbar
 * system from Google's actively maintained Kotlin library, since
 * @material/web is in maintenance mode and never shipped one. Semantics
 * copied from the Kotlin source: a fair FIFO queue shows one snackbar at
 * a time; each request suspends (here: its result promise stays pending)
 * until its snackbar is addressed; durations are SnackbarDuration.Short
 * (4000 ms) by default, Indefinite when the snackbar has an action;
 * dismissing a queued or visible snackbar (closeToast) is the caller's
 * cancellation and resolves it 'dismissed'. The component's own timeout
 * stays disabled (timeout = -1): the host owns all timing so a toast can
 * morph in place (loading -> result) without re-arming surprises. Not
 * portable from Kotlin: accessibility-manager timeout scaling (no web
 * equivalent) — and Specter's typed statuses (success/error/loading,
 * icons, tints) are a presentation layer on top, not part of Google's
 * snackbar on any platform.
 */
let current: ToastEntry | null = null;
const queue: ToastEntry[] = [];

/** The host's duration rule, from SnackbarHostState.showSnackbar. */
function defaultDelay(opts: ToastOptions): number {
  return opts.autoCloseDelay ?? (opts.action ? 0 : 4000);
}

function buildLeading(opts: ToastOptions): HTMLElement | null {
  if (opts.type !== 'loading' && !opts.icon) return null;
  const wrap = document.createElement('span');
  wrap.className = 'sp-snackbar__leading';
  wrap.setAttribute('aria-hidden', 'true');
  if (opts.type === 'loading') {
    const spinner = document.createElement('md-circular-progress');
    spinner.setAttribute('indeterminate', '');
    wrap.appendChild(spinner);
  } else if (opts.icon) {
    const icon = document.createElement('md-icon');
    icon.textContent = opts.icon;
    wrap.appendChild(icon);
  }
  return wrap;
}

function renderContent(entry: ToastEntry): void {
  const { bar, opts } = entry;
  const children: Node[] = [];
  const leading = buildLeading(opts);
  if (leading) children.push(leading);
  children.push(document.createTextNode(entry.message));
  if (opts.dismissible !== false && opts.type !== 'loading') {
    const closeBtn = document.createElement('md-icon-button');
    closeBtn.setAttribute('slot', 'icon');
    closeBtn.setAttribute('aria-label', getTranslation('dialog_close') || 'Close');
    const closeIcon = document.createElement('md-icon');
    closeIcon.textContent = 'close';
    closeBtn.appendChild(closeIcon);
    // The component also closes on icon-slot clicks; wiring our own
    // listener keeps dismissal deterministic (dismissEntry is idempotent).
    closeBtn.addEventListener('click', () => dismissEntry(entry));
    children.push(closeBtn);
  }
  bar.replaceChildren(...children);
  bar.actionText = opts.action ?? '';
  bar.twoLines = entry.message.length > 42;
}

function applyType(entry: ToastEntry): void {
  const { bar, opts } = entry;
  for (const t of TOAST_TYPES) bar.classList.remove(`sp-snackbar--${t}`);
  if (opts.type) bar.classList.add(`sp-snackbar--${opts.type}`);
  const isError = opts.type === 'error';
  bar.setAttribute('role', isError ? 'alert' : 'status');
  bar.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  bar.setAttribute('aria-atomic', 'true');
}

function armTimer(entry: ToastEntry): void {
  if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
  const delay = defaultDelay(entry.opts);
  if (delay > 0) entry.timer = setTimeout(() => dismissEntry(entry), delay);
}

function activate(entry: ToastEntry): void {
  current = entry;
  entry.bar.show();
  // SnackbarHost presents with a fade + scale (FadeInFadeOutWithScale);
  // the --in class drives that motion at the presentation layer (app.css).
  entry.bar.classList.add('sp-snackbar--in');
  armTimer(entry);
}

function showNext(): void {
  const next = queue.shift();
  if (next) activate(next);
}

function dismissEntry(entry: ToastEntry): void {
  if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
  entry.settle('dismissed');
  const qi = queue.indexOf(entry);
  if (qi >= 0) {
    queue.splice(qi, 1);
    entry.bar.remove();
    return;
  }
  if (current === entry) {
    entry.bar.classList.remove('sp-snackbar--in');
    // The component fires 'closed' after its exit transition; the listener
    // registered in createToast removes the element and advances the queue.
    entry.bar.close();
  }
}

function findEntry(toast: HTMLElement): ToastEntry | null {
  if (current && current.bar === toast) return current;
  return queue.find(e => e.bar === toast) ?? null;
}

function createToast(message: string, options: ToastOptions): ToastEntry {
  const bar = document.createElement('sp-snackbar') as SnackbarEl;
  bar.classList.add('sp-snackbar');
  bar.timeout = -1;
  let settleFn: (result: SnackbarResult) => void = () => {};
  const result = new Promise<SnackbarResult>(resolve => { settleFn = resolve; });
  let settled = false;
  const entry: ToastEntry = {
    bar,
    message,
    opts: { ...options },
    timer: null,
    result,
    settle: (r) => { if (!settled) { settled = true; settleFn(r); } },
  };
  applyType(entry);
  renderContent(entry);
  bar.addEventListener('action', () => {
    entry.settle('action');
    entry.opts.onActionClick?.();
    dismissEntry(entry);
  });
  bar.addEventListener('closed', () => {
    bar.remove();
    if (current === entry) {
      current = null;
      showNext();
    }
  });
  document.body.appendChild(bar);
  if (current) queue.push(entry);
  else activate(entry);
  return entry;
}

export function showToast(message: string, options: ToastOptions = {}): HTMLElement {
  return createToast(message, options).bar;
}

/**
 * The SnackbarHostState.showSnackbar port: queues the snackbar and
 * returns a promise that resolves 'action' if its action was performed,
 * or 'dismissed' when it times out, is dismissed, or is cancelled via
 * closeToast before its turn.
 */
export function showSnackbar(message: string, options: ToastOptions = {}): Promise<SnackbarResult> {
  return createToast(message, options).result;
}

/**
 * A persistent loading toast that owns an async operation's feedback
 * lifecycle: show it when the work starts, then morph it in place with
 * updateToast() when the work settles — no modal, no second toast.
 */
export function showLoadingToast(message: string): HTMLElement {
  return showToast(message, { type: 'loading', autoCloseDelay: 0, dismissible: false });
}

/** Morph an existing toast (e.g. a loading toast) into its result state. */
export function updateToast(toast: HTMLElement, message: string, options: ToastOptions = {}) {
  const entry = findEntry(toast);
  if (!entry) return;
  entry.message = message;
  // A morph is a fresh result state: the loading toast's persistence,
  // action and icon do not carry over unless the caller sets them again.
  entry.opts = {
    ...entry.opts,
    dismissible: true,
    action: undefined,
    onActionClick: undefined,
    icon: undefined,
    ...options,
  };
  // A settled toast gets a fresh window under the host's duration rule
  // (Short, or indefinite when it carries an action) unless told otherwise.
  entry.opts.autoCloseDelay = options.autoCloseDelay ?? (entry.opts.action ? 0 : 4000);
  applyType(entry);
  renderContent(entry);
  if (current === entry) armTimer(entry);
}

export function closeToast(toast: HTMLElement) {
  const entry = findEntry(toast);
  if (entry) {
    dismissEntry(entry);
    return;
  }
  const bar = toast as SnackbarEl;
  if (typeof bar.close === 'function') bar.close();
  setTimeout(() => toast.remove(), 250);
}
