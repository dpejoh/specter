import { beforeEach, describe, expect, it } from 'vitest'
import logo from './specter-logo.svg?raw'
import { BRAND_PALETTE, initBrand } from './brand.js'
import { PRESETS } from './theme.js'

function applyTheme(preset: string) {
  document.dispatchEvent(new CustomEvent('specter-theme-applied', { detail: { preset } }))
}

function brandVars(host: HTMLElement) {
  return Object.fromEntries(
    Object.keys(BRAND_PALETTE.blue).map((name) => [name, host.style.getPropertyValue(`--brand-${name}`)]),
  )
}

describe('theme-aware brand', () => {
  let host: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = '<span id="app-brand" class="app-brand" aria-hidden="true"></span>'
    host = document.getElementById('app-brand')!
    initBrand()
  })

  it('has a logo palette for every theme preset', () => {
    expect(Object.keys(BRAND_PALETTE).sort()).toEqual(Object.keys(PRESETS).sort())
  })

  it('inlines one adaptive SVG', () => {
    expect(host.querySelectorAll('svg')).toHaveLength(1)
    expect(host.dataset.ready).toBeUndefined()
  })

  it('ships the adaptive brand roles', () => {
    const doc = new DOMParser().parseFromString(logo, 'image/svg+xml')
    expect(doc.querySelector('.brand-halo')).not.toBeNull()
    expect(doc.querySelector('.brand-accent')).not.toBeNull()
    expect(doc.querySelectorAll('.brand-ink').length).toBeGreaterThan(0)
  })

  it('is idempotent', () => {
    initBrand()
    expect(host.querySelectorAll('svg')).toHaveLength(1)
  })

  it('applies the preset palette', () => {
    for (const [preset, swatch] of Object.entries(BRAND_PALETTE)) {
      applyTheme(preset)
      expect(brandVars(host)).toEqual(swatch)
    }
    expect(host.dataset.ready).toBe('1')
  })

  it.each(['monet', '__proto__'])('falls back to blue for %s', (preset) => {
    applyTheme(preset)
    expect(brandVars(host)).toEqual(BRAND_PALETTE.blue)
  })
})
