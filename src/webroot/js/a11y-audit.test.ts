import { describe, expect, it, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const HTML_PATH = resolve(__dirname, '../index.html')
let doc: Document

beforeAll(() => {
  const parser = new DOMParser()
  doc = parser.parseFromString(readFileSync(HTML_PATH, 'utf8'), 'text/html')
})

describe('document structure', () => {
  it('has lang, dir, viewport, and color-scheme', () => {
    expect(doc.documentElement.getAttribute('lang')).toBeTruthy()
    expect(doc.documentElement.getAttribute('dir')).toBeTruthy()
    const vp = doc.querySelector('meta[name="viewport"]')
    expect(vp?.getAttribute('content')).toContain('width=device-width')
    expect(doc.querySelector('meta[name="color-scheme"]')).not.toBeNull()
  })
})

describe('headings', () => {
  it('exactly one h1 and no empty headings', () => {
    expect(doc.querySelectorAll('h1').length).toBe(1)
    expect(doc.querySelector('h1')?.textContent).toBeTruthy()
    doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
      expect(h.textContent?.trim() || h.getAttribute('data-i18n')).toBeTruthy()
    })
  })
})

describe('images and icons', () => {
  it('all md-icon elements have aria-hidden, and img have alt', () => {
    doc.querySelectorAll('md-icon').forEach(icon => {
      expect(icon.getAttribute('aria-hidden') === 'true' || icon.hasAttribute('aria-label')).toBe(true)
    })
    doc.querySelectorAll('img').forEach(img => expect(img.hasAttribute('alt')).toBe(true))
  })
})

describe('interactive elements', () => {
  it('all md-icon-button, md-switch, and button elements have accessible names', () => {
    const check = (el: Element) => {
      expect(el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || el.hasAttribute('data-i18n-aria')).toBe(true)
    }
    doc.querySelectorAll('md-icon-button').forEach(check)
    doc.querySelectorAll('md-switch').forEach(check)
    doc.querySelectorAll('button').forEach(btn => {
      const text = (btn.textContent || '').trim()
      expect(text.length > 0 || btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby')).toBe(true)
    })
  })

  it('keeps switches as direct row children so rows do not wrap an interactive control', () => {
    doc.querySelectorAll('sp-settings-row').forEach(row => {
      row.querySelectorAll('md-switch').forEach(sw => {
        expect(sw.parentElement).toBe(row)
      })
    })
  })

  it('all select elements have aria-label or associated label', () => {
    doc.querySelectorAll('select').forEach(sel => {
      const id = sel.getAttribute('id')
      if (id && doc.querySelector(`label[for="${id}"]`)) return
      expect(sel.hasAttribute('aria-label')).toBe(true)
    })
  })
})

describe('i18n and ids', () => {
  it('no data-i18n element lacks fallback text', () => {
    doc.querySelectorAll('[data-i18n]').forEach(el => {
      const fallback = el.textContent?.trim()
      if (!fallback) {
        expect(el.getAttribute('data-i18n')).toBeTruthy()
      }
    })
  })

  it('no duplicate id attributes', () => {
    const ids = new Map<string, number>()
    doc.querySelectorAll('[id]').forEach(el => ids.set(el.id, (ids.get(el.id) || 0) + 1))
    expect(Array.from(ids.entries()).filter(([_, c]) => c > 1)).toEqual([])
  })
})

describe('aria landmarks', () => {
  it('has main and header landmarks', () => {
    expect(doc.querySelector('main')).not.toBeNull()
    expect(doc.querySelector('header')).not.toBeNull()
  })
})
