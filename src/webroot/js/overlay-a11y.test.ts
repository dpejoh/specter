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
    setupOverlayA11y(overlay, { titleId: 'overlay-title', onClose })
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    overlay.dispatchEvent(event)
    expect(onClose).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })
})
