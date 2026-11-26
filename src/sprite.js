import { PALETTE, isValidPaletteIndex } from './palette.js';

export const GRID_SIZES = Object.freeze([8, 16, 32]);
export const DEFAULT_FPS = 8;

export function isGridSize(size) {
  return GRID_SIZES.includes(size);
}

export function assertGridSize(size) {
  if (!isGridSize(size)) throw new RangeError('grid size must be 8, 16, or 32');
  return size;
}

export function createFrame(width, height, options = {}) {
  if (!Number.isInteger(width) || width <= 0) throw new TypeError('frame width must be a positive integer');
  if (!Number.isInteger(height) || height <= 0) throw new TypeError('frame height must be a positive integer');
  const {
    id = 'frame',
    name = 'Frame',
    durationMs = 125,
    fill = 0,
    offsetX = 0,
    offsetY = 0,
  } = options;
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError('frame duration must be positive');
  if (!isValidPaletteIndex(fill)) throw new RangeError('frame fill must be a valid palette index');
  const pixels = new Uint8Array(width * height);
  if (fill !== 0) pixels.fill(fill);
  return { id, name, width, height, durationMs, offsetX, offsetY, pixels };
}

export function createGridFrame(size, options = {}) {
  assertGridSize(size);
  return createFrame(size, size, options);
}

export function cloneFrame(frame) {
  return {
    ...frame,
    pixels: new Uint8Array(frame.pixels),
  };
}

export function cloneProject(project) {
  return {
    ...project,
    frames: project.frames.map(cloneFrame),
  };
}

export function createProject(size = 16, options = {}) {
  assertGridSize(size);
  const frame = createGridFrame(size, { id: 'frame-1', name: 'Frame 1', durationMs: Math.round(1000 / (options.fps || DEFAULT_FPS)) });
  return {
    version: 1,
    gridSize: size,
    fps: options.fps || DEFAULT_FPS,
    frames: [frame],
    selectedFrame: 0,
    selectedColor: options.selectedColor ?? 7,
    tool: 'pencil',
    onionSkin: true,
    sheetLayout: 'horizontal',
    sheetMaxWidth: 128,
    sheetPadding: 0,
  };
}

function assertFramePixels(frame) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height)) {
    throw new TypeError('frame dimensions must be integers');
  }
  if (!(frame.pixels instanceof Uint8Array) || frame.pixels.length !== frame.width * frame.height) {
    throw new TypeError('frame pixels must be a Uint8Array matching width times height');
  }
}

export function pixelOffset(frame, x, y) {
  assertFramePixels(frame);
  if (!Number.isInteger(x) || x < 0 || x >= frame.width) throw new RangeError('x is outside the frame');
  if (!Number.isInteger(y) || y < 0 || y >= frame.height) throw new RangeError('y is outside the frame');
  return y * frame.width + x;
}

export function getPixel(frame, x, y) {
  return frame.pixels[pixelOffset(frame, x, y)];
}

export function setPixel(frame, x, y, colorIndex) {
  if (!isValidPaletteIndex(colorIndex)) throw new RangeError('pixel color must be a valid palette index');
  frame.pixels[pixelOffset(frame, x, y)] = colorIndex;
  return frame;
}

export function floodFill(frame, startX, startY, colorIndex) {
  if (!isValidPaletteIndex(colorIndex)) throw new RangeError('fill color must be a valid palette index');
  const start = pixelOffset(frame, startX, startY);
  const target = frame.pixels[start];
  if (target === colorIndex) return 0;
  const queue = [start];
  const seen = new Set(queue);
  let changed = 0;
  while (queue.length) {
    const at = queue.shift();
    if (frame.pixels[at] !== target) continue;
    frame.pixels[at] = colorIndex;
    changed += 1;
    const x = at % frame.width;
    const y = Math.floor(at / frame.width);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= frame.width || ny >= frame.height) continue;
      const next = ny * frame.width + nx;
      if (!seen.has(next) && frame.pixels[next] === target) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return changed;
}

export function countPaintedPixels(frame) {
  assertFramePixels(frame);
  let count = 0;
  for (const value of frame.pixels) if (value !== 0) count += 1;
  return count;
}

export function validatePaletteUse(frame) {
  assertFramePixels(frame);
  const violations = [];
  for (let i = 0; i < frame.pixels.length; i += 1) {
    if (!isValidPaletteIndex(frame.pixels[i])) {
      violations.push({
        type: 'palette',
        frameId: frame.id,
        x: i % frame.width,
        y: Math.floor(i / frame.width),
        value: frame.pixels[i],
        message: `Pixel ${i % frame.width},${Math.floor(i / frame.width)} uses index ${frame.pixels[i]} outside the fixed palette`,
        hint: 'Replace it with one of the 16 indexed palette slots.',
      });
    }
  }
  return violations;
}

export function validateOffsets(frame) {
  const violations = [];
  for (const key of ['offsetX', 'offsetY']) {
    if (!Number.isInteger(frame[key])) {
      violations.push({
        type: 'off-grid',
        frameId: frame.id,
        field: key,
        value: frame[key],
        message: `${frame.name} has ${key} ${frame[key]}, which is not on the integer pixel grid`,
        hint: 'Snap the frame origin to a whole pixel before forging.',
      });
    }
  }
  return violations;
}

export function validateEmptyFrame(frame) {
  if (countPaintedPixels(frame) !== 0) return [];
  return [{
    type: 'empty-frame',
    frameId: frame.id,
    message: `${frame.name} has no painted pixels`,
    hint: 'Paint at least one pixel or delete the frame before export.',
  }];
}

