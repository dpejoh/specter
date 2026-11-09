import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { wireSwipeNavigation, type SwipeControllerOptions } from './swipe-controller.js'
import type { PageId } from './page-loader.js'

const PAGE_IDS: readonly PageId[] = ['home-page', 'tools-page', 'control-page', 'settings-page']

type ListenerRecord = [string, EventListenerOrEventListenerObject, AddEventListenerOptions | boolean | undefined]

let track: HTMLElement
let listeners: ListenerRecord[]

function makeOptions(overrides: Partial<SwipeControllerOptions> = {}): SwipeControllerOptions {
  const navTabs = PAGE_IDS.map(() => document.createElement('div'))
  return {
    navTabs,
    track,
    pageIds: PAGE_IDS,
    getCurrentIndex: () => 0,
    isRTL: () => false,
    isPagePending: () => false,
    setPageLoading: vi.fn(),
    updatePageSuppression: vi.fn(),
    setTrackPosition: vi.fn(),
    setIndicatorProgress: vi.fn(),
    activateIndex: vi.fn(),
    ...overrides,
  }
}

function startTouch(x: number, y: number, target: EventTarget = document, touchCount = 1): TouchEvent {
  const touches = Array.from({ length: touchCount }, () => ({ clientX: x, clientY: y })) as unknown as Touch[]
  const event = new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches })
  target.dispatchEvent(event)
  return event
}

function moveTouch(
  x: number,
  y: number,
  { cancelable = true, touchCount = 1 }: { cancelable?: boolean; touchCount?: number } = {},
): TouchEvent {
  const touches = Array.from({ length: touchCount }, () => ({ clientX: x, clientY: y })) as unknown as Touch[]
  const event = new TouchEvent('touchmove', { bubbles: true, cancelable, touches })
  document.dispatchEvent(event)
  return event
}

function endTouch(
  x: number,
  y: number,
  { type = 'touchend', changed = true }: { type?: 'touchend' | 'touchcancel'; changed?: boolean } = {},
): TouchEvent {
  const changedTouches = changed ? ([{ clientX: x, clientY: y }] as unknown as Touch[]) : []
  const event = new TouchEvent(type, { bubbles: true, changedTouches })
  document.dispatchEvent(event)
  return event
}

/** Start a gesture at `fromX`, move to `toX` and finish after `elapsedMs`. */
function gesture(
  fromX: number,
  toX: number,
  { elapsedMs = 1000, type = 'touchend' as 'touchend' | 'touchcancel' } = {},
): TouchEvent {
  let now = 1000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  startTouch(fromX, 200)
  moveTouch(toX, 200)
  now += elapsedMs
  return endTouch(toX, 200, { type })
}

beforeEach(() => {
  document.body.innerHTML = '<div id="pages"></div>'
  track = document.getElementById('pages')!
  // happy-dom exposes a configurable innerWidth; pin it so assertions on the
  // viewport share are deterministic.
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1000 })
  delete (window as unknown as Record<string, unknown>).isOverlayOpen

  listeners = []
  const originalAdd = document.addEventListener.bind(document)
  vi.spyOn(document, 'addEventListener').mockImplementation(
    (type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
      listeners.push([type, listener, options])
      originalAdd(type, listener, options)
    },
  )
})

afterEach(() => {
  for (const [type, listener, options] of listeners) {
    document.removeEventListener(type, listener, options)
  }
  vi.restoreAllMocks()
  delete (window as unknown as Record<string, unknown>).isOverlayOpen
})

describe('touchstart guards', () => {
  it('ignores multi-touch, overlays, open dialogs and editable targets', () => {
    wireSwipeNavigation(makeOptions())

    startTouch(100, 100, document, 2)
    expect(track.classList.contains('is-swiping')).toBe(false)

    ;(window as unknown as Record<string, unknown>).isOverlayOpen = true
    startTouch(100, 100)
    expect(track.classList.contains('is-swiping')).toBe(false)
    delete (window as unknown as Record<string, unknown>).isOverlayOpen

    const dialog = document.createElement('md-dialog')
    dialog.setAttribute('open', '')
    document.body.appendChild(dialog)
    startTouch(100, 100)
    expect(track.classList.contains('is-swiping')).toBe(false)
    dialog.remove()

    const input = document.createElement('input')
    document.body.appendChild(input)
    startTouch(100, 100, input)
    expect(track.classList.contains('is-swiping')).toBe(false)
    input.remove()

    startTouch(100, 100)
    expect(track.classList.contains('is-swiping')).toBe(true)
  })

  it('ignores a code block target', () => {
    wireSwipeNavigation(makeOptions())
    const code = document.createElement('code')
    document.body.appendChild(code)
    startTouch(100, 100, code)
    expect(track.classList.contains('is-swiping')).toBe(false)
  })
})

