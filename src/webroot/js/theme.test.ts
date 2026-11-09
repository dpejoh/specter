import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PRESETS,
  applyMode,
  applyPreset,
  getCurrentMappedPreset,
  getCurrentPreset,
  initTheme,
  refreshTheme,
} from './theme.js'
import { cfgGet, cfgSet, cfgInvalidate, cfgInit, setDataDir } from './cfg.js'
import { exec, getModuleDir } from './bridge.js'
import { getPresetColors } from './color-utils.js'

vi.mock('./bridge.js', () => ({
  exec: vi.fn(() => Promise.resolve({ stdout: '', stderr: '', code: 0 })),
  getModuleDir: vi.fn(() => '/data/adb/modules/specter'),
}))

type ListenerRecord = [string, EventListenerOrEventListenerObject, AddEventListenerOptions | boolean | undefined]

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
async function flush(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) await tick()
}

function mockFileMonet(data: unknown) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => data }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function mockFileFailure() {
  const fetchMock = vi.fn(async () => ({ ok: false, json: async () => null }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function mockScript(stdout: string) {
  vi.mocked(exec).mockResolvedValue({ code: 0, stdout, stderr: '' })
}

function mockScriptData(data: unknown) {
  mockScript(JSON.stringify(data))
}

function stubMatchMedia(initialMatches: boolean) {
  const listeners: Array<(event: MediaQueryListEvent) => void> = []
  const mql = {
    matches: initialMatches,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.push(listener)
    }),
    removeEventListener: vi.fn(),
  }
  const factory = vi.fn(() => mql)
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: factory })
  return { mql, listeners, factory }
}

let docListeners: ListenerRecord[] = []
let hidden = false
const originalMatchMedia = window.matchMedia

function setHidden(value: boolean) {
  hidden = value
}

async function fireVisibility(): Promise<void> {
  const records = docListeners.filter(([type]) => type === 'visibilitychange')
  const last = records[records.length - 1]
  if (!last) throw new Error('no visibilitychange listener registered')
  await (last[1] as (event: Event) => unknown)(new Event('visibilitychange'))
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(exec).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
  vi.mocked(getModuleDir).mockReturnValue('/data/adb/modules/specter')
  mockFileFailure()
  setDataDir('/data/adb/specter')
  cfgInvalidate()
  localStorage.clear()
  delete (window as any).__monetPromise
  delete (window as any).__statePromise

  hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })

  docListeners = []
  const originalAdd = document.addEventListener.bind(document)
  vi.spyOn(document, 'addEventListener').mockImplementation(
    (type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
      docListeners.push([type, listener, options])
      originalAdd(type, listener, options)
    },
  )

  // Reset the module-level monet cache between tests. A forced monet load with
  // no data clears the seed/palette, then the config cache is dropped so each
  // test starts from an empty snapshot.
  applyPreset('monet')
  await flush()
  localStorage.clear()
  cfgInvalidate()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-preset')
  document.documentElement.removeAttribute('data-theme-resolved')
  document.documentElement.removeAttribute('style')
})

