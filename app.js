import { PALETTE, hexToRgb, paletteAlphaValues } from './src/palette.js';
import {
  checkProjectConstraints,
  cloneProject,
  countPaintedPixels,
  createGridFrame,
  createHistory,
  createProject,
  floodFill,
  frameAtTime,
  getPixel,
  hydrateProject,
  pushHistory,
  redoHistory,
  serializeProject,
  setPixel,
  timelineDuration,
  undoHistory,
  validateProject,
} from './src/sprite.js';
import { atlasJson, makeAtlas, packSpriteSheet } from './src/pack.js';
import { encodeIndexedPng } from './src/png.js';
import { makeWalkCycle } from './src/sample.js';

const STORAGE_KEY = 'spritesmith-project-v1';
const CANVAS_SIZE = 512;

const els = {
  canvas: document.querySelector('#sprite-canvas'),
  sheetPreview: document.querySelector('#sheet-preview'),
  pixelCoordinate: document.querySelector('#pixel-coordinate'),
  frameTitle: document.querySelector('#frame-title'),
  frameMeta: document.querySelector('#frame-meta'),
  paletteGrid: document.querySelector('#palette-grid'),
  toolButtons: [...document.querySelectorAll('[data-tool]')],
  gridSizeSelect: document.querySelector('#grid-size-select'),
  applyGridButton: document.querySelector('#apply-grid-button'),
  zoomInput: document.querySelector('#zoom-input'),
  zoomOutput: document.querySelector('#zoom-output'),
  onionToggle: document.querySelector('#onion-toggle'),
  playButton: document.querySelector('#play-button'),
  fpsInput: document.querySelector('#fps-input'),
  fpsOutput: document.querySelector('#fps-output'),
  timeReadout: document.querySelector('#time-readout'),
  timelineStrip: document.querySelector('#timeline-strip'),
  addFrameButton: document.querySelector('#add-frame-button'),
  duplicateFrameButton: document.querySelector('#duplicate-frame-button'),
  deleteFrameButton: document.querySelector('#delete-frame-button'),
  undoButton: document.querySelector('#undo-button'),
  redoButton: document.querySelector('#redo-button'),
  sampleButton: document.querySelector('#sample-button'),
  newButton: document.querySelector('#new-button'),
  constraintCount: document.querySelector('#constraint-count'),
  constraintList: document.querySelector('#constraint-list'),
  layoutSelect: document.querySelector('#layout-select'),
  maxWidthInput: document.querySelector('#max-width-input'),
  paddingInput: document.querySelector('#padding-input'),
  forgeButton: document.querySelector('#forge-button'),
  sheetStats: document.querySelector('#sheet-stats'),
  downloadPngButton: document.querySelector('#download-png-button'),
  downloadJsonButton: document.querySelector('#download-json-button'),
  atlasPreview: document.querySelector('#atlas-preview'),
  saveState: document.querySelector('#save-state'),
  gridBadge: document.querySelector('#grid-badge'),
  paintedBadge: document.querySelector('#painted-badge'),
  stage: document.querySelector('.canvas-stage'),
};

const ctx = els.canvas.getContext('2d');
const sheetCtx = els.sheetPreview.getContext('2d');
const alphaValues = paletteAlphaValues();
const rgbValues = PALETTE.map((entry) => hexToRgb(entry.hex));

function sampleProject() {
  const project = createProject(16);
  project.frames = makeWalkCycle();
  project.selectedFrame = 0;
  project.selectedColor = 7;
  project.tool = 'pencil';
  project.onionSkin = true;
  return project;
}

function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return hydrateProject(JSON.parse(raw));
  } catch (error) {
    console.warn('Saved SpriteSmith project was malformed and has been ignored.', error);
    return null;
  }
}

let project = loadProject() || sampleProject();
let history = createHistory(cloneProject(project), 100);
let forgedSheet = null;
let forgedAtlas = null;
let strokeActive = false;
let strokeChanged = false;
let playback = { playing: false, base: 0, raf: 0, lastIndex: -1 };
let saveTimer = 0;