describe('touchmove intent', () => {
  it('ignores moves before a start and multi-touch moves', () => {
    const options = makeOptions()
    wireSwipeNavigation(options)

    moveTouch(50, 50)
    expect(options.setTrackPosition).not.toHaveBeenCalled()

    startTouch(100, 100)
    moveTouch(50, 50, { touchCount: 2 })
    expect(options.setTrackPosition).not.toHaveBeenCalled()
    expect(options.updatePageSuppression).not.toHaveBeenCalled()
  })

  it('classifies a mostly vertical move as a scroll and stops handling the gesture', () => {
    const options = makeOptions()
    wireSwipeNavigation(options)

    startTouch(100, 100)
    moveTouch(104, 160)
    expect(options.setTrackPosition).not.toHaveBeenCalled()

    // Once scrolling, later horizontal moves are ignored too.
    moveTouch(20, 160)
    expect(options.setTrackPosition).not.toHaveBeenCalled()

    endTouch(20, 160)
    expect(track.classList.contains('is-swiping')).toBe(false)
    expect(options.activateIndex).not.toHaveBeenCalled()
  })

  it('starts a drag, reveals neighbours and requests pending page loading once', () => {
    const isPagePending = vi.fn(() => true)
    const options = makeOptions({ getCurrentIndex: () => 1, isPagePending })
    wireSwipeNavigation(options)

    startTouch(300, 200)
    const move = moveTouch(250, 200)

    expect(move.defaultPrevented).toBe(true)
    expect(options.updatePageSuppression).toHaveBeenCalledWith(1, true)
    expect(options.setPageLoading).toHaveBeenNthCalledWith(1, 'control-page', true)
    expect(options.setPageLoading).toHaveBeenNthCalledWith(2, 'home-page', true)
    expect(options.setTrackPosition).toHaveBeenCalledWith(1, false, -50, 1000)
    expect(options.setIndicatorProgress).toHaveBeenCalledWith(1, 2, 0.05)

    // Subsequent moves reuse the revealed pages.
    moveTouch(240, 200)
    expect(options.updatePageSuppression).toHaveBeenCalledTimes(1)
    expect(options.setPageLoading).toHaveBeenCalledTimes(2)
  })

  it('does not prevent default when the move event is not cancelable', () => {
    const options = makeOptions()
    wireSwipeNavigation(options)

    startTouch(300, 200)
    const move = moveTouch(250, 200, { cancelable: false })
    expect(move.defaultPrevented).toBe(false)
    expect(options.setTrackPosition).toHaveBeenCalled()
  })

  it('skips indicator updates when the target tab does not exist', () => {
    const options = makeOptions({ navTabs: [document.createElement('div')] })
    wireSwipeNavigation(options)

    startTouch(300, 200)
    moveTouch(250, 200)

    expect(options.setTrackPosition).toHaveBeenCalled()
    expect(options.setIndicatorProgress).not.toHaveBeenCalled()
  })
})

describe('drag offset and indicators', () => {
  it('tracks the drag offset from the first page with rubber-band resistance', () => {
    const options = makeOptions({ getCurrentIndex: () => 0 })
    wireSwipeNavigation(options)

    startTouch(300, 200)
    moveTouch(400, 200)

    // Pulling back from the first page is damped to 35%.
    expect(options.setTrackPosition).toHaveBeenCalledWith(0, false, 35, 1000)
    // The target would be index -1, so the indicator is left alone.
    expect(options.setIndicatorProgress).not.toHaveBeenCalled()
  })

  it('tracks the drag offset from the last page towards the previous one', () => {
    const options = makeOptions({ getCurrentIndex: () => 3 })
    wireSwipeNavigation(options)

    startTouch(300, 200)
    moveTouch(400, 200)

    expect(options.setTrackPosition).toHaveBeenCalledWith(3, false, 100, 1000)
    expect(options.setIndicatorProgress).toHaveBeenCalledWith(3, 2, 0.1)
  })

  it('applies rubber-band resistance past the last page', () => {
    const options = makeOptions({ getCurrentIndex: () => 3 })
    wireSwipeNavigation(options)

    startTouch(300, 200)
    moveTouch(200, 200)

    expect(options.setTrackPosition).toHaveBeenCalledWith(3, false, -35, 1000)
    // There is no page 4 to show progress towards.
    expect(options.setIndicatorProgress).not.toHaveBeenCalled()
  })

  it('clamps indicator progress to one when dragging far past the next page', () => {
    const options = makeOptions({ getCurrentIndex: () => 0 })
    wireSwipeNavigation(options)

    startTouch(300, 200)
    moveTouch(-1700, 200)

    expect(options.setTrackPosition).toHaveBeenCalledWith(0, false, -2000, 1000)
    expect(options.setIndicatorProgress).toHaveBeenCalledWith(0, 1, 1)
  })

  it('uses RTL drag direction for the next and previous target', () => {
    const options = makeOptions({ getCurrentIndex: () => 1, isRTL: () => true })
    wireSwipeNavigation(options)

    startTouch(300, 200)
    moveTouch(400, 200)
    expect(options.setTrackPosition).toHaveBeenLastCalledWith(1, false, 100, 1000)
    expect(options.setIndicatorProgress).toHaveBeenLastCalledWith(1, 2, 0.1)

    moveTouch(200, 200)
    expect(options.setTrackPosition).toHaveBeenLastCalledWith(1, false, -100, 1000)
    expect(options.setIndicatorProgress).toHaveBeenLastCalledWith(1, 0, 0.1)
  })

  it('applies RTL edge resistance at the first and last pages', () => {
    let current = 3
    const options = makeOptions({ getCurrentIndex: () => current, isRTL: () => true })
    wireSwipeNavigation(options)

    startTouch(300, 200)
    moveTouch(400, 200)
    expect(options.setTrackPosition).toHaveBeenLastCalledWith(3, false, 35, 1000)

    current = 0
    startTouch(300, 200)
    moveTouch(200, 200)
    expect(options.setTrackPosition).toHaveBeenLastCalledWith(0, false, -35, 1000)
  })
})

