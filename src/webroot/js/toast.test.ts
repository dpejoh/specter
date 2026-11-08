import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { showToast, closeToast, showLoadingToast, updateToast, showSnackbar } from './toast.js'

// One fake clock for the whole file: re-installing fake timers between
// tests would discard the pending close timers the queue drain relies on.
beforeAll(() => {
  vi.useFakeTimers()
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  // Toasts live in module state (one visible + a queue). A snackbar with
  // an action is indefinite by design, so timers alone cannot drain the
  // host: close whatever is on screen (the queue advances as each one
  // closes), run the clock out, then clear the DOM.
  for (let i = 0; i < 10; i++) {
    const el = document.querySelector('sp-snackbar') as HTMLElement | null
    if (!el) break
    closeToast(el)
    vi.advanceTimersByTime(300)
  }
  vi.advanceTimersByTime(120_000)
  document.body.innerHTML = ''
})

function shadowAction(toast: HTMLElement): HTMLElement | null {
  return (toast as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
    ?.querySelector('.md-snackbar__action') ?? null
}

describe('showToast', () => {
  it('creates a native sp-snackbar element and appends to body', () => {
    const toast = showToast('Hello world')
    expect(toast.tagName).toBe('SP-SNACKBAR')
    expect(document.body.contains(toast)).toBe(true)
  })

  it('displays the message text', () => {
    const toast = showToast('Test message')
    expect(toast.textContent).toContain('Test message')
  })

  it('adds type class when type is provided', () => {
    const toast = showToast('Error!', { type: 'error' })
    expect(toast.classList.contains('sp-snackbar--error')).toBe(true)
  })

  it('adds a leading icon when provided', () => {
    const toast = showToast('With icon', { icon: 'check' })
    const leading = toast.querySelector('.sp-snackbar__leading md-icon')
    expect(leading).not.toBeNull()
    expect(leading!.textContent).toBe('check')
  })

  it('sets the snackbar action text when action provided', async () => {
    const toast = showToast('Action!', { action: 'Undo' })
    expect((toast as unknown as { actionText: string }).actionText).toBe('Undo')
    await (toast as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(shadowAction(toast as HTMLElement)).not.toBeNull()
  })

  it('calls onActionClick when the action fires', () => {
    const onClick = vi.fn()
    const toast = showToast('Action!', { action: 'Undo', onActionClick: onClick })
    toast.dispatchEvent(new CustomEvent('action'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('auto-closes after autoCloseDelay', () => {
    showToast('Auto close', { autoCloseDelay: 1000 })
    expect(document.querySelector('sp-snackbar')).not.toBeNull()
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(300)
    expect(document.querySelector('sp-snackbar')).toBeNull()
  })

  it('does not auto-close when autoCloseDelay is 0', () => {
    const toast = showToast('Sticky', { autoCloseDelay: 0 })
    vi.advanceTimersByTime(10000)
    expect(document.querySelector('sp-snackbar')).not.toBeNull()
    closeToast(toast)
    vi.advanceTimersByTime(300)
  })

  it('closeToast removes the toast', () => {
    const toast = showToast('Close me')
    closeToast(toast)
    vi.advanceTimersByTime(300)
    expect(document.body.contains(toast)).toBe(false)
  })

  it('has a close icon button that removes the toast', () => {
    showToast('Dismiss me')
    const closeBtn = document.querySelector('md-icon-button[slot="icon"]') as HTMLElement
    expect(closeBtn).not.toBeNull()
    closeBtn.click()
    vi.advanceTimersByTime(300)
    expect(document.querySelector('sp-snackbar')).toBeNull()
  })

  it('queues further toasts instead of stacking them (one at a time)', async () => {
    const first = showToast('First', { autoCloseDelay: 1000 })
    const second = showToast('Second', { autoCloseDelay: 1000 })
    expect(document.querySelectorAll('sp-snackbar').length).toBe(2)
    await (first as unknown as { updateComplete: Promise<unknown> }).updateComplete
    expect(first.hasAttribute('open')).toBe(true)
    expect(second.hasAttribute('open')).toBe(false)
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(300)
    expect(document.body.contains(first)).toBe(false)
    expect((second as unknown as { open: boolean }).open).toBe(true)
  })
})

describe('loading toast lifecycle', () => {
  it('loading toast persists with a spinner and no close button', () => {
    const toast = showLoadingToast('Installing keybox…')
    expect(toast.classList.contains('sp-snackbar--loading')).toBe(true)
    expect(toast.querySelector('md-icon-button[slot="icon"]')).toBeNull()
    expect(toast.querySelector('md-circular-progress')).not.toBeNull()
    expect(toast.textContent).toContain('Installing keybox…')
    vi.advanceTimersByTime(60000)
    expect(document.body.contains(toast)).toBe(true)
    closeToast(toast)
    vi.advanceTimersByTime(300)
  })

  it('updateToast morphs a loading toast into its result state', () => {
    const toast = showLoadingToast('Installing keybox…')
    updateToast(toast, 'Keybox installed', { type: 'success', icon: 'check_circle', autoCloseDelay: 3000 })
    expect(toast.classList.contains('sp-snackbar--loading')).toBe(false)
    expect(toast.classList.contains('sp-snackbar--success')).toBe(true)
    expect(toast.textContent).toContain('Keybox installed')
    expect(toast.querySelector('md-circular-progress')).toBeNull()
    expect(toast.querySelector('md-icon-button[slot="icon"]')).not.toBeNull()
    vi.advanceTimersByTime(3000)
    vi.advanceTimersByTime(300)
    expect(document.body.contains(toast)).toBe(false)
  })

  it('updateToast can morph into an error with an action', () => {
    const onActionClick = vi.fn()
    const toast = showLoadingToast('Installing keybox…')
    updateToast(toast, 'Failed: download failed', {
      type: 'error', icon: 'error', action: 'View Details', autoCloseDelay: 8000, onActionClick,
    })
    expect(toast.classList.contains('sp-snackbar--error')).toBe(true)
    expect(toast.getAttribute('role')).toBe('alert')
    expect((toast as unknown as { actionText: string }).actionText).toBe('View Details')
    toast.dispatchEvent(new CustomEvent('action'))
    expect(onActionClick).toHaveBeenCalledOnce()
  })
})

describe('snackbar host (SnackbarHostState port)', () => {
  it('defaults to SnackbarDuration.Short (4000ms) without an action', () => {
    showToast('Plain message')
    vi.advanceTimersByTime(3999)
    expect(document.querySelector('sp-snackbar')).not.toBeNull()
    vi.advanceTimersByTime(1)
    vi.advanceTimersByTime(300)
    expect(document.querySelector('sp-snackbar')).toBeNull()
  })

  it('defaults to Indefinite when the snackbar has an action', () => {
    showToast('Archived', { action: 'Undo' })
    vi.advanceTimersByTime(60000)
    expect(document.querySelector('sp-snackbar')).not.toBeNull()
    const toast = document.querySelector('sp-snackbar') as HTMLElement
    closeToast(toast)
    vi.advanceTimersByTime(300)
  })

  it('showSnackbar resolves dismissed when its duration elapses', async () => {
    const result = showSnackbar('Saved')
    vi.advanceTimersByTime(4000)
    vi.advanceTimersByTime(300)
    await expect(result).resolves.toBe('dismissed')
  })

  it('showSnackbar resolves action when the action is performed', async () => {
    const result = showSnackbar('Archived', { action: 'Undo' })
    const toast = document.querySelector('sp-snackbar') as HTMLElement
    toast.dispatchEvent(new CustomEvent('action'))
    await expect(result).resolves.toBe('action')
    vi.advanceTimersByTime(300)
  })

  it('queued showSnackbar calls resolve in FIFO order, one at a time', async () => {
    const order: string[] = []
    const first = showSnackbar('First').then(r => { order.push(`first:${r}`) })
    const second = showSnackbar('Second').then(r => { order.push(`second:${r}`) })
    vi.advanceTimersByTime(4000)
    vi.advanceTimersByTime(300)
    await first
    expect(order).toEqual(['first:dismissed'])
    vi.advanceTimersByTime(4000)
    vi.advanceTimersByTime(300)
    await second
    expect(order).toEqual(['first:dismissed', 'second:dismissed'])
  })

  it('cancelling a queued snackbar resolves it dismissed without showing it', async () => {
    showToast('Blocking', { autoCloseDelay: 0 })
    const result = showSnackbar('Queued')
    const queued = Array.from(document.querySelectorAll('sp-snackbar'))
      .find(el => el.textContent?.includes('Queued')) as HTMLElement
    closeToast(queued)
    await expect(result).resolves.toBe('dismissed')
    expect(document.body.contains(queued)).toBe(false)
    const blocker = document.querySelector('sp-snackbar') as HTMLElement
    closeToast(blocker)
    vi.advanceTimersByTime(300)
  })
})