function currentFrame() {
  return project.frames[project.selectedFrame];
}

function persistSoon() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProject(project)));
      els.saveState.textContent = 'Saved locally in this browser';
    } catch {
      els.saveState.textContent = 'Local save unavailable; export to keep work';
    }
  }, 120);
}

function markForgingStale() {
  forgedSheet = null;
  forgedAtlas = null;
  els.downloadPngButton.disabled = true;
  els.downloadJsonButton.disabled = true;
}

function updateProject(mutator, options = {}) {
  const draft = cloneProject(project);
  mutator(draft);
  project = draft;
  if (options.record !== false) history = pushHistory(history, cloneProject(project));
  markForgingStale();
  persistSoon();
  renderAll();
}

function uniqueFrameId(draft, base = 'frame') {
  let index = draft.frames.length + 1;
  let id = `${base}-${index}`;
  while (draft.frames.some((frame) => frame.id === id)) {
    index += 1;
    id = `${base}-${index}`;
  }
  return id;
}

function frameTile(frame) {
  const tile = document.createElement('canvas');
  tile.width = frame.width;
  tile.height = frame.height;
  const tileCtx = tile.getContext('2d');
  const image = tileCtx.createImageData(frame.width, frame.height);
  for (let i = 0; i < frame.pixels.length; i += 1) {
    const color = frame.pixels[i];
    const [r, g, b] = rgbValues[color] || [0, 0, 0];
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = alphaValues[color] ?? 0;
  }
  tileCtx.putImageData(image, 0, 0);
  return tile;
}

function drawFrame(context, frame, x, y, width, height, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.imageSmoothingEnabled = false;
  context.drawImage(frameTile(frame), x, y, width, height);
  context.restore();
}

function renderCanvas() {
  const frame = currentFrame();
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.imageSmoothingEnabled = false;
  if (project.onionSkin && project.frames.length > 1) {
    const previous = project.frames[(project.selectedFrame - 1 + project.frames.length) % project.frames.length];
    const next = project.frames[(project.selectedFrame + 1) % project.frames.length];
    drawFrame(ctx, previous, 0, 0, CANVAS_SIZE, CANVAS_SIZE, 0.20);
    if (next !== previous) drawFrame(ctx, next, 0, 0, CANVAS_SIZE, CANVAS_SIZE, 0.13);
  }
  drawFrame(ctx, frame, 0, 0, CANVAS_SIZE, CANVAS_SIZE, 1);

  const cell = CANVAS_SIZE / project.gridSize;
  ctx.save();
  ctx.strokeStyle = 'rgba(158, 231, 255, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let line = 1; line < project.gridSize; line += 1) {
    const at = Math.round(line * cell) + 0.5;
    ctx.moveTo(at, 0);
    ctx.lineTo(at, CANVAS_SIZE);
    ctx.moveTo(0, at);
    ctx.lineTo(CANVAS_SIZE, at);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.42)';
  ctx.strokeRect(0.5, 0.5, CANVAS_SIZE - 1, CANVAS_SIZE - 1);
  ctx.restore();
}

function renderPalette() {
  els.paletteGrid.replaceChildren();
  for (const entry of PALETTE) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `swatch${entry.index === project.selectedColor ? ' selected' : ''}${entry.index === 0 ? ' transparent' : ''}`;
    button.style.setProperty('--swatch', entry.hex);
    button.dataset.color = String(entry.index);
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', entry.index === project.selectedColor ? 'true' : 'false');
    button.setAttribute('aria-label', `Palette slot ${entry.index}, ${entry.name}`);
    button.title = `${entry.index}: ${entry.name}`;
    const label = document.createElement('span');
    label.textContent = String(entry.index);
    button.append(label);
    button.addEventListener('click', () => {
      project.selectedColor = entry.index;
      if (project.tool === 'eraser' && entry.index !== 0) project.tool = 'pencil';
      persistSoon();
      renderAll();
    });
    els.paletteGrid.append(button);
  }
}