describe('commit on touch end', () => {
  it('commits to the next page past the distance threshold', () => {
    const options = makeOptions({ getCurrentIndex: () => 0 })
    wireSwipeNavigation(options)

    gesture(500, 200)

    expect(options.activateIndex).toHaveBeenCalledWith(1, true)
    expect(track.classList.contains('is-swiping')).toBe(false)
  })

  it('commits to the previous page when dragging the other way', () => {
    const options = makeOptions({ getCurrentIndex: () => 1 })
    wireSwipeNavigation(options)

    gesture(200, 500)

    expect(options.activateIndex).toHaveBeenCalledWith(0, true)
  })

  it('stays on edge pages when there is no neighbour in the drag direction', () => {
    let current = 0
    const options = makeOptions({ getCurrentIndex: () => current })
    wireSwipeNavigation(options)

    // First page, dragging towards the previous page.
    gesture(200, 500)
    expect(options.activateIndex).toHaveBeenLastCalledWith(0, true)

    // Last page, dragging towards the next page.
    current = 3
    gesture(500, 200)
    expect(options.activateIndex).toHaveBeenLastCalledWith(3, true)
  })

  it('commits on a fast flick even when the distance is small', () => {
    const options = makeOptions({ getCurrentIndex: () => 0 })
    wireSwipeNavigation(options)

    gesture(500, 480, { elapsedMs: 10 })

    expect(options.activateIndex).toHaveBeenCalledWith(1, true)
  })

  it('stays put on a short, slow drag', () => {
    const options = makeOptions({ getCurrentIndex: () => 0 })
    wireSwipeNavigation(options)

    gesture(500, 480, { elapsedMs: 2000 })

    expect(options.activateIndex).toHaveBeenCalledWith(0, true)
  })

  it('uses RTL direction to commit next and previous', () => {
    let current = 1
    const options = makeOptions({ getCurrentIndex: () => current, isRTL: () => true })
    wireSwipeNavigation(options)

    gesture(200, 500)
    expect(options.activateIndex).toHaveBeenLastCalledWith(2, true)

    current = 1
    gesture(500, 200)
    expect(options.activateIndex).toHaveBeenLastCalledWith(0, true)
  })

  it('does not activate when the gesture never became a drag', () => {
    const options = makeOptions()
    wireSwipeNavigation(options)

    startTouch(500, 200)
    endTouch(200, 200)

    expect(options.activateIndex).not.toHaveBeenCalled()
    expect(track.classList.contains('is-swiping')).toBe(false)
  })

  it('does not activate when the end event has no changed touch', () => {
    const options = makeOptions()
    wireSwipeNavigation(options)

    startTouch(500, 200)
    moveTouch(200, 200)
    endTouch(200, 200, { changed: false })

    expect(options.activateIndex).not.toHaveBeenCalled()
    expect(track.classList.contains('is-swiping')).toBe(false)
  })
})

describe('cancel on touch cancel', () => {
  it('snaps back to the current page without committing', () => {
    const options = makeOptions({ getCurrentIndex: () => 0 })
    wireSwipeNavigation(options)

    // Long enough to commit if the gesture had ended normally.
    gesture(500, 200, { type: 'touchcancel' })

    expect(options.activateIndex).not.toHaveBeenCalled()
    expect(track.classList.contains('is-swiping')).toBe(false)
    expect(options.updatePageSuppression).toHaveBeenLastCalledWith(0, false)
    expect(options.setTrackPosition).toHaveBeenLastCalledWith(0, true)
    expect(options.setIndicatorProgress).toHaveBeenLastCalledWith(0, 0, 0)
  })

  it('does not touch the track when the gesture never became a drag', () => {
    const options = makeOptions()
    wireSwipeNavigation(options)

    startTouch(500, 200)
    endTouch(200, 200, { type: 'touchcancel' })

    expect(options.activateIndex).not.toHaveBeenCalled()
    expect(options.setTrackPosition).not.toHaveBeenCalled()
    expect(options.setIndicatorProgress).not.toHaveBeenCalled()
  })
})
