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

function toolsHeadings(): string[] {
  return [...doc.querySelectorAll('#tools-page > h2')]
    .map(h => h.textContent?.trim() || '')
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

  it('keeps the keybox actions first inside Keystore Management', () => {
    const heading = [...doc.querySelectorAll('#tools-page > h2')]
      .find(h => h.textContent?.trim() === 'Keystore Management')
    const container = heading?.nextElementSibling
    expect(container).toBeTruthy()
    const ids = [...container!.querySelectorAll(':scope > .list-item')]
      .map(el => el.id)
    expect(ids.slice(0, 2)).toEqual(['keybox-catalog-btn', 'custom-keybox-btn'])
    expect(ids).toContain('target-apps-btn')
  })

  it('does not keep a separate Keybox section', () => {
    expect(toolsHeadings()).not.toContain('Keybox')
  })
})
