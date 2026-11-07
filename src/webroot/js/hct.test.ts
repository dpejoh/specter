import { describe, expect, it } from 'vitest'
import { Hct } from '@material/material-color-utilities'
import { hctHueChroma } from './hct.js'

const COLORS = [
  '#B3251E', '#9A4600', '#be9108', '#006C35', '#00687C',
  '#1157CE', '#7438D2', '#B60D6E', '#5E5E5E', '#000000',
  '#FFFFFF', '#A7B82C', '#FEF20F', '#D1A5D5', '#179583',
]

describe('hctHueChroma', () => {
  it('matches material-color-utilities for known colours', () => {
    for (const hex of COLORS) {
      const argb = (parseInt(hex.slice(1), 16) | 0xff000000) >>> 0
      const expected = Hct.fromInt(argb)
      const actual = hctHueChroma(argb)
      expect(actual.hue).toBeCloseTo(expected.hue, 8)
      expect(actual.chroma).toBeCloseTo(expected.chroma, 8)
    }
  })

  it('matches material-color-utilities for a deterministic colour sweep', () => {
    for (let i = 0; i < 256; i++) {
      const argb = ((i * 0x010307 + 0x112233) | 0xff000000) >>> 0
      const expected = Hct.fromInt(argb)
      const actual = hctHueChroma(argb)
      expect(actual.hue).toBeCloseTo(expected.hue, 8)
      expect(actual.chroma).toBeCloseTo(expected.chroma, 8)
    }
  })
})
