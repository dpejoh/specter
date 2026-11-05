import { describe, expect, it } from 'vitest'
import { row, rowContent, rowShell } from './ui-row.js'

describe('row primitives', () => {
  it('escapes title and description by default', () => {
    const html = rowContent({ title: '<b>Title</b>', description: 'a "quoted" & value' })
    expect(html).toContain('&lt;b&gt;Title&lt;/b&gt;')
    expect(html).toContain('a &quot;quoted&quot; &amp; value')
    expect(html).not.toContain('<b>Title</b>')
  })

  it('builds a standard clickable row with spinner and ripple', () => {
    const html = row({
      id: 'my-row',
      icon: 'key',
      title: 'Title',
      description: 'Description',
      spinner: true,
      role: 'button',
      tabindex: '0',
    })
    expect(html).toContain('id="my-row"')
    expect(html).toContain('role="button"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('action-spinner')
    expect(html).toContain('<md-ripple>')
  })

  it('emits a real button with type=button', () => {
    const html = rowShell({ tag: 'button', content: '<span>Body</span>' })
    expect(html.startsWith('<button')).toBe(true)
    expect(html).toContain('type="button"')
  })
})
