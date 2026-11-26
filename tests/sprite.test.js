import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, hexToRgb, isValidPaletteIndex, paletteAlphaValues, paletteRgbTriples } from '../src/palette.js';
import {
  GRID_SIZES,
  checkProjectConstraints,
  cloneFrame,
  countPaintedPixels,
  createFrame,
  createGridFrame,
  createHistory,
  createProject,
  floodFill,
  frameAtTime,
  frameDurations,
  getPixel,
  hydrateProject,
  normalizeFps,
  pushHistory,
  redoHistory,
  serializeProject,
  setPixel,
  timelineDuration,
  undoHistory,
  validateEmptyFrame,
  validateOffsets,
  validatePaletteUse,
  validateProject,
} from '../src/sprite.js';
import { makeWalkCycle } from '../src/sample.js';

test('fixed palette is exactly sixteen indexed slots', () => {
  assert.equal(PALETTE.length, 16);
  assert.equal(PALETTE[0].alpha, 0);
  assert.equal(PALETTE[15].name, 'Snow');
  assert.equal(new Set(PALETTE.map((entry) => entry.hex)).size, 16);
  assert.ok(PALETTE.every((entry, index) => entry.index === index));
  assert.ok(PALETTE.every((entry) => /^#[0-9A-F]{6}$/.test(entry.hex)));
  assert.equal(isValidPaletteIndex(0), true);
  assert.equal(isValidPaletteIndex(15), true);
  assert.equal(isValidPaletteIndex(16), false);
  assert.equal(isValidPaletteIndex(1.5), false);
});

test('palette conversion uses exact byte values', () => {
  assert.deepEqual(hexToRgb('#FFC53D'), [255, 197, 61]);
  assert.deepEqual(paletteRgbTriples()[9], [255, 197, 61]);
  assert.equal(paletteAlphaValues()[0], 0);
  assert.equal(paletteAlphaValues()[7], 255);
  assert.throws(() => hexToRgb('#12345'), TypeError);
});

test('grid sizes are constrained to 8, 16, and 32', () => {
  assert.deepEqual([...GRID_SIZES], [8, 16, 32]);
  const frame = createGridFrame(16, { durationMs: 100 });
  assert.equal(frame.width, 16);
  assert.equal(frame.height, 16);
  assert.equal(frame.pixels.length, 256);
  assert.equal(frame.durationMs, 100);
  assert.equal(countPaintedPixels(frame), 0);
  assert.throws(() => createGridFrame(24), RangeError);
});

test('frame creation rejects malformed dimensions and fills', () => {
  assert.throws(() => createFrame(0, 16), TypeError);
  assert.throws(() => createFrame(16, 2.5), TypeError);
  assert.throws(() => createFrame(16, 16, { fill: 16 }), RangeError);
  const filled = createFrame(8, 8, { fill: 7 });
  assert.equal(filled.pixels[0], 7);
  assert.equal(countPaintedPixels(filled), 64);
});

test('pixels round trip through integer coordinates only', () => {
  const frame = createGridFrame(8);
  setPixel(frame, 3, 4, 12);
  assert.equal(getPixel(frame, 3, 4), 12);
  assert.equal(getPixel(frame, 4, 3), 0);
  assert.throws(() => setPixel(frame, 8, 0, 1), RangeError);
  assert.throws(() => setPixel(frame, 0.5, 0, 1), RangeError);
  assert.throws(() => setPixel(frame, 0, 0, 99), RangeError);
});

test('cloned frames are independent copies', () => {
  const frame = createGridFrame(8);
  setPixel(frame, 1, 1, 5);
  const copy = cloneFrame(frame);
  setPixel(copy, 1, 1, 6);
  assert.equal(getPixel(frame, 1, 1), 5);
  assert.equal(getPixel(copy, 1, 1), 6);
});

test('flood fill changes only the connected region', () => {
  const frame = createGridFrame(8);
  for (let y = 0; y < 8; y += 1) setPixel(frame, 4, y, 1);
  const changed = floodFill(frame, 0, 0, 9);
  assert.equal(changed, 32);
  assert.equal(getPixel(frame, 0, 0), 9);
  assert.equal(getPixel(frame, 3, 7), 9);
  assert.equal(getPixel(frame, 4, 0), 1);
  assert.equal(getPixel(frame, 7, 7), 0);
  assert.equal(floodFill(frame, 0, 0, 9), 0);
});

test('palette validator reports exact invalid pixel positions and hints', () => {
  const frame = createGridFrame(8);
  frame.pixels[9] = 250;
  const violations = validatePaletteUse(frame);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].x, 1);
  assert.equal(violations[0].y, 1);
  assert.equal(violations[0].value, 250);
  assert.match(violations[0].hint, /16 indexed palette slots/);
});

test('offset validator catches subpixel origins', () => {
  const frame = createGridFrame(8, { offsetX: 0.5, offsetY: -1.25 });
  const violations = validateOffsets(frame);
  assert.equal(violations.length, 2);
  assert.equal(violations[0].type, 'off-grid');
  assert.equal(violations[0].field, 'offsetX');
  assert.match(violations[1].hint, /whole pixel/);
});

test('empty frame validation switches off after one painted pixel', () => {
  const frame = createGridFrame(8);
  assert.equal(validateEmptyFrame(frame).length, 1);
  setPixel(frame, 0, 0, 15);
  assert.equal(validateEmptyFrame(frame).length, 0);
});

test('fps validation is numeric and bounded', () => {
  assert.equal(normalizeFps('12'), 12);
  assert.equal(normalizeFps(60), 60);
  assert.throws(() => normalizeFps(0), RangeError);
  assert.throws(() => normalizeFps(61), RangeError);
  assert.throws(() => normalizeFps(Number.NaN), RangeError);
});