function renderTools() {
  for (const button of els.toolButtons) {
    const active = button.dataset.tool === project.tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function renderTimeline() {
  els.timelineStrip.replaceChildren();
  project.frames.forEach((frame, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `frame-thumb${index === project.selectedFrame ? ' selected' : ''}`;
    item.dataset.frameIndex = String(index);
    item.setAttribute('aria-label', `Select ${frame.name}`);
    const thumb = document.createElement('canvas');
    thumb.width = 64;
    thumb.height = 64;
    const thumbCtx = thumb.getContext('2d');
    thumbCtx.imageSmoothingEnabled = false;
    drawFrame(thumbCtx, frame, 0, 0, 64, 64, 1);
    const label = document.createElement('span');
    label.textContent = `${index + 1}`;
    const duration = document.createElement('small');
    duration.textContent = `${Math.round(frame.durationMs)}ms`;
    item.append(thumb, label, duration);
    item.addEventListener('click', () => selectFrame(index));
    els.timelineStrip.append(item);
  });
}

function selectFrame(index) {
  if (index === project.selectedFrame) return;
  project.selectedFrame = Math.max(0, Math.min(project.frames.length - 1, index));
  persistSoon();
  renderAll();
}

function trialSheet() {
  try {
    return packSpriteSheet(project.frames, {
      layout: project.sheetLayout,
      maxWidth: project.sheetMaxWidth,
      padding: project.sheetPadding,
    });
  } catch {
    return null;
  }
}

function renderConstraints() {
  const sheet = trialSheet();
  const issues = checkProjectConstraints(project, sheet);
  els.constraintCount.textContent = issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'clean';
  els.constraintCount.classList.toggle('bad', issues.length > 0);
  els.constraintList.replaceChildren();
  if (!issues.length) {
    const item = document.createElement('li');
    item.className = 'pass';
    item.innerHTML = '<strong>Ready to forge</strong><span>Palette slots, integer origins, painted frames, and sheet width all pass.</span>';
    els.constraintList.append(item);
    return;
  }
  for (const issue of issues) {
    const item = document.createElement('li');
    item.className = 'issue';
    const title = document.createElement('strong');
    title.textContent = issue.message;
    const hint = document.createElement('span');
    hint.textContent = issue.hint;
    item.append(title, hint);
    els.constraintList.append(item);
  }
}

function renderForge() {
  const sheet = forgedSheet || trialSheet();
  if (!sheet) {
    els.sheetStats.textContent = 'Sheet math unavailable';
    return;
  }
  els.sheetStats.textContent = `${sheet.width} x ${sheet.height}px | ${sheet.columns} x ${sheet.rows} cells | ${sheet.frameCount} frames | padding ${sheet.padding}px`;
  sheetCtx.clearRect(0, 0, els.sheetPreview.width, els.sheetPreview.height);
  sheetCtx.imageSmoothingEnabled = false;
  const scale = Math.min((els.sheetPreview.width - 22) / sheet.width, (els.sheetPreview.height - 22) / sheet.height, 8);
  const drawWidth = Math.max(1, Math.floor(sheet.width * scale));
  const drawHeight = Math.max(1, Math.floor(sheet.height * scale));
  const x = Math.floor((els.sheetPreview.width - drawWidth) / 2);
  const y = Math.floor((els.sheetPreview.height - drawHeight) / 2);
  const sheetFrame = {
    width: sheet.width,
    height: sheet.height,
    pixels: sheet.pixels,
  };
  drawFrame(sheetCtx, sheetFrame, x, y, drawWidth, drawHeight, 1);
  sheetCtx.save();
  sheetCtx.strokeStyle = forgedSheet ? '#ffc53d' : 'rgba(158, 231, 255, 0.35)';
  sheetCtx.lineWidth = 2;
  sheetCtx.strokeRect(x - 1, y - 1, drawWidth + 2, drawHeight + 2);
  sheetCtx.restore();

  const atlas = forgedAtlas || makeAtlas(sheet, project.frames, { fps: project.fps });
  els.atlasPreview.textContent = atlasJson(atlas).split('\n').slice(0, 18).join('\n') + '\n  ...';
}

function renderPlayback() {
  const frame = currentFrame();
  const total = timelineDuration(project.frames, project.fps);
  const before = project.frames.slice(0, project.selectedFrame).reduce((sum, item) => sum + item.durationMs, 0);
  els.frameTitle.textContent = frame.name;
  els.frameMeta.textContent = `frame ${project.selectedFrame + 1} of ${project.frames.length} | ${project.gridSize} x ${project.gridSize}px`;
  els.fpsInput.value = String(project.fps);
  els.fpsOutput.value = `${project.fps} fps`;
  els.timeReadout.textContent = `${Math.round(before)} ms / ${Math.round(total)} ms`;
  els.playButton.textContent = playback.playing ? 'Pause' : 'Play';
  els.playButton.setAttribute('aria-pressed', playback.playing ? 'true' : 'false');
}

function renderHeader() {
  els.gridBadge.textContent = `${project.gridSize} x ${project.gridSize}`;
  const painted = project.frames.reduce((sum, frame) => sum + countPaintedPixels(frame), 0);
  els.paintedBadge.textContent = `${painted} painted px`;
  els.gridSizeSelect.value = String(project.gridSize);
  els.layoutSelect.value = project.sheetLayout;
  els.maxWidthInput.value = String(project.sheetMaxWidth);
  els.paddingInput.value = String(project.sheetPadding);
  els.onionToggle.checked = project.onionSkin;
  els.undoButton.disabled = history.past.length === 0;
  els.redoButton.disabled = history.future.length === 0;
  els.deleteFrameButton.disabled = project.frames.length <= 1;
}

function renderAll() {
  validateProject(project);
  renderHeader();
  renderTools();
  renderPalette();
  renderCanvas();
  renderTimeline();
  renderPlayback();
  renderConstraints();
  renderForge();
}

function canvasPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * project.gridSize);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * project.gridSize);
  return {
    x: Math.max(0, Math.min(project.gridSize - 1, x)),
    y: Math.max(0, Math.min(project.gridSize - 1, y)),
  };
}

