import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { SpSnackbar } from './sp-snackbar.js'

beforeAll(() => {
  vi.useFakeTimers()
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  document.body.innerHTML = ''
})

function createSnackbar(text = 'Email archived'): SpSnackbar {
  const bar = document.createElement('sp-snackbar') as SpSnackbar
  bar.textContent = text
  document.body.appendChild(bar)
  return bar
}

describe('sp-snackbar', () => {
  it('is registered as a custom element', () => {
    expect(customElements.get('sp-snackbar')).toBe(SpSnackbar)
  })

  it('renders the slotted message in its supporting text', async () => {
    const bar = createSnackbar()
    await bar.updateComplete
    const supporting = bar.shadowRoot?.querySelector('.md-snackbar__supporting_text')
    expect(supporting).not.toBeNull()
    expect(supporting!.querySelector('slot')).not.toBeNull()
    expect(bar.textContent).toContain('Email archived')
  })

  it('show() opens it and fires open then opened', async () => {
    const bar = createSnackbar()
    const events: string[] = []
    bar.addEventListener('open', () => events.push('open'))
    bar.addEventListener('opened', () => events.push('opened'))
    bar.timeout = -1
    bar.show()
    expect(bar.open).toBe(true)
    await bar.updateComplete
    expect(bar.hasAttribute('open')).toBe(true)
    vi.advanceTimersByTime(200)
    expect(bar.classList.contains('opened')).toBe(true)
    expect(events).toEqual(['open', 'opened'])
  })

  it('close() fires close then closed and clears open', async () => {
    const bar = createSnackbar()
    const events: string[] = []
    bar.addEventListener('close', () => events.push('close'))
    bar.addEventListener('closed', () => events.push('closed'))
    bar.timeout = -1
    bar.show()
    vi.advanceTimersByTime(200)
    bar.close()
    expect(bar.classList.contains('opened')).toBe(false)
    vi.advanceTimersByTime(200)
    expect(bar.open).toBe(false)
    expect(events).toEqual(['close', 'closed'])
  })

  it('auto-closes after its timeout by default', () => {
    const bar = createSnackbar()
    bar.timeout = 1000
    bar.show()
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(200)
    expect(bar.open).toBe(false)
  })

  it('stays open when the timeout is not positive', () => {
    const bar = createSnackbar()
    bar.timeout = -1
    bar.show()
    vi.advanceTimersByTime(60000)
    expect(bar.open).toBe(true)
  })

  it('open reflects state but does not drive the lifecycle', async () => {
    const bar = createSnackbar()
    bar.timeout = -1
    bar.open = true
    await bar.updateComplete
    vi.advanceTimersByTime(400)
    // Setting the property alone never shows the snackbar (no stale-update
    // resurrection); show()/close() are the lifecycle drivers.
    expect(bar.classList.contains('opened')).toBe(false)
    bar.show()
    vi.advanceTimersByTime(200)
    expect(bar.classList.contains('opened')).toBe(true)
    bar.close()
    vi.advanceTimersByTime(200)
    expect(bar.open).toBe(false)
  })

  it('a close that lands before the open update still completes', async () => {
    const bar = createSnackbar()
    bar.timeout = -1
    const onClosed = vi.fn()
    bar.addEventListener('closed', onClosed)
    bar.show()
    bar.close()
    vi.advanceTimersByTime(200)
    await bar.updateComplete
    vi.advanceTimersByTime(400)
    expect(onClosed).toHaveBeenCalledOnce()
    expect(bar.open).toBe(false)
  })

  it('renders its action as an md-text-button and fires action on click', async () => {
    const bar = createSnackbar()
    bar.actionText = 'Undo'
    await bar.updateComplete
    const action = bar.shadowRoot?.querySelector('.md-snackbar__action')
    expect(action).not.toBeNull()
    expect(action!.tagName).toBe('MD-TEXT-BUTTON')
    expect(action!.textContent).toContain('Undo')
    const onAction = vi.fn()
    bar.addEventListener('action', onAction)
    ;(action as HTMLElement).click()
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('has no action button without action text', async () => {
    const bar = createSnackbar()
    await bar.updateComplete
    expect(bar.shadowRoot?.querySelector('.md-snackbar__action')).toBeNull()
  })

  it('show() is idempotent while the snackbar is shown', () => {
    const bar = createSnackbar()
    bar.timeout = -1
    const onOpen = vi.fn()
    const onOpened = vi.fn()
    bar.addEventListener('open', onOpen)
    bar.addEventListener('opened', onOpened)

    bar.show()
    bar.show()
    vi.advanceTimersByTime(200)

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpened).toHaveBeenCalledOnce()
  })

  it('close() does nothing when the snackbar is not shown', () => {
    const bar = createSnackbar()
    const onClose = vi.fn()
    const onClosed = vi.fn()
    bar.addEventListener('close', onClose)
    bar.addEventListener('closed', onClosed)

    bar.close()
    vi.advanceTimersByTime(400)

    expect(onClose).not.toHaveBeenCalled()
    expect(onClosed).not.toHaveBeenCalled()
    expect(bar.open).toBe(false)
  })

  it('stays open when shown again during the close transition', () => {
    const bar = createSnackbar()
    bar.timeout = -1
    const onClosed = vi.fn()
    bar.addEventListener('closed', onClosed)

    bar.show()
    vi.advanceTimersByTime(200)
    bar.close()
    vi.advanceTimersByTime(100)
    bar.show()
    vi.advanceTimersByTime(400)

    expect(onClosed).not.toHaveBeenCalled()
    expect(bar.open).toBe(true)
    expect(bar.classList.contains('opened')).toBe(true)
  })

  it('closes when the icon slot is clicked', async () => {
    const bar = createSnackbar()
    bar.timeout = -1
    const icon = document.createElement('span')
    icon.setAttribute('slot', 'icon')
    icon.textContent = 'X'
    bar.appendChild(icon)
    await bar.updateComplete

    bar.show()
    vi.advanceTimersByTime(200)
    expect(bar.classList.contains('opened')).toBe(true)

    // happy-dom does not retarget a click from slotted content through the
    // slot, so dispatch the click on the slot that carries the handler.
    const slot = bar.shadowRoot!.querySelector('slot[name="icon"]') as HTMLSlotElement
    slot.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(bar.classList.contains('opened')).toBe(false)
    vi.advanceTimersByTime(200)
    expect(bar.open).toBe(false)
  })

  it('reflects fixed, two-lines, and timeout attributes', async () => {
    const bar = createSnackbar()
    bar.fixed = true
    bar.twoLines = true
    bar.timeout = 2500
    await bar.updateComplete

    expect(bar.hasAttribute('fixed')).toBe(true)
    expect(bar.hasAttribute('two-lines')).toBe(true)
    expect(bar.getAttribute('timeout')).toBe('2500')
  })
})
