import { beforeEach, describe, expect, it, vi } from 'vitest'
import './ui/sp-settings-row.js'
import {
  refreshControlToggles,
  renderControlToggles,
  wireControlToggles,
  wireDevMode,
  wireRowDialog,
} from './toggles.js'
import { CONTROL_TOGGLES } from './constants.js'
import { cfgGet, cfgInvalidate, cfgSet } from './cfg.js'

const utils = vi.hoisted(() => ({ setDevMode: vi.fn() }))

vi.mock('./utils.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./utils.js')>()
  return { ...actual, setDevMode: utils.setDevMode }
})

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

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
  cfgInvalidate()
  vi.clearAllMocks()
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

  it('re-renders without duplicating rows or switches', async () => {
    renderControlToggles()
    renderControlToggles()
    await tick()

    for (const toggle of CONTROL_TOGGLES) {
      expect(
        document.querySelectorAll(`[id="${toggle.id}-row"]`),
        toggle.id,
      ).toHaveLength(1)
    }

    for (const section of ['boot', 'background', 'action'] as const) {
      const container = document.getElementById(`control-${section}-container`)!
      expect(container.children, section).toHaveLength(
        CONTROL_TOGGLES.filter(toggle => toggle.section === section).length,
      )
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

  it('does nothing for a missing row', () => {
    expect(() => wireRowDialog('not-there', vi.fn())).not.toThrow()
  })

  it('opens from the row body when the row has no config button', () => {
    const row = document.createElement('sp-settings-row')
    row.id = 'plain-row'
    document.body.appendChild(row)

    const open = vi.fn()
    wireRowDialog('plain-row', open)
    row.dispatchEvent(new Event('sp-activate'))
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('stops the config button click from reaching the row', () => {
    const row = document.createElement('sp-settings-row')
    row.id = 'stop-row'
    const config = document.createElement('button')
    config.setAttribute('data-config', '')
    row.appendChild(config)
    document.body.appendChild(row)

    const rowClick = vi.fn()
    row.addEventListener('click', rowClick)
    const open = vi.fn()
    wireRowDialog('stop-row', open)

    config.click()
    expect(open).toHaveBeenCalledTimes(1)
    expect(rowClick).not.toHaveBeenCalled()
  })
})

describe('renderControlToggles fallbacks', () => {
  it('returns quietly when a section container is missing', () => {
    document.body.innerHTML = '<div id="control-boot-container"></div>'
    expect(() => renderControlToggles()).not.toThrow()
    expect(document.querySelector('sp-settings-row')).toBeNull()
  })

  it('renders config markup with labels, divider and switch for configurable toggles', async () => {
    renderControlToggles()
    await tick()

    const row = document.getElementById('toggle-prop_handler-row')!
    const config = row.querySelector('[data-config]') as HTMLButtonElement
    expect(config.getAttribute('slot')).toBe('trailing')
    expect(config.getAttribute('aria-label')).toBe('Configure Boot Spoofing')
    expect(row.querySelector('.li-config-divider')?.getAttribute('slot')).toBe('trailing')

    const sw = row.querySelector('md-switch') as HTMLElement & { selected: boolean }
    expect(sw.getAttribute('slot')).toBe('trailing')
    expect(sw.getAttribute('aria-label')).toBe('Boot Spoofing')
    expect(sw.getAttribute('data-i18n-aria')).toBe('control_toggle_prop_handler')
  })
})

describe('control toggle wiring', () => {
  it('applies stored config values and persists switch changes', async () => {
    cfgSet('toggle_prop_handler', '0')
    renderControlToggles()
    await tick()

    const sw = document.getElementById('toggle-prop_handler') as HTMLElement & { selected: boolean }
    const defaulted = document.getElementById('toggle-action_pif') as HTMLElement & { selected: boolean }
    expect(sw.selected).toBe(false)
    // toggle_action_pif has no explicit default, so it falls back to enabled.
    expect(defaulted.selected).toBe(true)

    sw.selected = true
    sw.dispatchEvent(new Event('change'))
    await tick()
    expect(await cfgGet('toggle_prop_handler')).toBe('1')

    sw.selected = false
    sw.dispatchEvent(new Event('change'))
    await tick()
    expect(await cfgGet('toggle_prop_handler')).toBe('0')
  })

  it('wires each switch only once when called repeatedly', async () => {
    document.body.innerHTML = '<md-switch id="toggle-action_pif"></md-switch>'
    const sw = document.getElementById('toggle-action_pif')!
    const addSpy = vi.spyOn(sw, 'addEventListener')

    wireControlToggles()
    wireControlToggles()

    expect(addSpy.mock.calls.filter(([type]) => type === 'change')).toHaveLength(1)
  })

  it('wires existing switches directly and skips switches that are absent', async () => {
    document.body.innerHTML = `
      <md-switch id="toggle-action_pif"></md-switch>
      <md-switch id="toggle-adb_disabler"></md-switch>
    `
    const pif = document.getElementById('toggle-action_pif') as HTMLElement & { selected: boolean }
    const adb = document.getElementById('toggle-adb_disabler') as HTMLElement & { selected: boolean }

    wireControlToggles()
    await tick()
    expect(pif.selected).toBe(true)
    expect(adb.selected).toBe(false)
  })

  it('refreshes switches from config after invalidating the cache', async () => {
    document.body.innerHTML = `
      <md-switch id="toggle-action_pif"></md-switch>
      <md-switch id="toggle-adb_disabler"></md-switch>
    `
    const pif = document.getElementById('toggle-action_pif') as HTMLElement & { selected: boolean }
    const adb = document.getElementById('toggle-adb_disabler') as HTMLElement & { selected: boolean }
    pif.selected = false
    adb.selected = true

    await refreshControlToggles()

    // With no data dir the loader falls back to each toggle's default.
    expect(pif.selected).toBe(true)
    expect(adb.selected).toBe(false)
  })
})

describe('wireDevMode', () => {
  it('does nothing when the dev-mode switch is absent', () => {
    expect(() => wireDevMode()).not.toThrow()
    expect(utils.setDevMode).not.toHaveBeenCalled()
  })

  it('restores the saved value and writes changes back', async () => {
    cfgSet('dev_mode', 'true')
    document.body.innerHTML = '<md-switch id="dev-mode-switch"></md-switch>'
    const sw = document.getElementById('dev-mode-switch') as HTMLElement & { selected: boolean }

    wireDevMode()
    await tick()
    expect(sw.selected).toBe(true)

    sw.selected = false
    sw.dispatchEvent(new Event('change'))
    await tick()

    expect(utils.setDevMode).toHaveBeenCalledWith(false)
    expect(await cfgGet('dev_mode')).toBe('false')
  })

  it('enables dev mode when the switch is turned on', async () => {
    document.body.innerHTML = '<md-switch id="dev-mode-switch"></md-switch>'
    const sw = document.getElementById('dev-mode-switch') as HTMLElement & { selected: boolean }

    wireDevMode()
    await tick()
    expect(sw.selected).toBe(false)

    sw.selected = true
    sw.dispatchEvent(new Event('change'))
    await tick()

    expect(utils.setDevMode).toHaveBeenCalledWith(true)
    expect(await cfgGet('dev_mode')).toBe('true')
  })
})
