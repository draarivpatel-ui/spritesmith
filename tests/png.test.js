import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { adler32, crc32, encodeIndexedPng, pngChunk, zlibStore } from '../src/png.js';
import { PALETTE, hexToRgb } from '../src/palette.js';

function ascii(text) {
  return Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
}

function independentCrc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function readU32(bytes, at) {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function parseChunks(png) {
  const chunks = [];
  let at = 8;
  while (at < png.length) {
    const length = readU32(png, at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const dataStart = at + 8;
    const dataEnd = dataStart + length;
    chunks.push({ type, length, dataStart, dataEnd, crcStart: dataEnd, crc: readU32(png, dataEnd) });
    at = dataEnd + 4;
  }
  return chunks;
}

test('crc32 and adler32 match known vectors', () => {
  assert.equal(crc32(new Uint8Array()), 0);
  assert.equal(crc32(ascii('IEND')), 0xAE426082);
  assert.equal(adler32(new Uint8Array()), 1);
  assert.equal(adler32(ascii('abc')), 0x024D0127);
});

test('zlib stored blocks round trip through the real zlib decoder', () => {
  const input = Uint8Array.from({ length: 70000 }, (_, index) => index % 251);
  const compressed = zlibStore(input);
  assert.equal(compressed[0], 0x78);
  assert.equal(compressed[1], 0x01);
  assert.deepEqual(inflateSync(compressed), Buffer.from(input));
  assert.equal(compressed.length, input.length + 2 + 4 + 2 * 5);
});

test('png chunk serialization writes length type data and crc', () => {
  const chunk = pngChunk('tRNS', Uint8Array.from([0, 255]));
  assert.equal(readU32(chunk, 0), 2);
  assert.equal(String.fromCharCode(...chunk.subarray(4, 8)), 'tRNS');
  assert.equal(chunk[8], 0);
  assert.equal(chunk[9], 255);
  assert.equal(readU32(chunk, 10), independentCrc32(Uint8Array.from([...ascii('tRNS'), 0, 255])));
});

test('indexed PNG encoder emits the exact deterministic length for a blank 16x16 image', () => {
  const png = encodeIndexedPng(16, 16, new Uint8Array(256));
  assert.equal(png.length, 428);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('indexed PNG chunk order and image header are correct', () => {
  const pixels = new Uint8Array(16 * 16);
  pixels[0] = 7;
  const png = encodeIndexedPng(16, 16, pixels);
  const chunks = parseChunks(png);
  assert.deepEqual(chunks.map((chunk) => chunk.type), ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
  const ihdr = chunks[0];
  assert.equal(ihdr.length, 13);
  assert.equal(readU32(png, ihdr.dataStart), 16);
  assert.equal(readU32(png, ihdr.dataStart + 4), 16);
  assert.equal(png[ihdr.dataStart + 8], 8);
  assert.equal(png[ihdr.dataStart + 9], 3);
  assert.equal(png[ihdr.dataStart + 10], 0);
  assert.equal(png[ihdr.dataStart + 11], 0);
  assert.equal(png[ihdr.dataStart + 12], 0);
});

test('PLTE and tRNS chunks carry the fixed palette exactly', () => {
  const png = encodeIndexedPng(8, 8, new Uint8Array(64));
  const chunks = parseChunks(png);
  const plte = chunks.find((chunk) => chunk.type === 'PLTE');
  const trns = chunks.find((chunk) => chunk.type === 'tRNS');
  assert.equal(plte.length, 48);
  assert.equal(trns.length, 16);
  for (const index of [1, 7, 15]) {
    const [r, g, b] = hexToRgb(PALETTE[index].hex);
    assert.equal(png[plte.dataStart + index * 3], r);
    assert.equal(png[plte.dataStart + index * 3 + 1], g);
    assert.equal(png[plte.dataStart + index * 3 + 2], b);
  }
  assert.equal(png[trns.dataStart], 0);
  assert.equal(png[trns.dataStart + 1], 255);
  assert.equal(png[trns.dataStart + 15], 255);
});

test('IDAT inflates to filter-zero scanlines in row order', () => {
  const pixels = new Uint8Array(4 * 3);
  pixels[0] = 1;
  pixels[5] = 7;
  pixels[11] = 15;
  const png = encodeIndexedPng(4, 3, pixels);
  const idat = parseChunks(png).find((chunk) => chunk.type === 'IDAT');
  const raw = inflateSync(png.subarray(idat.dataStart, idat.dataEnd));
  assert.equal(raw.length, 3 * 5);
  assert.equal(raw[0], 0);
  assert.equal(raw[1], 1);
  assert.equal(raw[5], 0);
  assert.equal(raw[6 + 1], 7);
  assert.equal(raw[10 + 4], 15);
});

test('every PNG chunk CRC validates with an independent bit implementation', () => {
  const pixels = new Uint8Array(8 * 8);
  pixels[9] = 12;
  const png = encodeIndexedPng(8, 8, pixels);
  const chunks = parseChunks(png);
  assert.equal(chunks.length, 5);
  for (const chunk of chunks) {
    const crcInput = png.subarray(chunk.dataStart - 4, chunk.dataEnd);
    assert.equal(chunk.crc, independentCrc32(crcInput), chunk.type);
  }
  const iend = chunks.at(-1);
  assert.equal(iend.type, 'IEND');
  assert.equal(iend.crc, 0xAE426082);
});

test('PNG encoder rejects malformed dimensions, pixel data, and palette violations', () => {
  assert.throws(() => encodeIndexedPng(0, 8, new Uint8Array()), TypeError);
  assert.throws(() => encodeIndexedPng(8, 8, new Uint8Array(63)), TypeError);
  const bad = new Uint8Array(64);
  bad[0] = 99;
  assert.throws(() => encodeIndexedPng(8, 8, bad), RangeError);
  assert.throws(() => zlibStore([1, 2, 3]), TypeError);
  assert.throws(() => pngChunk('BAD'), TypeError);
});
