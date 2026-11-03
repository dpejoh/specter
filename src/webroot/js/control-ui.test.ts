import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTROL_TOGGLES } from './constants.js'
import { renderControlToggles } from './toggles.js'
import { wireControlRows } from './control-ui.js'

// Stub the Material-based subpage shell.
vi.mock('./subpage.js', () => ({ openSubPage: vi.fn() }))

beforeEach(() => {
  document.body.innerHTML = `
    <div id="control-boot-container"></div>
    <div id="control-background-container"></div>
    <div id="control-action-container"></div>
  `
  localStorage.clear()
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
})
