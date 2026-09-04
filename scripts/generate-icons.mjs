/**
 * Generates HandyCap's app icons as real PNGs, with no image dependencies.
 *
 * The mark is a flagstick and ball drawn from primitives, supersampled 4x for
 * smooth edges. Content stays inside the central 80% so the icon survives the
 * circular and squircle masks Android and iOS apply.
 */
import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { Buffer } from 'node:buffer'

const GROUND = [0x0a, 0x0f, 0x0c]
const SIGNAL = [0x6e, 0xe7, 0x87]
const INK = [0xed, 0xf2, 0xee]

const SAMPLES = 4

/** Normalised geometry, all within the central 80% safe zone. */
const POLE = { x0: 0.442, x1: 0.478, y0: 0.2, y1: 0.8 }
const PENNANT = [
  [0.478, 0.212],
  [0.478, 0.424],
  [0.756, 0.318],
]
const BALL = { cx: 0.35, cy: 0.752, r: 0.058 }

const inRect = (x, y, r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1
const inCircle = (x, y, c) => (x - c.cx) ** 2 + (y - c.cy) ** 2 <= c.r ** 2

function inTriangle(x, y, [a, b, c]) {
  const sign = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])
  const d1 = sign([x, y], a, b)
  const d2 = sign([x, y], b, c)
  const d3 = sign([x, y], c, a)
  const negative = d1 < 0 || d2 < 0 || d3 < 0
  const positive = d1 > 0 || d2 > 0 || d3 > 0
  return !(negative && positive)
}

function colorAt(x, y) {
  if (inTriangle(x, y, PENNANT)) return SIGNAL
  if (inRect(x, y, POLE)) return INK
  if (inCircle(x, y, BALL)) return INK
  return null
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const step = 1 / (size * SAMPLES)

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px * SAMPLES + sx + 0.5) * step
          const y = (py * SAMPLES + sy + 0.5) * step
          const color = colorAt(x, y) ?? GROUND
          r += color[0]
          g += color[1]
          b += color[2]
        }
      }
      const total = SAMPLES * SAMPLES
      const offset = (py * size + px) * 4
      pixels[offset] = Math.round(r / total)
      pixels[offset + 1] = Math.round(g / total)
      pixels[offset + 2] = Math.round(b / total)
      pixels[offset + 3] = 255
    }
  }
  return pixels
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

function toPng(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  // Each scanline is prefixed with filter type 0 (none).
  const stride = size * 4
  const raw = Buffer.alloc(size * (stride + 1))
  for (let row = 0; row < size; row++) {
    raw[row * (stride + 1)] = 0
    pixels.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
for (const [size, name] of [
  [32, 'favicon-32.png'],
  [180, 'apple-touch-icon.png'],
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
]) {
  const file = `public/${name}`
  writeFileSync(file, toPng(size, render(size)))
  console.log(`wrote ${file} (${size}x${size})`)
}