afterEach(() => {
  for (const [type, listener, options] of docListeners) {
    document.removeEventListener(type, listener, options)
  }
  docListeners = []
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
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

describe('initTheme preset resolution', () => {
  it('uses the stored fixed preset when monet is off and the saved preset says monet', async () => {
    cfgSet('theme_monet_switch', '0')
    cfgSet('theme_preset', 'monet')
    cfgSet('theme_fixed_preset', 'green')

    await initTheme('light')

    expect(getCurrentPreset()).toBe('green')
    expect(getCurrentMappedPreset()).toBe('green')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme-preset')).toBe('green')
    expect(document.documentElement.getAttribute('data-theme-resolved')).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary'))
      .toBe(getPresetColors('green', false)!['--md-sys-color-primary'])
    expect(localStorage.getItem('specter_theme_seed')).toBe(PRESETS.green)
  })

  it('falls back to blue when no fixed preset was stored', async () => {
    cfgSet('theme_monet_switch', '0')
    cfgSet('theme_preset', 'monet')

    await initTheme('dark')

    expect(getCurrentPreset()).toBe('blue')
    expect(document.documentElement.getAttribute('data-theme-preset')).toBe('blue')
  })

  it('uses a saved fixed preset when the monet switch has no stored value', async () => {
    cfgSet('theme_preset', 'red')

    await initTheme('dark')

    expect(getCurrentPreset()).toBe('red')
    expect(document.documentElement.getAttribute('data-theme-preset')).toBe('red')
  })

  it('defaults the mode to dark when no saved mode is given', async () => {
    cfgSet('theme_monet_switch', '0')
    cfgSet('theme_preset', 'blue')

    await initTheme('')

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme-resolved')).toBe('dark')
  })
})

describe('applyMode', () => {
  it('re-applies the monet palette when the mode changes', async () => {
    cfgSet('theme_monet_switch', '0')
    cfgSet('theme_preset', 'blue')
    await initTheme('light')

    mockScriptData({
      seed: '#1157CE',
      ts: 10,
      palette: {
        light: { '--md-sys-color-primary': '#111111' },
        dark: { '--md-sys-color-primary': '#222222' },
      },
    })
    applyPreset('monet')
    await flush()
    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#111111')

    applyMode('amoled')
    await flush()

    expect(document.documentElement.getAttribute('data-theme')).toBe('amoled')
    expect(document.documentElement.getAttribute('data-theme-resolved')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#222222')
  })

  it('resolves auto mode from the system preference', () => {
    const mm = stubMatchMedia(false)
    applyPreset('blue')

    applyMode('auto')
    expect(document.documentElement.getAttribute('data-theme')).toBe('auto')
    expect(document.documentElement.getAttribute('data-theme-resolved')).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')

    mm.mql.matches = true
    applyMode('auto')
    expect(document.documentElement.getAttribute('data-theme-resolved')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('keeps the preset name but skips an unknown palette', () => {
    applyPreset('not-a-preset')

    expect(getCurrentPreset()).toBe('not-a-preset')
    expect(document.documentElement.getAttribute('data-theme-preset')).toBe('not-a-preset')
    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('')
  })

  it('falls back to the named preset when the palette has no variables', async () => {
    mockScriptData({ ts: 5, palette: { light: {}, dark: {} } })

    applyPreset('monet')
    await flush()

    expect(getCurrentMappedPreset()).toBe('blue')
    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary'))
      .toBe(getPresetColors('blue', true)!['--md-sys-color-primary'])
    expect(localStorage.getItem('specter_theme_seed')).toBe(PRESETS.blue)
  })

  it('maps a palette-only payload and notifies listeners', async () => {
    mockScriptData({
      ts: 6,
      palette: {
        light: { '--md-sys-color-primary': '#111111' },
        dark: { '--md-sys-color-primary': '#222222' },
      },
    })
    const events: Array<{ preset: string; dark: boolean }> = []
    const listener = (event: Event) => events.push((event as CustomEvent).detail)
    document.addEventListener('specter-theme-applied', listener)

    applyPreset('monet')
    await flush()
    document.removeEventListener('specter-theme-applied', listener)

    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#222222')
    expect(events.at(-1)).toEqual({ preset: 'blue', dark: true })
  })
})

describe('refreshTheme', () => {
  it('does nothing for a fixed preset', async () => {
    applyPreset('blue')
    await flush()
    const before = document.documentElement.style.getPropertyValue('--md-sys-color-primary')
    vi.mocked(exec).mockClear()

    refreshTheme()
    await flush()

    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe(before)
    expect(exec).not.toHaveBeenCalled()
  })

  it('clears the monet cache and reloads the palette', async () => {
    applyPreset('monet')
    await flush()

    mockScriptData({
      seed: '#1157CE',
      ts: 77,
      palette: {
        light: { '--md-sys-color-primary': '#333333' },
        dark: { '--md-sys-color-primary': '#444444' },
      },
    })
    const removeItem = vi.spyOn(localStorage, 'removeItem').mockImplementationOnce(() => {
      throw new Error('storage unavailable')
    })

    expect(() => refreshTheme()).not.toThrow()
    await flush()

    expect(removeItem).toHaveBeenCalled()
    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#444444')
  })
})

describe('visibility refresh', () => {
  it('applies a newer monet.json when the tab becomes visible', async () => {
    cfgSet('theme_monet_switch', '1')
    mockFileMonet({
      seed: '#1157CE',
      ts: 100,
      palette: {
        light: { '--md-sys-color-primary': '#101010' },
        dark: { '--md-sys-color-primary': '#202020' },
      },
    })

    await initTheme('dark')
    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#202020')

    // Same timestamp: nothing newer to apply.
    await fireVisibility()
    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#202020')

    mockFileMonet({
      seed: '#1157CE',
      ts: 200,
      palette: {
        light: { '--md-sys-color-primary': '#303030' },
        dark: { '--md-sys-color-primary': '#404040' },
      },
    })
    await fireVisibility()

    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#404040')
  })

  it('ignores visibility changes while hidden or on a fixed preset', async () => {
    cfgSet('theme_monet_switch', '1')
    const fetchMock = mockFileMonet({
      seed: '#1157CE',
      ts: 100,
      palette: {
        light: { '--md-sys-color-primary': '#101010' },
        dark: { '--md-sys-color-primary': '#202020' },
      },
    })
    await initTheme('dark')
    fetchMock.mockClear()

    setHidden(true)
    await fireVisibility()
    expect(fetchMock).not.toHaveBeenCalled()

    setHidden(false)
    applyPreset('blue')
    fetchMock.mockClear()
    await fireVisibility()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('monet data sources', () => {
  it('prefers a full palette from state over a newer seed-only file', async () => {
    mockFileMonet({ seed: '#aabbcc', ts: 50 })
    ;(window as any).__monetPromise = Promise.resolve({
      seed: '#112233',
      ts: 40,
      palette: {
        light: { '--md-sys-color-primary': '#aaaaaa' },
        dark: { '--md-sys-color-primary': '#bbbbbb' },
      },
    })
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#bbbbbb')
  })

  it('uses the newest seed-only payload', async () => {
    mockFileMonet({ seed: '#aabbcc', ts: 50 })
    ;(window as any).__monetPromise = Promise.resolve({ seed: '#112233', ts: 40 })
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(localStorage.getItem('monet_seed')).toBe('#aabbcc')
  })

  it('survives a rejected state promise and runs the extractor', async () => {
    ;(window as any).__monetPromise = Promise.reject(new Error('state failed'))
    mockScriptData({ seed: '#26818b', ts: 9, palette: null })
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(localStorage.getItem('monet_seed')).toBe('#26818b')
  })

  it('falls back to blue when state is not a promise and the file fetch fails', async () => {
    ;(window as any).__monetPromise = 42
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(getCurrentMappedPreset()).toBe('blue')
    expect(document.documentElement.getAttribute('data-theme-preset')).toBe('monet')
  })

  it('skips the extractor when the module dir is unavailable', async () => {
    vi.mocked(getModuleDir).mockReturnValue('')
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(getCurrentMappedPreset()).toBe('blue')
    expect(getPresetColors('blue', true)).toBeTruthy()
  })

  it('falls back to blue when the extractor rejects', async () => {
    vi.mocked(exec).mockImplementation(async (command: string) => {
      if (command.includes('monet.sh')) throw new Error('exec failed')
      return { code: 0, stdout: '', stderr: '' }
    })
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(getCurrentMappedPreset()).toBe('blue')
  })

  it('falls back to blue when the extractor prints invalid JSON', async () => {
    mockScript('not json\n')
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(getCurrentMappedPreset()).toBe('blue')
  })

  it('reads the last JSON line and lowercases the seed', async () => {
    mockScript('warning: something\n{"seed":"#AABBCC"}\n')
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(localStorage.getItem('monet_seed')).toBe('#aabbcc')
  })

  it('rejects a payload with an invalid seed and palette', async () => {
    mockScriptData({ seed: 'oops', palette: { light: 'nope', dark: {} } })
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(localStorage.getItem('monet_seed')).toBeNull()
    expect(getCurrentMappedPreset()).toBe('blue')
  })

  it('accepts a valid seed even when the palette is malformed', async () => {
    mockScriptData({ seed: '#AABBCC', palette: { light: 'nope', dark: {} } })
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(localStorage.getItem('monet_seed')).toBe('#aabbcc')
  })

  it('converts ARGB values and skips non-token entries', async () => {
    mockScriptData({
      seed: '#1157CE',
      ts: 12,
      palette: {
        light: { '--md-sys-color-primary': '#80abcdef' },
        dark: {
          '--md-sys-color-primary': '#80abcdef',
          other: '#ffffff',
          '--md-sys-color-secondary': 7,
        },
      },
    })
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#abcdef')
    expect(document.documentElement.style.getPropertyValue('--md-sys-color-secondary')).toBe('')
    expect(document.documentElement.style.getPropertyValue('other')).toBe('')
  })

  it('keeps the palette when localStorage writes throw', async () => {
    mockScriptData({
      seed: '#1157CE',
      ts: 13,
      palette: {
        light: { '--md-sys-color-primary': '#111111' },
        dark: { '--md-sys-color-primary': '#222222' },
      },
    })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    cfgSet('theme_monet_switch', '1')

    await expect(initTheme('dark')).resolves.toBeUndefined()
    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#222222')
  })

  it('reuses the cached seed when no source has data anymore', async () => {
    mockScriptData({ seed: '#26818b', ts: 1, palette: null })
    cfgSet('theme_monet_switch', '1')
    await initTheme('dark')
    expect(localStorage.getItem('monet_seed')).toBe('#26818b')

    mockFileFailure()
    delete (window as any).__monetPromise
    mockScript('')
    await initTheme('dark')

    expect(localStorage.getItem('monet_seed')).toBe('#26818b')
    expect(getCurrentMappedPreset()).not.toBe('monet')
  })

  it('loads a file payload with a seed and palette', async () => {
    mockFileMonet({
      seed: '#1157CE',
      ts: 90,
      palette: {
        light: { '--md-sys-color-primary': '#121212' },
        dark: { '--md-sys-color-primary': '#343434' },
      },
    })
    cfgSet('theme_monet_switch', '1')

    await initTheme('dark')

    expect(document.documentElement.style.getPropertyValue('--md-sys-color-primary')).toBe('#343434')
  })
})

describe('system colour scheme listener', () => {
  it('re-applies auto mode when the preference changes', async () => {
    const mm = stubMatchMedia(false)
    cfgSet('theme_monet_switch', '0')
    cfgSet('theme_preset', 'blue')
    cfgSet('theme_fixed_preset', 'blue')
    await initTheme('light')

    const listener = mm.listeners.at(-1)!
    expect(listener).toBeTypeOf('function')

    document.documentElement.setAttribute('data-theme', 'dark')
    listener({ matches: true } as MediaQueryListEvent)
    expect(document.documentElement.getAttribute('data-theme-resolved')).toBe('light')

    document.documentElement.setAttribute('data-theme', 'auto')
    mm.mql.matches = true
    listener({ matches: true } as MediaQueryListEvent)
    expect(document.documentElement.getAttribute('data-theme-resolved')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    mm.mql.matches = false
    listener({ matches: false } as MediaQueryListEvent)
    expect(document.documentElement.getAttribute('data-theme-resolved')).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('replaces listeners instead of stacking them when initTheme runs again', async () => {
    const mm = stubMatchMedia(false)
    cfgSet('theme_monet_switch', '0')
    cfgSet('theme_preset', 'blue')
    cfgSet('theme_fixed_preset', 'blue')

    await initTheme('light')
    const firstModeListener = mm.listeners.at(-1)!
    const firstVisibility = docListeners
      .filter(([type]) => type === 'visibilitychange')
      .at(-1)![1]
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    await initTheme('light')

    expect(mm.mql.removeEventListener).toHaveBeenCalledWith('change', firstModeListener)
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', firstVisibility)
    expect(mm.listeners.at(-1)).not.toBe(firstModeListener)
  })
})
