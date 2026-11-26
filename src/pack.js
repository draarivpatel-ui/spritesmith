function assertFrames(frames) {
  if (!Array.isArray(frames) || frames.length === 0) throw new TypeError('packing needs at least one frame');
  const width = frames[0]?.width;
  const height = frames[0]?.height;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new TypeError('frames must have positive integer dimensions');
  }
  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height) throw new RangeError('all frames must share the same dimensions');
    if (!(frame.pixels instanceof Uint8Array) || frame.pixels.length !== width * height) {
      throw new TypeError('frame pixel data is malformed');
    }
  }
  return { width, height };
}

function assertPadding(padding) {
  if (!Number.isInteger(padding) || padding < 0 || padding > 64) throw new RangeError('padding must be an integer from 0 to 64');
  return padding;
}

function normalizeMaxWidth(maxWidth) {
  if (maxWidth === null || maxWidth === undefined || maxWidth === '') return null;
  const value = Number(maxWidth);
  if (!Number.isInteger(value) || value <= 0) throw new RangeError('maximum sheet width must be a positive integer');
  return value;
}

export function gridColumnsFor(frameWidth, frameCount, maxWidth = null, padding = 0) {
  if (!Number.isInteger(frameWidth) || frameWidth <= 0) throw new TypeError('frame width must be a positive integer');
  if (!Number.isInteger(frameCount) || frameCount <= 0) throw new TypeError('frame count must be a positive integer');
  assertPadding(padding);
  const widthLimit = normalizeMaxWidth(maxWidth);
  if (widthLimit !== null) {
    return Math.max(1, Math.floor((widthLimit + padding) / (frameWidth + padding)));
  }
  return Math.max(1, Math.ceil(Math.sqrt(frameCount)));
}

export function sheetLayoutMath(frameWidth, frameHeight, frameCount, options = {}) {
  const layout = options.layout || 'horizontal';
  const padding = assertPadding(options.padding ?? 0);
  const maxWidth = normalizeMaxWidth(options.maxWidth);
  if (!['horizontal', 'grid'].includes(layout)) throw new RangeError('layout must be horizontal or grid');
  if (!Number.isInteger(frameWidth) || frameWidth <= 0 || !Number.isInteger(frameHeight) || frameHeight <= 0) {
    throw new TypeError('frame dimensions must be positive integers');
  }
  if (!Number.isInteger(frameCount) || frameCount <= 0) throw new TypeError('frame count must be a positive integer');
  if (layout === 'horizontal') {
    return {
      layout,
      columns: frameCount,
      rows: 1,
      width: frameCount * frameWidth + (frameCount - 1) * padding,
      height: frameHeight,
      padding,
      maxWidth,
    };
  }
  const columns = gridColumnsFor(frameWidth, frameCount, maxWidth, padding);
  const rows = Math.ceil(frameCount / columns);
  return {
    layout,
    columns,
    rows,
    width: columns * frameWidth + (columns - 1) * padding,
    height: rows * frameHeight + (rows - 1) * padding,
    padding,
    maxWidth,
  };
}

export function packSpriteSheet(frames, options = {}) {
  const { width: frameWidth, height: frameHeight } = assertFrames(frames);
  const layout = options.layout || 'horizontal';
  const padding = assertPadding(options.padding ?? 0);
  const maxWidth = normalizeMaxWidth(options.maxWidth);
  const math = sheetLayoutMath(frameWidth, frameHeight, frames.length, { layout, padding, maxWidth });
  const pixels = new Uint8Array(math.width * math.height);
  const rects = frames.map((frame, index) => {
    const column = layout === 'horizontal' ? index : index % math.columns;
    const row = layout === 'horizontal' ? 0 : Math.floor(index / math.columns);
    const x = column * (frameWidth + padding);
    const y = row * (frameHeight + padding);
    for (let py = 0; py < frameHeight; py += 1) {
      const sourceStart = py * frameWidth;
      const targetStart = (y + py) * math.width + x;
      pixels.set(frame.pixels.subarray(sourceStart, sourceStart + frameWidth), targetStart);
    }
    return {
      frameId: frame.id,
      name: frame.name,
      index,
      x,
      y,
      w: frameWidth,
      h: frameHeight,
      durationMs: frame.durationMs,
    };
  });
  return {
    width: math.width,
    height: math.height,
    layout,
    columns: math.columns,
    rows: math.rows,
    padding,
    maxWidth,
    frameWidth,
    frameHeight,
    frameCount: frames.length,
    pixels,
    rects,
  };
}

export function makeAtlas(sheet, frames, options = {}) {
  if (!sheet || !Array.isArray(sheet.rects)) throw new TypeError('sheet must come from packSpriteSheet');
  if (!Array.isArray(frames) || frames.length !== sheet.rects.length) throw new TypeError('frames must match the sheet rects');
  const imageName = options.imageName || 'spritesmith-sheet.png';
  const fps = Number(options.fps) > 0 ? Number(options.fps) : 8;
  return {
    meta: {
      app: 'SpriteSmith',
      version: 1,
      image: imageName,
      exporter: 'indexed-palette-png-json',
      gifExported: false,
      offline: true,
    },
    size: { w: sheet.width, h: sheet.height },
    layout: sheet.layout,
    fps,
    frameCount: sheet.frameCount,
    frames: sheet.rects.map((rect, index) => ({
      name: frames[index].name,
      frame: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      duration: Math.round(rect.durationMs),
      pivot: {
        x: Number.isInteger(frames[index].offsetX) ? frames[index].offsetX : 0,
        y: Number.isInteger(frames[index].offsetY) ? frames[index].offsetY : 0,
      },
    })),
  };
}

export function atlasJson(atlas) {
  return `${JSON.stringify(atlas, null, 2)}\n`;
}
