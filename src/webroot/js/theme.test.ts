import { describe, expect, it, beforeEach, vi } from 'vitest'
import { initTheme, applyPreset, getCurrentPreset } from './theme.js'
import { cfgGet, cfgSet, cfgInvalidate, cfgInit, setDataDir } from './cfg.js'
import { exec } from './bridge.js'

vi.mock('./bridge.js', () => ({
  exec: vi.fn(() => Promise.resolve({ stdout: '', stderr: '', code: 0 })),
  getModuleDir: vi.fn(() => '/data/adb/modules/specter'),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(exec).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => null })))
  setDataDir('/data/adb/specter')
  cfgInvalidate()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-preset')
  document.documentElement.removeAttribute('data-theme-resolved')
  document.documentElement.removeAttribute('style')
})

describe('theme persistence', () => {
  it('applyPreset("monet") persists theme_preset as monet and theme_monet_switch as 1', async () => {
    applyPreset('monet')
    expect(getCurrentPreset()).toBe('monet')
    expect(await cfgGet('theme_preset')).toBe('monet')
    expect(await cfgGet('theme_monet_switch')).toBe('1')
    expect(document.documentElement.getAttribute('data-theme-preset')).toBe('monet')
  })

  it('applyPreset("red") persists theme_preset as red and theme_monet_switch as 0', async () => {
    applyPreset('red')
    expect(getCurrentPreset()).toBe('red')
    expect(await cfgGet('theme_preset')).toBe('red')
    expect(await cfgGet('theme_monet_switch')).toBe('0')
    expect(await cfgGet('theme_fixed_preset')).toBe('red')
    expect(document.documentElement.getAttribute('data-theme-preset')).toBe('red')
  })

  it('re-entering web UI with theme_monet_switch=1 restores monet preset permanently', async () => {
    // User had a fixed preset first
    applyPreset('blue')
    expect(await cfgGet('theme_monet_switch')).toBe('0')

    // User enables dynamic color scheme
    applyPreset('monet')
    expect(await cfgGet('theme_monet_switch')).toBe('1')
    expect(await cfgGet('theme_preset')).toBe('monet')

    // Simulate leaving and re-entering the Web UI (fresh page reload)
    cfgInvalidate()
    await cfgInit()
    // Config values are preserved from localStorage
    expect(await cfgGet('theme_monet_switch')).toBe('1')

    await initTheme('dark')
    expect(getCurrentPreset()).toBe('monet')
    expect(document.documentElement.getAttribute('data-theme-preset')).toBe('monet')
  })

  it('re-entering web UI with theme_monet_switch=0 restores fixed preset', async () => {
    // User disables dynamic color scheme and chooses yellow
    cfgSet('theme_monet_switch', '0')
    cfgSet('theme_fixed_preset', 'yellow')
    cfgSet('theme_preset', 'yellow')

    // Simulate leaving and re-entering the Web UI
    cfgInvalidate()
    await cfgInit()
    await initTheme('dark')
    expect(getCurrentPreset()).toBe('yellow')
    expect(document.documentElement.getAttribute('data-theme-preset')).toBe('yellow')
  })

  it('applies the system palette directly and ignores a stale cached seed', async () => {
    localStorage.setItem('monet_seed', '#AAAAAA')
    localStorage.setItem('specter_theme_seed', '#AAAAAA')
    vi.mocked(exec).mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        seed: '#597b95',
        ts: 123,
        palette: {
          light: { '--md-sys-color-primary': '#111111' },
          dark: { '--md-sys-color-primary': '#222222' },
        },
      }),
      stderr: '',
    })

    applyPreset('monet')
    await new Promise(r => setTimeout(r, 0))

    expect(localStorage.getItem('monet_seed')).toBe('#597b95')
    expect(localStorage.getItem('specter_theme_seed')).toBe('#597b95')
    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#222222')
  })

  it('falls back to the preset palette when the ROM has no system role palette', async () => {
    vi.mocked(exec).mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ seed: '#26818b', ts: 456, palette: null }),
      stderr: '',
    })

    applyPreset('monet')
    await new Promise(r => setTimeout(r, 0))

    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#85d1e8')
  })
})
