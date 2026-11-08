import { describe, expect, it, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

let doc: Document

beforeAll(() => {
  doc = new DOMParser().parseFromString(
    readFileSync(resolve(__dirname, '../index.html'), 'utf8'),
    'text/html'
  )
})

function toolsSections(): HTMLElement[] {
  return [...doc.querySelectorAll('#tools-page > sp-settings-section')] as HTMLElement[]
}

function sectionLabel(section: HTMLElement): string {
  return section.querySelector('[slot="label"]')?.textContent?.trim() || ''
}

function toolsHeadings(): string[] {
  return toolsSections().map(sectionLabel)
}

describe('Tools layout', () => {
  it('orders the attestation workflow before maintenance and support', () => {
    expect(toolsHeadings().slice(0, 6)).toEqual([
      'Keystore Management',
      'Play Integrity Fix',
      'Module Configs',
      'Google Services',
      'Support',
      'Danger Zone',
    ])
  })

  it('keeps the keybox entry first inside Keystore Management', () => {
    const section = toolsSections().find(s => sectionLabel(s) === 'Keystore Management')
    expect(section).toBeTruthy()
    const ids = [...section!.querySelectorAll(':scope > sp-settings-row')]
      .map(el => el.id)
    expect(ids[0]).toBe('keybox-btn')
    expect(ids).toContain('target-apps-btn')
    expect(ids).not.toContain('keybox-catalog-btn')
    expect(ids).not.toContain('custom-keybox-btn')
  })

  it('uses one OMK restart entry instead of two action rows', () => {
    expect(doc.getElementById('omk-restart-btn')).not.toBeNull()
    expect(doc.getElementById('omk-restart-keymint')).toBeNull()
    expect(doc.getElementById('omk-restart-injector')).toBeNull()
  })

  it('does not keep a separate Keybox section', () => {
    expect(toolsHeadings()).not.toContain('Keybox')
  })

  it('places the HMA-OSS scope entry inside Module Configs without a duplicate quick action', () => {
    const section = toolsSections().find(s => sectionLabel(s) === 'Module Configs')
    expect(section).toBeTruthy()
    const ids = [...section!.querySelectorAll(':scope > sp-settings-row')].map(el => el.id)
    expect(ids).toContain('hma-apps-btn')
    expect(ids).not.toContain('module-config-hma')
  })
})