function applyToolAt(x, y) {
  const frame = currentFrame();
  if (project.tool === 'picker') {
    project.selectedColor = getPixel(frame, x, y);
    project.tool = 'pencil';
    renderAll();
    return false;
  }
  if (project.tool === 'fill') {
    const changed = floodFill(frame, x, y, project.selectedColor);
    renderAll();
    return changed > 0;
  }
  const color = project.tool === 'eraser' ? 0 : project.selectedColor;
  if (getPixel(frame, x, y) === color) return false;
  setPixel(frame, x, y, color);
  renderAll();
  return true;
}

function endStroke() {
  if (!strokeActive) return;
  strokeActive = false;
  if (strokeChanged) {
    history = pushHistory(history, cloneProject(project));
    markForgingStale();
    persistSoon();
    renderAll();
  }
  strokeChanged = false;
}

els.canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  els.canvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  strokeActive = true;
  strokeChanged = applyToolAt(point.x, point.y) || strokeChanged;
  if (project.tool === 'picker' || project.tool === 'fill') endStroke();
});

els.canvas.addEventListener('pointermove', (event) => {
  const point = canvasPoint(event);
  els.pixelCoordinate.textContent = `${point.x}, ${point.y}`;
  if (!strokeActive || project.tool === 'picker' || project.tool === 'fill') return;
  strokeChanged = applyToolAt(point.x, point.y) || strokeChanged;
});

