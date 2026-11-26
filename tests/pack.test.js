import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasJson, gridColumnsFor, makeAtlas, packSpriteSheet, sheetLayoutMath } from '../src/pack.js';
import { createFrame, setPixel } from '../src/sprite.js';

function frame(width = 16, height = 16, color = 0, id = 'frame') {
  const out = createFrame(width, height, { id, name: id, durationMs: 125 });
  if (color) out.pixels.fill(color);
  return out;
}

test('horizontal sheet math is exact without padding', () => {
  const math = sheetLayoutMath(16, 16, 4, { layout: 'horizontal', padding: 0 });
  assert.equal(math.width, 64);
  assert.equal(math.height, 16);
  assert.equal(math.columns, 4);
  assert.equal(math.rows, 1);
});

test('horizontal sheet math includes padding exactly once between frames', () => {
  const math = sheetLayoutMath(16, 16, 4, { layout: 'horizontal', padding: 1 });
  assert.equal(math.width, 67);
  assert.equal(math.height, 16);
});

test('horizontal packing positions and copies frames exactly', () => {
  const frames = [1, 2, 3, 4].map((n) => frame(16, 16, n, `f${n}`));
  const sheet = packSpriteSheet(frames, { layout: 'horizontal' });
  assert.equal(sheet.width, 64);
  assert.equal(sheet.height, 16);
  assert.deepEqual(sheet.rects.map((rect) => rect.x), [0, 16, 32, 48]);
  assert.deepEqual(sheet.rects.map((rect) => rect.y), [0, 0, 0, 0]);
  assert.equal(sheet.pixels[0], 1);
  assert.equal(sheet.pixels[16], 2);
  assert.equal(sheet.pixels[32], 3);
  assert.equal(sheet.pixels[48], 4);
  assert.equal(sheet.pixels[15 * 64 + 63], 4);
});

test('grid packing defaults to a square-ish column count', () => {
  assert.equal(gridColumnsFor(16, 4, null, 0), 2);
  assert.equal(gridColumnsFor(16, 5, null, 0), 3);
  const math = sheetLayoutMath(16, 16, 5, { layout: 'grid', padding: 0 });
  assert.equal(math.columns, 3);
  assert.equal(math.rows, 2);
  assert.equal(math.width, 48);
  assert.equal(math.height, 32);
});

test('grid packing honors max width and still uses integer pixel positions', () => {
  assert.equal(gridColumnsFor(16, 4, 40, 0), 2);
  assert.equal(gridColumnsFor(16, 4, 15, 0), 1);
  const frames = [1, 2, 3, 4].map((n) => frame(16, 16, n, `g${n}`));
  const sheet = packSpriteSheet(frames, { layout: 'grid', maxWidth: 40, padding: 0 });
  assert.equal(sheet.width, 32);
  assert.equal(sheet.height, 32);
  assert.deepEqual(sheet.rects.map(({ x, y }) => [x, y]), [[0, 0], [16, 0], [0, 16], [16, 16]]);
  assert.equal(sheet.pixels[0], 1);
  assert.equal(sheet.pixels[16], 2);
  assert.equal(sheet.pixels[16 * 32], 3);
  assert.equal(sheet.pixels[16 * 32 + 16], 4);
});

test('grid packing includes padding in positions and dimensions', () => {
  const frames = [1, 2, 3, 4].map((n) => frame(8, 8, n, `p${n}`));
  const sheet = packSpriteSheet(frames, { layout: 'grid', maxWidth: 17, padding: 1 });
  assert.equal(sheet.columns, 2);
  assert.equal(sheet.width, 17);
  assert.equal(sheet.height, 17);
  assert.deepEqual(sheet.rects.map(({ x, y }) => [x, y]), [[0, 0], [9, 0], [0, 9], [9, 9]]);
  assert.equal(sheet.pixels[8], 0);
  assert.equal(sheet.pixels[8 * 17], 0);
});

test('packing copies sparse source pixels without inversion', () => {
  const a = frame(8, 8, 0, 'a');
  const b = frame(8, 8, 0, 'b');
  setPixel(a, 2, 3, 9);
  setPixel(b, 4, 5, 12);
  const sheet = packSpriteSheet([a, b], { layout: 'horizontal' });
  assert.equal(sheet.pixels[3 * 16 + 2], 9);
  assert.equal(sheet.pixels[5 * 16 + 8 + 4], 12);
  assert.equal(sheet.pixels[3 * 16 + 8 + 2], 0);
});

test('packing rejects malformed layouts and frame sets', () => {
  assert.throws(() => packSpriteSheet([], { layout: 'horizontal' }), TypeError);
  assert.throws(() => packSpriteSheet([frame(8, 8), frame(16, 16)], { layout: 'horizontal' }), RangeError);
  assert.throws(() => packSpriteSheet([frame()], { layout: 'diagonal' }), RangeError);
  assert.throws(() => packSpriteSheet([frame()], { layout: 'grid', padding: -1 }), RangeError);
  assert.throws(() => packSpriteSheet([frame()], { layout: 'grid', maxWidth: 0 }), RangeError);
});

test('atlas JSON shape carries rects, durations, pivots, and honest export metadata', () => {
  const frames = [1, 2].map((n) => frame(16, 16, n, `a${n}`));
  frames[0].durationMs = 100;
  frames[1].durationMs = 150;
  frames[1].offsetX = 0.5;
  const sheet = packSpriteSheet(frames, { layout: 'horizontal' });
  const atlas = makeAtlas(sheet, frames, { imageName: 'walk.png', fps: 10 });
  assert.equal(atlas.meta.app, 'SpriteSmith');
  assert.equal(atlas.meta.image, 'walk.png');
  assert.equal(atlas.meta.gifExported, false);
  assert.equal(atlas.meta.offline, true);
  assert.deepEqual(atlas.size, { w: 32, h: 16 });
  assert.equal(atlas.layout, 'horizontal');
  assert.equal(atlas.fps, 10);
  assert.equal(atlas.frameCount, 2);
  assert.deepEqual(atlas.frames[0].frame, { x: 0, y: 0, w: 16, h: 16 });
  assert.deepEqual(atlas.frames[1].frame, { x: 16, y: 0, w: 16, h: 16 });
  assert.equal(atlas.frames[0].duration, 100);
  assert.equal(atlas.frames[1].duration, 150);
  assert.deepEqual(atlas.frames[1].pivot, { x: 0, y: 0 });
  const text = atlasJson(atlas);
  assert.equal(text.endsWith('\n'), true);
  assert.deepEqual(JSON.parse(text).frames.length, 2);
});

test('atlas generation rejects mismatched inputs', () => {
  const frames = [frame(16, 16, 1, 'one')];
  const sheet = packSpriteSheet(frames, { layout: 'horizontal' });
  assert.throws(() => makeAtlas(sheet, []), TypeError);
  assert.throws(() => makeAtlas(null, frames), TypeError);
});
