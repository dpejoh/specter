import { beforeEach, describe, expect, it, vi } from 'vitest'
import './ui/sp-settings-row.js'
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
      expect(row!.querySelector('[slot="headline"]')?.textContent?.trim()).not.toBe('')
      expect(row!.querySelector('[slot="supporting"]')?.textContent?.trim()).not.toBe('')
    }
  })

  it('toggles a non-configurable row when the row is clicked', async () => {
    renderControlToggles()
    await Promise.resolve()
    await Promise.resolve()

    const row = document.getElementById('toggle-action_pif-row') as HTMLElement
    const sw = row.querySelector('md-switch') as HTMLElement & { selected: boolean }
    const before = sw.selected
    ;(row.shadowRoot!.querySelector('[part=row]') as HTMLElement).click()
    expect(sw.selected).toBe(!before)
  })

  it('opens the page from a configurable row body while leaving the switch alone', async () => {
    renderControlToggles()
    await Promise.resolve()
    await Promise.resolve()

    const row = document.getElementById('toggle-prop_handler-row') as HTMLElement
    const sw = row.querySelector('md-switch') as HTMLElement & { selected: boolean }
    const before = sw.selected
    const open = vi.fn()

    expect(row.hasAttribute('has-page')).toBe(true)
    wireRowDialog('toggle-prop_handler-row', open)
    ;(row.shadowRoot!.querySelector('[part=row]') as HTMLElement).click()
    expect(open).toHaveBeenCalledTimes(1)
    expect(sw.selected).toBe(before)

    ;(row.querySelector('[data-config]') as HTMLElement).click()
    expect(open).toHaveBeenCalledTimes(2)
    expect(sw.selected).toBe(before)
  })
})

describe('wireRowDialog', () => {
  it('wires a row only once and opens from the config button', () => {
    const row = document.createElement('sp-settings-row')
    row.id = 'row'
    const config = document.createElement('button')
    config.setAttribute('data-config', '')
    config.setAttribute('slot', 'trailing')
    row.appendChild(config)
    document.body.appendChild(row)

    const open = vi.fn()
    wireRowDialog('row', open)
    wireRowDialog('row', open)

    row.dispatchEvent(new Event('sp-activate'))
    expect(open).toHaveBeenCalledTimes(1)

    config.click()
    expect(open).toHaveBeenCalledTimes(2)
  })
})