els.canvas.addEventListener('pointerup', endStroke);
els.canvas.addEventListener('pointercancel', endStroke);
els.canvas.addEventListener('pointerleave', () => {
  els.pixelCoordinate.textContent = 'outside canvas';
});

for (const button of els.toolButtons) {
  button.addEventListener('click', () => {
    project.tool = button.dataset.tool;
    persistSoon();
    renderAll();
  });
}

els.onionToggle.addEventListener('change', () => {
  project.onionSkin = els.onionToggle.checked;
  persistSoon();
  renderAll();
});

els.addFrameButton.addEventListener('click', () => {
  updateProject((draft) => {
    const id = uniqueFrameId(draft);
    const frame = createGridFrame(draft.gridSize, {
      id,
      name: `Frame ${draft.frames.length + 1}`,
      durationMs: 1000 / draft.fps,
    });
    draft.frames.splice(draft.selectedFrame + 1, 0, frame);
    draft.selectedFrame += 1;
  });
});

els.duplicateFrameButton.addEventListener('click', () => {
  updateProject((draft) => {
    const source = draft.frames[draft.selectedFrame];
    const copy = {
      ...source,
      id: uniqueFrameId(draft, `${source.id}-copy`),
      name: `${source.name} copy`,
      pixels: new Uint8Array(source.pixels),
    };
    draft.frames.splice(draft.selectedFrame + 1, 0, copy);
    draft.selectedFrame += 1;
  });
});

els.deleteFrameButton.addEventListener('click', () => {
  if (project.frames.length <= 1) return;
  updateProject((draft) => {
    draft.frames.splice(draft.selectedFrame, 1);
    draft.selectedFrame = Math.max(0, Math.min(draft.selectedFrame, draft.frames.length - 1));
  });
});

els.undoButton.addEventListener('click', () => {
  history = undoHistory(history);
  project = cloneProject(history.present);
  markForgingStale();
  persistSoon();
  renderAll();
});

els.redoButton.addEventListener('click', () => {
  history = redoHistory(history);
  project = cloneProject(history.present);
  markForgingStale();
  persistSoon();
  renderAll();
});

function replaceProject(nextProject) {
  project = nextProject;
  history = pushHistory(history, cloneProject(project));
  markForgingStale();
  persistSoon();
  renderAll();
}

els.sampleButton.addEventListener('click', () => {
  replaceProject(sampleProject());
});

els.newButton.addEventListener('click', () => {
  replaceProject(createProject(project.gridSize));
});

els.applyGridButton.addEventListener('click', () => {
  const size = Number(els.gridSizeSelect.value);
  if (size === project.gridSize) return;
  replaceProject(createProject(size));
});

els.fpsInput.addEventListener('input', () => {
  els.fpsOutput.value = `${els.fpsInput.value} fps`;
});

els.fpsInput.addEventListener('change', () => {
  const fps = Number(els.fpsInput.value);
  updateProject((draft) => {
    draft.fps = fps;
    for (const frame of draft.frames) frame.durationMs = 1000 / fps;
  });
});

els.layoutSelect.addEventListener('change', () => {
  updateProject((draft) => {
    draft.sheetLayout = els.layoutSelect.value;
  });
});

els.maxWidthInput.addEventListener('change', () => {
  const value = Math.max(8, Math.round(Number(els.maxWidthInput.value) || 128));
  updateProject((draft) => {
    draft.sheetMaxWidth = value;
  });
});

els.paddingInput.addEventListener('change', () => {
  const value = Math.max(0, Math.min(64, Math.round(Number(els.paddingInput.value) || 0)));
  updateProject((draft) => {
    draft.sheetPadding = value;
  });
});

els.zoomInput.addEventListener('input', () => {
  const zoom = Number(els.zoomInput.value);
  els.zoomOutput.value = `${zoom}%`;
  document.documentElement.style.setProperty('--canvas-zoom', String(zoom / 100));
});

