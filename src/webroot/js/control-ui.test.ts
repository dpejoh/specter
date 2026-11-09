import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTROL_TOGGLES } from './constants.js'
import { renderControlToggles } from './toggles.js'
import { wireControlRows } from './control-ui.js'

// Stub the Material-based subpage shell.
vi.mock('./subpage.js', () => ({ openSubPage: vi.fn() }))
vi.mock('./boot-hash-ui.js', () => ({ openBootHashSubpage: vi.fn(async () => {}) }))

import { openBootHashSubpage } from './boot-hash-ui.js'

beforeEach(() => {
  document.body.innerHTML = `
    <div id="control-boot-container"></div>
    <div id="control-background-container"></div>
    <div id="control-action-container"></div>
  `
  localStorage.clear()
  vi.mocked(openBootHashSubpage).mockClear()
})

describe('wireControlRows', () => {
  it('wires every configurable Control row', async () => {
    renderControlToggles()
    await Promise.resolve()
    await Promise.resolve()
    await wireControlRows()

    for (const toggle of CONTROL_TOGGLES.filter(item => item.configurable)) {
      const row = document.getElementById(`${toggle.id}-row`)
      expect(row?.dataset.spWired, toggle.id).toBe('1')
    }
  })

  it('places every Control row in the section it belongs to', async () => {
    renderControlToggles()
    await Promise.resolve()
    await Promise.resolve()

    const containers = {
      boot: document.getElementById('control-boot-container'),
      background: document.getElementById('control-background-container'),
      action: document.getElementById('control-action-container'),
    }

    for (const toggle of CONTROL_TOGGLES) {
      const row = document.getElementById(`${toggle.id}-row`)
      expect(row?.parentElement, toggle.id).toBe(containers[toggle.section])
    }

    for (const section of ['boot', 'background', 'action'] as const) {
      expect(containers[section]!.children.length, section).toBe(
        CONTROL_TOGGLES.filter(toggle => toggle.section === section).length,
      )
    }
  })

  it('only shows the page affordance on configurable rows', async () => {
    renderControlToggles()
    await Promise.resolve()
    await Promise.resolve()

    for (const toggle of CONTROL_TOGGLES) {
      const row = document.getElementById(`${toggle.id}-row`)!
      if (toggle.configurable) {
        expect(row.hasAttribute('has-page'), toggle.id).toBe(true)
        expect(row.querySelector('[data-config]'), toggle.id).not.toBeNull()
      } else {
        expect(row.hasAttribute('has-page'), toggle.id).toBe(false)
        expect(row.querySelector('[data-config]'), toggle.id).toBeNull()
      }
    }
  })

  it('wires the boot hash row to open its subpage', async () => {
    renderControlToggles()
    await Promise.resolve()
    await Promise.resolve()
    await wireControlRows()

    const row = document.getElementById('toggle-boot_hash-row')!
    expect(row.dataset.spWired).toBe('1')

    row.dispatchEvent(new Event('sp-activate'))
    await vi.waitFor(() => expect(openBootHashSubpage).toHaveBeenCalledTimes(1))

    row.querySelector<HTMLButtonElement>('[data-config]')!.click()
    await vi.waitFor(() => expect(openBootHashSubpage).toHaveBeenCalledTimes(2))
  })
})
