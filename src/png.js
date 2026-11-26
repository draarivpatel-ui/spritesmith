import { PALETTE, hexToRgb, isValidPaletteIndex } from './palette.js';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function ascii(text) {
  return Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
}

function u32be(value) {
  return Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function pngChunk(type, data = new Uint8Array()) {
  if (!/^[A-Za-z]{4}$/.test(type)) throw new TypeError('PNG chunk type must be four ASCII letters');
  const typeBytes = ascii(type);
  const crcInput = concat([typeBytes, data]);
  return concat([u32be(data.length), typeBytes, data, u32be(crc32(crcInput))]);
}

export function zlibStore(data) {
  if (!(data instanceof Uint8Array)) throw new TypeError('zlib input must be a Uint8Array');
  const blocks = [];
  for (let at = 0; at < Math.max(1, data.length); at += 65535) {
    const slice = data.subarray(at, Math.min(data.length, at + 65535));
    const final = at + 65535 >= data.length ? 1 : 0;
    const len = slice.length;
    blocks.push(Uint8Array.from([final, len & 255, (len >>> 8) & 255, (~len) & 255, ((~len) >>> 8) & 255]));
    blocks.push(slice);
    if (data.length === 0) break;
  }
  return concat([
    Uint8Array.from([0x78, 0x01]),
    ...blocks,
    u32be(adler32(data)),
  ]);
}

export function encodeIndexedPng(width, height, pixels, palette = PALETTE) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new TypeError('PNG dimensions must be positive integers');
  }
  if (!(pixels instanceof Uint8Array) || pixels.length !== width * height) {
    throw new TypeError('PNG pixels must be a Uint8Array matching width times height');
  }
  if (!Array.isArray(palette) && !(palette instanceof Object) || palette.length !== 16) {
    throw new TypeError('PNG encoder needs the fixed 16-slot palette');
  }
  for (const value of pixels) {
    if (!isValidPaletteIndex(value)) throw new RangeError(`pixel index ${value} is outside the fixed palette`);
  }

  const scanlines = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width + 1);
    scanlines[rowStart] = 0;
    scanlines.set(pixels.subarray(y * width, (y + 1) * width), rowStart + 1);
  }

  const ihdr = concat([
    u32be(width),
    u32be(height),
    Uint8Array.from([8, 3, 0, 0, 0]),
  ]);
  const plte = new Uint8Array(16 * 3);
  const trns = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    const [r, g, b] = hexToRgb(palette[index].hex);
    plte[index * 3] = r;
    plte[index * 3 + 1] = g;
    plte[index * 3 + 2] = b;
    trns[index] = palette[index].alpha;
  }

  return concat([
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('PLTE', plte),
    pngChunk('tRNS', trns),
    pngChunk('IDAT', zlibStore(scanlines)),
    pngChunk('IEND'),
  ]);
}
