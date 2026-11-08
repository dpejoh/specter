import { describe, expect, it, beforeEach } from 'vitest'
import { applyKeyboxStatus } from './device.js'

describe('keybox display format', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="kb-hero-name-row">
        <span class="kb-hero-keybox-name" id="keybox-name">—</span>
        <span class="kb-hero-by" id="keybox-by" style="display: none;">by</span>
        <span class="kb-hero-provider-name" id="keybox-source" style="display: none;"></span>
        <span class="kb-hero-provider-version kb-hero-provider-version--neutral" id="keybox-version" style="display: none;"></span>
        <span class="kb-version-badge" id="kb-version-badge"></span>
        <span class="kb-hero-status-text" id="keybox-status">—</span>
        <span class="kb-hero-status-text kb-hero-status-text--neutral" id="keybox-type">—</span>
      </div>
    `
  })

  it('displays "beebox by mhmrdd" for mhmrdd provider with beebox text', () => {
    applyKeyboxStatus({
      installed: true,
      source: 'mhmrdd',
      source_version: '1',
      text: 'beebox',
      up_to_date: true,
      revoked: false,
      softbanned: false,
    })

    const nameEl = document.getElementById('keybox-name')!
    const byEl = document.getElementById('keybox-by')!
    const sourceEl = document.getElementById('keybox-source')!
    const badgeEl = document.getElementById('kb-version-badge')!

    expect(nameEl.textContent).toBe('beebox')
    expect(byEl.textContent).toBe('by')
    expect(byEl.style.display).not.toBe('none')
    expect(sourceEl.textContent).toBe('mhmrdd')
    expect(sourceEl.style.display).not.toBe('none')
    expect(badgeEl.textContent).toBe('')
  })

  it('displays "v53 by Yuri" for Yuri provider with v53 text', () => {
    applyKeyboxStatus({
      installed: true,
      source: 'Yuri',
      source_version: '53',
      text: 'v53',
      up_to_date: true,
      revoked: false,
      softbanned: false,
    })

    const nameEl = document.getElementById('keybox-name')!
    const byEl = document.getElementById('keybox-by')!
    const sourceEl = document.getElementById('keybox-source')!

    expect(nameEl.textContent).toBe('v53')
    expect(byEl.textContent).toBe('by')
    expect(byEl.style.display).not.toBe('none')
    expect(sourceEl.textContent).toBe('Yuri')
    expect(sourceEl.style.display).not.toBe('none')
  })

  it('displays "Not Installed" when keybox is not installed', () => {
    applyKeyboxStatus({
      installed: false,
    })

    const nameEl = document.getElementById('keybox-name')!
    const byEl = document.getElementById('keybox-by')!
    const sourceEl = document.getElementById('keybox-source')!

    expect(nameEl.textContent).toBe('Not Installed')
    expect(byEl.style.display).toBe('none')
    expect(sourceEl.style.display).toBe('none')
  })

  it('displays "Private Keybox" when keybox is private', () => {
    applyKeyboxStatus({
      installed: true,
      source: 'Private',
      is_private: true,
      revoked: false,
    })

    const nameEl = document.getElementById('keybox-name')!
    const byEl = document.getElementById('keybox-by')!
    const sourceEl = document.getElementById('keybox-source')!

    expect(nameEl.textContent).toBe('Private Keybox')
    expect(byEl.style.display).toBe('none')
    expect(sourceEl.style.display).toBe('none')
  })

  it('shows the keybox type as RKP when rkp is true', () => {
    applyKeyboxStatus({
      installed: true,
      source: 'TAKR',
      source_version: '36',
      text: '36',
      rkp: true,
      revoked: false,
    })

    const typeEl = document.getElementById('keybox-type')!
    expect(typeEl.textContent).toBe('RKP')
    expect(typeEl.className).toContain('kb-hero-type-text')
  })

  it('shows the keybox type as Normal when rkp is false', () => {
    applyKeyboxStatus({
      installed: true,
      source: 'TAKR',
      source_version: '28',
      text: '28',
      rkp: false,
      revoked: false,
    })

    const typeEl = document.getElementById('keybox-type')!
    expect(typeEl.textContent).toBe('Normal')
    expect(typeEl.className).toContain('kb-hero-type-text')
  })

  it('shows no keybox type when no remote provider is known', () => {
    applyKeyboxStatus({
      installed: true,
      source: '',
      text: 'custom.xml',
      revoked: false,
    })

    expect(document.getElementById('keybox-type')!.textContent).toBe('—')
  })

  it('displays generic text when no remote provider is known', () => {
    applyKeyboxStatus({
      installed: true,
      source: '',
      text: 'custom.xml',
      revoked: false,
    })

    const nameEl = document.getElementById('keybox-name')!
    const byEl = document.getElementById('keybox-by')!
    const sourceEl = document.getElementById('keybox-source')!

    expect(nameEl.textContent).toBe('custom.xml')
    expect(byEl.style.display).toBe('none')
    expect(sourceEl.style.display).toBe('none')
  })
})
