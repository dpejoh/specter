import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

vi.mock('./modules.js', () => ({
  isAnyModuleInstalled: vi.fn(),
}))

import { isAnyModuleInstalled } from './modules.js'
import { updateModuleConfigSectionVisibility } from './module-config-section.js'

beforeEach(() => {
  vi.mocked(isAnyModuleInstalled).mockReset()
  document.body.innerHTML = `
    <sp-settings-section id="module-config-section" hidden>
      <sp-settings-row id="hma-apps-btn" hidden></sp-settings-row>
      <sp-settings-row id="module-config-zygisk-next" hidden></sp-settings-row>
    </sp-settings-section>
  `
})

function visible(id: string): boolean | null {
  return document.getElementById(id)?.hidden === false
}

describe('updateModuleConfigSectionVisibility', () => {
  it('shows only the HMA scope entry when HMA-OSS is installed', async () => {
    vi.mocked(isAnyModuleInstalled).mockImplementation(async ids =>
      ids.includes('hma_oss_zygisk')
    )
    await updateModuleConfigSectionVisibility()
    expect(visible('hma-apps-btn')).toBe(true)
    expect(visible('module-config-zygisk-next')).toBe(false)
    expect(visible('module-config-section')).toBe(true)
  })

  it('shows only the Zygisk Next row when Zygisk Next is installed', async () => {
    vi.mocked(isAnyModuleInstalled).mockImplementation(async ids =>
      ids.includes('zygisksu')
    )
    await updateModuleConfigSectionVisibility()
    expect(visible('hma-apps-btn')).toBe(false)
    expect(visible('module-config-zygisk-next')).toBe(true)
    expect(visible('module-config-section')).toBe(true)
  })

  it('shows both module entries when both modules are installed', async () => {
    vi.mocked(isAnyModuleInstalled).mockResolvedValue(true)
    await updateModuleConfigSectionVisibility()
    expect(visible('hma-apps-btn')).toBe(true)
    expect(visible('module-config-zygisk-next')).toBe(true)
  })

  it('hides the whole section when neither module is installed', async () => {
    vi.mocked(isAnyModuleInstalled).mockResolvedValue(false)
    await updateModuleConfigSectionVisibility()
    expect(visible('hma-apps-btn')).toBe(false)
    expect(visible('module-config-zygisk-next')).toBe(false)
    expect(visible('module-config-section')).toBe(false)
  })

  it('hides the whole section when detection fails', async () => {
    vi.mocked(isAnyModuleInstalled).mockRejectedValue(new Error('no-bridge'))
    await updateModuleConfigSectionVisibility()
    expect(visible('module-config-section')).toBe(false)
  })
})

describe('Tools markup', () => {
  it('ships Module Configs and both rows hidden by default', () => {
    const doc = new DOMParser().parseFromString(
      readFileSync(resolve(__dirname, '../index.html'), 'utf8'),
      'text/html'
    )
    for (const id of [
      'module-config-section',
      'hma-apps-btn',
      'module-config-zygisk-next',
    ]) {
      expect(doc.getElementById(id)?.hasAttribute('hidden')).toBe(true)
    }
    expect(doc.getElementById('module-config-hma')).toBeNull()
  })
})
