// Génère les icônes PNG de la PWA : épingle blanche sur fond bleu #007AFF, sans dépendance.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(OUT, { recursive: true })

const BG = [0, 122, 255]
const FG = [255, 255, 255]

function pointInPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inRoundedRect(x, y, s, r) {
  if (x < 0 || y < 0 || x > s || y > s) return false
  const cx = Math.min(Math.max(x, r), s - r)
  const cy = Math.min(Math.max(y, r), s - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

// Épingle (repère 512) : tête = anneau centré (256, 216), pointe en (256, 420).
function inPin(x, y) {
  const d = Math.hypot(x - 256, y - 216)
  if (d <= 112) return d > 44
  return pointInPolygon(x, y, [[160, 262], [352, 262], [256, 420]])
}

function colorAt(x, y, variant) {
  let sx = x
  let sy = y
  let bg
  if (variant === 'full') {
    bg = [...BG, 255]
    sx = (x - 256) / 0.8 + 256 // zone de sécurité maskable / iOS
    sy = (y - 256) / 0.8 + 256
  } else {
    bg = inRoundedRect(x, y, 512, 112) ? [...BG, 255] : [0, 0, 0, 0]
  }
  return bg[3] && inPin(sx, sy) ? [...FG, 255] : bg
}

function render(size, variant) {
  const S = 3
  const data = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0]
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const c = colorAt(((px + (i + 0.5) / S) * 512) / size, ((py + (j + 0.5) / S) * 512) / size, variant)
          for (let k = 0; k < 4; k++) acc[k] += c[k]
        }
      }
      const idx = (py * size + px) * 4
      for (let k = 0; k < 4; k++) data[idx + k] = Math.round(acc[k] / (S * S))
    }
  }
  return data
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [file, size, variant] of [
  ['pwa-192.png', 192, 'rounded'],
  ['pwa-512.png', 512, 'rounded'],
  ['maskable-512.png', 512, 'full'],
  ['apple-touch-icon.png', 180, 'full'],
]) {
  writeFileSync(join(OUT, file), png(size, render(size, variant)))
  console.log(`✓ ${file}`)
}