export function normalizeFps(fps) {
  const value = Number(fps);
  if (!Number.isFinite(value) || value < 1 || value > 60) throw new RangeError('fps must be a number from 1 to 60');
  return value;
}

export function frameDurations(frames, fallbackFps = DEFAULT_FPS) {
  if (!Array.isArray(frames) || frames.length === 0) throw new TypeError('timeline needs at least one frame');
  const fallback = 1000 / normalizeFps(fallbackFps);
  return frames.map((frame) => {
    const duration = frame.durationMs ?? fallback;
    if (!Number.isFinite(duration) || duration <= 0) throw new RangeError('every frame duration must be positive');
    return duration;
  });
}

export function timelineDuration(frames, fallbackFps = DEFAULT_FPS) {
  return frameDurations(frames, fallbackFps).reduce((sum, duration) => sum + duration, 0);
}

export function frameAtTime(frames, timeMs, options = {}) {
  const fallbackFps = options.fallbackFps ?? DEFAULT_FPS;
  const loop = options.loop !== false;
  const durations = frameDurations(frames, fallbackFps);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  if (!Number.isFinite(timeMs)) throw new TypeError('time must be finite');
  let t = Math.max(0, timeMs);
  if (loop) t %= total;
  else t = Math.min(t, total - Number.EPSILON);
  let start = 0;
  for (let index = 0; index < durations.length; index += 1) {
    const duration = durations[index];
    if (t < start + duration || index === durations.length - 1) {
      return {
        index,
        frame: frames[index],
        start,
        end: start + duration,
        elapsed: Math.max(0, t - start),
        duration,
      };
    }
    start += duration;
  }
  throw new Error('unreachable timeline state');
}

export function createHistory(initial, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('history limit must be a positive integer');
  return { past: [], present: initial, future: [], limit };
}

export function pushHistory(history, next) {
  const past = [...history.past, history.present];
  while (past.length > history.limit) past.shift();
  return { ...history, past, present: next, future: [] };
}

export function undoHistory(history) {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history) {
  if (!history.future.length) return history;
  const [next, ...future] = history.future;
  return {
    ...history,
    past: [...history.past, history.present],
    present: next,
    future,
  };
}

export function serializeProject(project) {
  return {
    ...project,
    frames: project.frames.map((frame) => ({ ...frame, pixels: Array.from(frame.pixels) })),
  };
}

export function hydrateProject(raw) {
  if (!raw || typeof raw !== 'object') throw new TypeError('project data must be an object');
  assertGridSize(raw.gridSize);
  normalizeFps(raw.fps);
  if (!Array.isArray(raw.frames) || raw.frames.length === 0) throw new TypeError('project frames must be a nonempty array');
  const frames = raw.frames.map((frame, index) => {
    if (!frame || typeof frame !== 'object') throw new TypeError(`frame ${index + 1} is malformed`);
    const width = Number(frame.width);
    const height = Number(frame.height);
    if (width !== raw.gridSize || height !== raw.gridSize) throw new RangeError('all frames must match the project grid size');
    if (!Array.isArray(frame.pixels) || frame.pixels.length !== width * height) throw new TypeError(`frame ${index + 1} pixel data is malformed`);
    const pixels = Uint8Array.from(frame.pixels);
    for (const value of pixels) {
      if (!isValidPaletteIndex(value)) throw new RangeError(`frame ${index + 1} contains a pixel outside the palette`);
    }
    return {
      id: String(frame.id || `frame-${index + 1}`),
      name: String(frame.name || `Frame ${index + 1}`),
      width,
      height,
      durationMs: Number(frame.durationMs) > 0 ? Number(frame.durationMs) : 125,
      offsetX: Number.isFinite(Number(frame.offsetX)) ? Number(frame.offsetX) : 0,
      offsetY: Number.isFinite(Number(frame.offsetY)) ? Number(frame.offsetY) : 0,
      pixels,
    };
  });
  return {
    ...raw,
    fps: normalizeFps(raw.fps),
    frames,
    selectedFrame: Math.min(Math.max(0, Number(raw.selectedFrame) || 0), frames.length - 1),
  };
}

export function checkProjectConstraints(project, sheet = null) {
  const issues = [];
  if (!project || !Array.isArray(project.frames)) {
    return [{ type: 'malformed', message: 'Project data is malformed', hint: 'Reset the project or restore a valid saved project.' }];
  }
  project.frames.forEach((frame, index) => {
    for (const violation of validatePaletteUse(frame)) issues.push({ ...violation, frameIndex: index });
    for (const violation of validateOffsets(frame)) issues.push({ ...violation, frameIndex: index });
    for (const violation of validateEmptyFrame(frame)) issues.push({ ...violation, frameIndex: index });
  });
  if (sheet && Number.isFinite(project.sheetMaxWidth) && sheet.width > project.sheetMaxWidth) {
    issues.push({
      type: 'sheet-overflow',
      message: `Sheet width ${sheet.width}px exceeds the ${project.sheetMaxWidth}px maximum`,
      hint: project.sheetLayout === 'horizontal' ? 'Switch to grid layout or raise the maximum width.' : 'Raise the maximum width or reduce padding.',
    });
  }
  return issues;
}

export function validateProject(project) {
  if (!project || typeof project !== 'object') throw new TypeError('project must be an object');
  assertGridSize(project.gridSize);
  normalizeFps(project.fps);
  if (!Array.isArray(project.frames) || project.frames.length === 0) throw new TypeError('project needs frames');
  for (const frame of project.frames) {
    assertFramePixels(frame);
    if (frame.width !== project.gridSize || frame.height !== project.gridSize) throw new RangeError('frame size must match the project grid');
    if (validatePaletteUse(frame).length) throw new RangeError('project contains pixels outside the fixed palette');
  }
  return project;
}