function forgeSheet() {
  try {
    validateProject(project);
    forgedSheet = packSpriteSheet(project.frames, {
      layout: project.sheetLayout,
      maxWidth: project.sheetMaxWidth,
      padding: project.sheetPadding,
    });
    forgedAtlas = makeAtlas(forgedSheet, project.frames, { fps: project.fps });
    els.downloadPngButton.disabled = false;
    els.downloadJsonButton.disabled = false;
    els.saveState.textContent = `Forged ${forgedSheet.width} x ${forgedSheet.height}px sheet`;
    renderAll();
  } catch (error) {
    els.saveState.textContent = `Forge failed: ${error.message}`;
  }
}

els.forgeButton.addEventListener('click', forgeSheet);

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

els.downloadPngButton.addEventListener('click', () => {
  if (!forgedSheet) forgeSheet();
  if (!forgedSheet) return;
  const bytes = encodeIndexedPng(forgedSheet.width, forgedSheet.height, forgedSheet.pixels);
  downloadBlob(new Blob([bytes], { type: 'image/png' }), 'spritesmith-sheet.png');
  els.saveState.textContent = 'PNG export downloaded';
});

els.downloadJsonButton.addEventListener('click', () => {
  if (!forgedSheet || !forgedAtlas) forgeSheet();
  if (!forgedAtlas) return;
  downloadBlob(new Blob([atlasJson(forgedAtlas)], { type: 'application/json' }), 'spritesmith-atlas.json');
  els.saveState.textContent = 'JSON atlas downloaded';
});

function cumulativeStart(index) {
  return project.frames.slice(0, index).reduce((sum, frame) => sum + frame.durationMs, 0);
}

function stopPlayback() {
  playback.playing = false;
  cancelAnimationFrame(playback.raf);
  renderPlayback();
}

function playbackTick(now) {
  if (!playback.playing) return;
  const total = timelineDuration(project.frames, project.fps);
  const elapsed = (now - playback.base) % total;
  const position = frameAtTime(project.frames, elapsed);
  if (position.index !== project.selectedFrame) {
    project.selectedFrame = position.index;
    renderCanvas();
    renderTimeline();
  }
  els.timeReadout.textContent = `${Math.round(elapsed)} ms / ${Math.round(total)} ms`;
  playback.raf = requestAnimationFrame(playbackTick);
}

els.playButton.addEventListener('click', () => {
  if (playback.playing) {
    stopPlayback();
    return;
  }
  playback.playing = true;
  playback.base = performance.now() - cumulativeStart(project.selectedFrame);
  playback.raf = requestAnimationFrame(playbackTick);
  renderPlayback();
});

window.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === 'z' && !event.shiftKey) {
    event.preventDefault();
    els.undoButton.click();
  } else if ((event.metaKey || event.ctrlKey) && (key === 'y' || (key === 'z' && event.shiftKey))) {
    event.preventDefault();
    els.redoButton.click();
  } else if (key === ' ') {
    event.preventDefault();
    els.playButton.click();
  } else if (key === 'arrowright') {
    selectFrame(project.selectedFrame + 1);
  } else if (key === 'arrowleft') {
    selectFrame(project.selectedFrame - 1);
  } else if (key === 'b') {
    project.tool = 'pencil';
    renderAll();
  } else if (key === 'e') {
    project.tool = 'eraser';
    renderAll();
  } else if (key === 'f') {
    project.tool = 'fill';
    renderAll();
  } else if (key === 'i') {
    project.tool = 'picker';
    renderAll();
  }
});

window.__spritesmith = {
  getProject: () => serializeProject(project),
  getForgedSheet: () => forgedSheet ? {
    width: forgedSheet.width,
    height: forgedSheet.height,
    layout: forgedSheet.layout,
    columns: forgedSheet.columns,
    rows: forgedSheet.rows,
    frameCount: forgedSheet.frameCount,
  } : null,
  forgeSheet,
  getAtlas: () => forgedAtlas,
  resetSample: () => replaceProject(sampleProject()),
};

renderAll();
