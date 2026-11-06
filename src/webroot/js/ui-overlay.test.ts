import { describe, expect, it } from 'vitest'
import { overlayHeader } from './ui-overlay.js'

describe('overlay header', () => {
  it('builds a labelled header with a back button and actions slot', () => {
    const html = overlayHeader({
      className: 'subpage-header',
      back: { id: 'back', className: 'subpage-back-btn', label: 'Back' },
      title: 'Title',
      titleClass: 'subpage-title',
      titleId: 'title',
      actions: '<div id="actions"></div>',
    })
    expect(html).toContain('<header class="subpage-header">')
    expect(html).toContain('id="back"')
    expect(html).toContain('aria-label="Back"')
    expect(html).toContain('<h1 class="subpage-title" id="title">Title</h1>')
    expect(html).toContain('<div id="actions"></div>')
  })

  it('escapes the title and supports h2 headings', () => {
    const html = overlayHeader({
      className: 'ta-header',
      back: { id: 'back', className: 'ta-back-btn', label: 'Back' },
      title: '<b>Target</b>',
      titleTag: 'h2',
      titleClass: 'ta-title',
      titleId: 'ta-title',
    })
    expect(html).toContain('<h2 class="ta-title" id="ta-title">&lt;b&gt;Target&lt;/b&gt;</h2>')
    expect(html).not.toContain('<b>Target</b>')
  })
})
