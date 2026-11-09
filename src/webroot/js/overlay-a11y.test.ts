import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupOverlayA11y } from './overlay-a11y.js'

beforeEach(() => {
  document.body.innerHTML = `
    <header class="app-top-bar"></header>
    <main id="pages"><button id="opener">Open</button></main>
    <nav class="nav-bar"></nav>
    <div id="overlay"><h1 id="overlay-title">Overlay</h1><button id="close">Close</button></div>
  `
})

describe('overlay accessibility', () => {
  it('adds dialog semantics, background inertness, and restores focus', () => {
    const opener = document.getElementById('opener')!
    const overlay = document.getElementById('overlay')!
    opener.focus()

    const cleanup = setupOverlayA11y(overlay, {
      titleId: 'overlay-title',
      onClose: () => {},
    })

    expect(overlay.getAttribute('role')).toBe('dialog')
    expect(overlay.getAttribute('aria-modal')).toBe('true')
    expect(overlay.getAttribute('aria-labelledby')).toBe('overlay-title')
    expect(document.getElementById('pages')!.hasAttribute('inert')).toBe(true)

    cleanup()

    expect(document.getElementById('pages')!.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(opener)
  })

  it('closes on Escape and stops the event', () => {
    const onClose = vi.fn()
    const overlay = document.getElementById('overlay')!
    const cleanup = setupOverlayA11y(overlay, { titleId: 'overlay-title', onClose })
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    overlay.dispatchEvent(event)
    expect(onClose).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
    cleanup()
  })

  it('omits aria-labelledby when the title element does not exist', () => {
    const overlay = document.getElementById('overlay')!
    const cleanup = setupOverlayA11y(overlay, { titleId: 'missing-title', onClose: () => {} })
    expect(overlay.hasAttribute('aria-labelledby')).toBe(false)
    cleanup()
  })

  it('wraps Tab focus from the last item to the first and back', () => {
    const overlay = document.getElementById('overlay')!
    overlay.innerHTML = `
      <button id="first">First</button>
      <button id="middle">Middle</button>
      <button id="last">Last</button>
    `
    const first = document.getElementById('first')!
    const middle = document.getElementById('middle')!
    const last = document.getElementById('last')!
    const cleanup = setupOverlayA11y(overlay, { onClose: () => {} })

    last.focus()
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    overlay.dispatchEvent(forward)
    expect(forward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    overlay.dispatchEvent(backward)
    expect(backward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)

    // A Tab from the middle is left to the browser.
    middle.focus()
    const middleTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    overlay.dispatchEvent(middleTab)
    expect(middleTab.defaultPrevented).toBe(false)

    // Non-Tab keys are left alone.
    const otherKey = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
    overlay.dispatchEvent(otherKey)
    expect(otherKey.defaultPrevented).toBe(false)

    cleanup()
  })

  it('focuses the overlay itself when it has no focusable children', async () => {
    const overlay = document.getElementById('overlay')!
    overlay.innerHTML = '<p>Nothing interactive</p>'
    const cleanup = setupOverlayA11y(overlay, { onClose: () => {} })

    expect(overlay.tabIndex).toBe(-1)
    expect(overlay.getAttribute('role')).toBe('dialog')

    // A Tab with no focusable items is not intercepted.
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    overlay.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)

    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(document.activeElement).toBe(overlay)
    cleanup()
  })

  it('keeps the background inert until the last overlay closes and cleans up once', () => {
    const first = document.getElementById('overlay')!
    const second = document.createElement('div')
    second.id = 'overlay-two'
    second.innerHTML = '<button id="second-close">Close</button>'
    document.body.appendChild(second)

    const cleanupFirst = setupOverlayA11y(first, { onClose: () => {} })
    const cleanupSecond = setupOverlayA11y(second, { onClose: () => {} })

    cleanupFirst()
    expect(document.getElementById('pages')!.hasAttribute('inert')).toBe(true)

    // A second cleanup is a no-op and must not decrement the shared counter.
    cleanupFirst()
    expect(document.getElementById('pages')!.hasAttribute('inert')).toBe(true)

    cleanupSecond()
    expect(document.getElementById('pages')!.hasAttribute('inert')).toBe(false)
    expect(document.querySelector('.app-top-bar')!.hasAttribute('inert')).toBe(false)
    expect(document.querySelector('.nav-bar')!.hasAttribute('inert')).toBe(false)
  })

  it('does not restore focus to a disconnected opener', () => {
    const opener = document.getElementById('opener')!
    const overlay = document.getElementById('overlay')!
    opener.focus()

    const cleanup = setupOverlayA11y(overlay, { onClose: () => {} })
    opener.remove()
    cleanup()

    expect(document.activeElement).not.toBe(opener)
  })

  it('supports a null previous focus', () => {
    const overlay = document.getElementById('overlay')!
    const activeElement = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null)
    const cleanup = setupOverlayA11y(overlay, { onClose: () => {} })
    cleanup()
    activeElement.mockRestore()
  })
})
