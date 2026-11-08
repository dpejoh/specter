import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { showToast, closeToast } from './toast.js'

// One fake clock for the whole file (see toast.test.ts).
beforeAll(() => {
  vi.useFakeTimers()
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  // Drain the snackbar host (see toast.test.ts): action snackbars are
  // indefinite, so close what is on screen instead of relying on timers.
  for (let i = 0; i < 10; i++) {
    const el = document.querySelector('sp-snackbar') as HTMLElement | null
    if (!el) break
    closeToast(el)
    vi.advanceTimersByTime(300)
  }
  vi.advanceTimersByTime(120_000)
  document.body.innerHTML = ''
})

describe('toast accessibility', () => {
  it('has a close icon button with accessible aria-label', () => {
    showToast('Message')
    const closeBtn = document.querySelector('md-icon-button[slot="icon"]')
    expect(closeBtn).not.toBeNull()
    expect(closeBtn!.getAttribute('aria-label')).toBeTruthy()
    expect(closeBtn!.getAttribute('aria-label')!.length).toBeGreaterThan(0)
  })

  it('close control is a native Material icon button (keyboard accessible)', () => {
    showToast('Message')
    const closeBtn = document.querySelector('md-icon-button[slot="icon"]')
    expect(closeBtn!.tagName).toBe('MD-ICON-BUTTON')
  })

  it('action is rendered by the snackbar as an md-text-button', async () => {
    const toast = showToast('Message', { action: 'Undo' })
    await (toast as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const actionBtn = (toast as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
      ?.querySelector('.md-snackbar__action')
    expect(actionBtn).toBeTruthy()
    expect(actionBtn!.tagName).toBe('MD-TEXT-BUTTON')
  })

  it('icon uses md-icon element for accessible icon rendering', () => {
    showToast('With icon', { icon: 'check_circle' })
    const icon = document.querySelector('.sp-snackbar__leading md-icon')
    expect(icon).not.toBeNull()
    expect(icon!.tagName).toBe('MD-ICON')
  })

  it('announces success messages politely as a status', () => {
    const toast = showToast('Message')
    expect(toast.getAttribute('role')).toBe('status')
    expect(toast.getAttribute('aria-live')).toBe('polite')
  })

  it('announces errors assertively as an alert', () => {
    const toast = showToast('Failed', { type: 'error' })
    expect(toast.getAttribute('role')).toBe('alert')
    expect(toast.getAttribute('aria-live')).toBe('assertive')
  })

  it('shows one snackbar at a time and queues the rest without id conflicts', async () => {
    const first = showToast('First')
    showToast('Second')
    showToast('Third')
    await (first as unknown as { updateComplete: Promise<unknown> }).updateComplete
    const toasts = document.querySelectorAll('sp-snackbar')
    expect(toasts.length).toBe(3)
    const open = Array.from(toasts).filter(t => t.hasAttribute('open'))
    expect(open.length).toBe(1)
    const ids = Array.from(toasts).map(t => t.id).filter(Boolean)
    expect(ids.length).toBe(0)
  })
})