test('timeline duration math uses frame durations and fallback fps', () => {
  const frames = [100, 200, 50].map((durationMs, index) => createFrame(8, 8, { durationMs, id: `f${index}` }));
  assert.deepEqual(frameDurations(frames), [100, 200, 50]);
  assert.equal(timelineDuration(frames), 350);
  const noDurations = [createFrame(8, 8, { durationMs: 125 }), createFrame(8, 8, { durationMs: 125 })];
  delete noDurations[0].durationMs;
  delete noDurations[1].durationMs;
  assert.deepEqual(frameDurations(noDurations, 10), [100, 100]);
  assert.throws(() => frameDurations([]), TypeError);
  assert.throws(() => frameDurations([createFrame(8, 8, { durationMs: -1 })]), RangeError);
});

test('frameAtTime hits exact starts, ends, looping, and clamping', () => {
  const frames = [0, 1, 2, 3].map((index) => createFrame(8, 8, { durationMs: 125, id: `walk-${index}` }));
  assert.equal(frameAtTime(frames, 0).index, 0);
  assert.equal(frameAtTime(frames, 124.999).index, 0);
  assert.equal(frameAtTime(frames, 125).index, 1);
  assert.equal(frameAtTime(frames, 499.999).index, 3);
  assert.equal(frameAtTime(frames, 500).index, 0);
  assert.equal(frameAtTime(frames, 625).index, 1);
  assert.equal(frameAtTime(frames, 9999, { loop: false }).index, 3);
  assert.equal(frameAtTime(frames, -10).index, 0);
  assert.throws(() => frameAtTime(frames, Number.NaN), TypeError);
});

test('history supports undo, redo, branch clearing, and a size limit', () => {
  let history = createHistory('a', 2);
  history = pushHistory(history, 'b');
  history = pushHistory(history, 'c');
  history = pushHistory(history, 'd');
  assert.deepEqual(history.past, ['b', 'c']);
  history = undoHistory(history);
  assert.equal(history.present, 'c');
  assert.deepEqual(history.future, ['d']);
  history = redoHistory(history);
  assert.equal(history.present, 'd');
  history = undoHistory(history);
  history = pushHistory(history, 'e');
  assert.deepEqual(history.future, []);
  assert.equal(history.present, 'e');
  assert.equal(undoHistory(createHistory('only')).present, 'only');
  assert.throws(() => createHistory('x', 0), RangeError);
});

test('project serialization round trips pixel bytes and rejects malformed input', () => {
  const project = createProject(16);
  setPixel(project.frames[0], 2, 3, 7);
  const hydrated = hydrateProject(JSON.parse(JSON.stringify(serializeProject(project))));
  assert.equal(hydrated.gridSize, 16);
  assert.equal(hydrated.frames[0].pixels instanceof Uint8Array, true);
  assert.equal(hydrated.frames[0].pixels[3 * 16 + 2], 7);
  assert.throws(() => hydrateProject(null), TypeError);
  assert.throws(() => hydrateProject({ ...serializeProject(project), gridSize: 12 }), RangeError);
  const bad = serializeProject(project);
  bad.frames[0].pixels[0] = 99;
  assert.throws(() => hydrateProject(bad), RangeError);
  const wrongLength = serializeProject(project);
  wrongLength.frames[0].pixels = [0, 1, 2];
  assert.throws(() => hydrateProject(wrongLength), TypeError);
});

test('constraint checker reports empty, palette, off-grid, and overflow issues with fixes', () => {
  const project = createProject(16);
  project.frames.push(createGridFrame(16, { id: 'bad', name: 'Bad', offsetX: 0.25 }));
  project.frames[1].pixels[0] = 240;
  const issuesWithoutSheet = checkProjectConstraints(project, null);
  assert.equal(issuesWithoutSheet.filter((issue) => issue.type === 'empty-frame').length, 1);
  assert.equal(issuesWithoutSheet.some((issue) => issue.type === 'palette' && issue.frameIndex === 1), true);
  assert.equal(issuesWithoutSheet.some((issue) => issue.type === 'off-grid' && issue.frameIndex === 1), true);
  project.sheetLayout = 'horizontal';
  project.sheetMaxWidth = 32;
  const issues = checkProjectConstraints(project, { width: 64, height: 16 });
  const overflow = issues.find((issue) => issue.type === 'sheet-overflow');
  assert.match(overflow.message, /64px exceeds the 32px maximum/);
  assert.match(overflow.hint, /Switch to grid layout/);
});

test('project validation rejects mismatched frame dimensions and palette violations', () => {
  const project = createProject(16);
  assert.equal(validateProject(project), project);
  const mismatched = createProject(16);
  mismatched.frames[0] = createFrame(8, 8, { pixels: undefined });
  mismatched.frames[0].pixels = new Uint8Array(64);
  assert.throws(() => validateProject(mismatched), RangeError);
  const badPalette = createProject(16);
  badPalette.frames[0].pixels[0] = 200;
  assert.throws(() => validateProject(badPalette), RangeError);
});

test('bundled walk cycle has four painted deterministic frames', () => {
  const frames = makeWalkCycle();
  assert.equal(frames.length, 4);
  assert.deepEqual(frames.map((frame) => frame.durationMs), [125, 125, 125, 125]);
  assert.ok(frames.every((frame) => countPaintedPixels(frame) > 30));
  const again = makeWalkCycle();
  assert.deepEqual(Array.from(frames[2].pixels), Array.from(again[2].pixels));
  assert.notDeepEqual(Array.from(frames[0].pixels), Array.from(frames[1].pixels));
});
