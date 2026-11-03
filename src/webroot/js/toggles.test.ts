import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderControlToggles, wireRowDialog } from './toggles.js'
import { CONTROL_TOGGLES } from './constants.js'

function setupDom() {
  document.body.innerHTML = `
    <div id="control-boot-container"></div>
    <div id="control-background-container"></div>
    <div id="control-action-container"></div>
  `
}

beforeEach(() => {
  setupDom()
  localStorage.clear()
})

describe('renderControlToggles', () => {
  it('renders a label and description for every toggle', async () => {
    renderControlToggles()
    await Promise.resolve()
    await Promise.resolve()

    for (const toggle of CONTROL_TOGGLES) {
      const row = document.getElementById(`${toggle.id}-row`)
      expect(row, toggle.id).not.toBeNull()
      expect(row!.querySelector('.toggle-text')?.textContent?.trim()).not.toBe('')
      expect(row!.querySelector('.supporting-text')?.textContent?.trim()).not.toBe('')
    }
  })

  it('toggles a non-configurable row when the row is clicked', async () => {
    renderControlToggles()
    await Promise.resolve()
    await Promise.resolve()

    const row = document.getElementById('toggle-action_target-row')!
    const sw = row.querySelector('md-switch') as HTMLElement & { selected: boolean }
    const before = sw.selected
    row.click()
    expect(sw.selected).toBe(!before)
  })

  it('leaves a configurable row to its dialog wiring', async () => {
    renderControlToggles()
    await Promise.resolve()
    await Promise.resolve()

    const row = document.getElementById('toggle-prop_handler-row')!
    const sw = row.querySelector('md-switch') as HTMLElement & { selected: boolean }
    const before = sw.selected
    row.click()
    expect(sw.selected).toBe(before)
  })
})

describe('wireRowDialog', () => {
  it('wires a row only once', () => {
    document.body.innerHTML = '<div id="row"></div>'
    const open = vi.fn()
    wireRowDialog('row', open)
    wireRowDialog('row', open)
    document.getElementById('row')!.click()
    expect(open).toHaveBeenCalledTimes(1)
  })
})
