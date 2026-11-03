// Minimal CAM16 hue/chroma for sRGB. Replaces ~95 KB of
// material-color-utilities for one palette lookup; hct.test.ts verifies it.

const WHITE_POINT_D65 = [95.047, 100.0, 108.883] as const;

function labInvf(ft: number): number {
  const e = 216.0 / 24389.0;
  const kappa = 24389.0 / 27.0;
  const ft3 = ft * ft * ft;
  return ft3 > e ? ft3 : (116.0 * ft - 16.0) / kappa;
}

function yFromLstar(lstar: number): number {
  return 100.0 * labInvf((lstar + 16.0) / 116.0);
}

function linearized(rgbComponent: number): number {
  const normalized = rgbComponent / 255.0;
  return normalized <= 0.040449936
    ? (normalized / 12.92) * 100.0
    : Math.pow((normalized + 0.055) / 1.055, 2.4) * 100.0;
}

function signum(num: number): number {
  return num < 0 ? -1 : num === 0 ? 0 : 1;
}

// ViewingConditions.make() defaults (D65, 200 lux, L*=50, average surround).
const [XW, YW, ZW] = WHITE_POINT_D65;
const RW = XW * 0.401288 + YW * 0.650173 + ZW * -0.051461;
const GW = XW * -0.250268 + YW * 1.204414 + ZW * 0.045854;
const BW = XW * -0.002079 + YW * 0.048952 + ZW * 0.953127;

const SURROUND = 2.0;
const F = 0.8 + SURROUND / 10.0;
const C = F >= 0.9
  ? 0.59 + (0.69 - 0.59) * ((F - 0.9) * 10.0)
  : 0.525 + (0.59 - 0.525) * ((F - 0.8) * 10.0);
const ADAPTING_LUMINANCE = ((200.0 / Math.PI) * yFromLstar(50.0)) / 100.0;
const D = (() => {
  const raw = F * (1.0 - (1.0 / 3.6) * Math.exp((-ADAPTING_LUMINANCE - 42.0) / 92.0));
  return raw > 1.0 ? 1.0 : raw < 0.0 ? 0.0 : raw;
})();
const NC = F;
const RGB_D = [
  D * (100.0 / RW) + 1.0 - D,
  D * (100.0 / GW) + 1.0 - D,
  D * (100.0 / BW) + 1.0 - D,
] as const;
const K = 1.0 / (5.0 * ADAPTING_LUMINANCE + 1.0);
const K4 = K * K * K * K;
const K4F = 1.0 - K4;
const FL = K4 * ADAPTING_LUMINANCE + 0.1 * K4F * K4F * Math.cbrt(5.0 * ADAPTING_LUMINANCE);
const N = yFromLstar(50.0) / YW;
const Z = 1.48 + Math.sqrt(N);
const NBB = 0.725 / Math.pow(N, 0.2);
const NCB = NBB;
const RGB_A_FACTORS = [
  Math.pow((FL * RGB_D[0] * RW) / 100.0, 0.42),
  Math.pow((FL * RGB_D[1] * GW) / 100.0, 0.42),
  Math.pow((FL * RGB_D[2] * BW) / 100.0, 0.42),
] as const;
const RGB_A = [
  (400.0 * RGB_A_FACTORS[0]) / (RGB_A_FACTORS[0] + 27.13),
  (400.0 * RGB_A_FACTORS[1]) / (RGB_A_FACTORS[1] + 27.13),
  (400.0 * RGB_A_FACTORS[2]) / (RGB_A_FACTORS[2] + 27.13),
] as const;
const AW = (2.0 * RGB_A[0] + RGB_A[1] + 0.05 * RGB_A[2]) * NBB;

/** Return the CAM16 hue (degrees) and chroma of an sRGB ARGB colour. */
export function hctHueChroma(argb: number): { hue: number; chroma: number } {
  const red = (argb & 0x00ff0000) >> 16;
  const green = (argb & 0x0000ff00) >> 8;
  const blue = argb & 0x000000ff;

  const redL = linearized(red);
  const greenL = linearized(green);
  const blueL = linearized(blue);

  const x = 0.41233895 * redL + 0.35762064 * greenL + 0.18051042 * blueL;
  const y = 0.2126 * redL + 0.7152 * greenL + 0.0722 * blueL;
  const z = 0.01932141 * redL + 0.11916382 * greenL + 0.95034478 * blueL;

  const rC = 0.401288 * x + 0.650173 * y - 0.051461 * z;
  const gC = -0.250268 * x + 1.204414 * y + 0.045854 * z;
  const bC = -0.002079 * x + 0.048952 * y + 0.953127 * z;

  const rD = RGB_D[0] * rC;
  const gD = RGB_D[1] * gC;
  const bD = RGB_D[2] * bC;

  const rAF = Math.pow((FL * Math.abs(rD)) / 100.0, 0.42);
  const gAF = Math.pow((FL * Math.abs(gD)) / 100.0, 0.42);
  const bAF = Math.pow((FL * Math.abs(bD)) / 100.0, 0.42);

  const rA = (signum(rD) * 400.0 * rAF) / (rAF + 27.13);
  const gA = (signum(gD) * 400.0 * gAF) / (gAF + 27.13);
  const bA = (signum(bD) * 400.0 * bAF) / (bAF + 27.13);

  const a = (11.0 * rA + -12.0 * gA + bA) / 11.0;
  const b = (rA + gA - 2.0 * bA) / 9.0;
  const u = (20.0 * rA + 20.0 * gA + 21.0 * bA) / 20.0;
  const p2 = (40.0 * rA + 20.0 * gA + bA) / 20.0;

  let hue = ((Math.atan2(b, a) * 180.0) / Math.PI) % 360.0;
  if (hue < 0) hue += 360.0;

  const ac = p2 * NBB;
  const j = 100.0 * Math.pow(ac / AW, C * Z);
  const huePrime = hue < 20.14 ? hue + 360.0 : hue;
  const eHue = 0.25 * (Math.cos((huePrime * Math.PI) / 180.0 + 2.0) + 3.8);
  const p1 = (50000.0 / 13.0) * eHue * NC * NCB;
  const t = (p1 * Math.sqrt(a * a + b * b)) / (u + 0.305);
  const alpha = Math.pow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, N), 0.73);
  const chroma = alpha * Math.sqrt(j / 100.0);

  return { hue, chroma };
}
