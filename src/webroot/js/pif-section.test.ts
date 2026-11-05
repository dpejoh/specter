import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

vi.mock('./modules.js', () => ({
  isModuleInstalled: vi.fn(),
}))

import { isModuleInstalled } from './modules.js'
import { updatePlayIntegritySectionVisibility } from './pif-section.js'

beforeEach(() => {
  vi.mocked(isModuleInstalled).mockReset()
  document.body.innerHTML = `
    <h2 id="pif-tools-title" hidden>Play Integrity</h2>
    <div id="pif-tools-section" hidden></div>
  `
})

describe('updatePlayIntegritySectionVisibility', () => {
  it('shows the heading and section when PIF is installed', async () => {
    vi.mocked(isModuleInstalled).mockResolvedValue(true)
    await expect(updatePlayIntegritySectionVisibility()).resolves.toBe(true)
    expect(document.getElementById('pif-tools-title')?.hidden).toBe(false)
    expect(document.getElementById('pif-tools-section')?.hidden).toBe(false)
  })

  it('keeps both hidden when PIF is absent', async () => {
    vi.mocked(isModuleInstalled).mockResolvedValue(false)
    await expect(updatePlayIntegritySectionVisibility()).resolves.toBe(false)
    expect(document.getElementById('pif-tools-title')?.hidden).toBe(true)
    expect(document.getElementById('pif-tools-section')?.hidden).toBe(true)
  })

  it('keeps both hidden when detection fails', async () => {
    vi.mocked(isModuleInstalled).mockRejectedValue(new Error('no-bridge'))
    await expect(updatePlayIntegritySectionVisibility()).resolves.toBe(false)
    expect(document.getElementById('pif-tools-title')?.hidden).toBe(true)
    expect(document.getElementById('pif-tools-section')?.hidden).toBe(true)
  })
})

describe('Tools markup', () => {
  it('ships the Play Integrity section hidden by default', () => {
    const doc = new DOMParser().parseFromString(
      readFileSync(resolve(__dirname, '../index.html'), 'utf8'),
      'text/html'
    )
    expect(doc.getElementById('pif-tools-title')?.hasAttribute('hidden')).toBe(true)
    expect(doc.getElementById('pif-tools-section')?.hasAttribute('hidden')).toBe(true)
  })
})
