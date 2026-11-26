import { createGridFrame, setPixel } from './sprite.js';

const C = {
  ink: 1,
  midnight: 2,
  pine: 3,
  holly: 4,
  mint: 5,
  cranberry: 6,
  ribbon: 7,
  coral: 8,
  amber: 9,
  cream: 10,
  frost: 11,
  ice: 12,
  indigo: 13,
  violet: 14,
  snow: 15,
};

function rect(frame, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) setPixel(frame, xx, yy, color);
  }
}

function px(frame, x, y, color) {
  setPixel(frame, x, y, color);
}

function drawHead(frame) {
  rect(frame, 7, 1, 4, 1, C.ribbon);
  rect(frame, 6, 2, 6, 1, C.ribbon);
  px(frame, 12, 2, C.ribbon);
  px(frame, 13, 1, C.snow);
  px(frame, 13, 2, C.snow);
  rect(frame, 6, 3, 6, 1, C.snow);
  rect(frame, 7, 4, 4, 3, C.cream);
  px(frame, 11, 4, C.cream);
  px(frame, 11, 5, C.coral);
  px(frame, 9, 5, C.ink);
  px(frame, 10, 6, C.coral);
  px(frame, 8, 6, C.ink);
}

function drawBody(frame) {
  rect(frame, 6, 7, 5, 3, C.holly);
  px(frame, 5, 8, C.holly);
  px(frame, 11, 8, C.holly);
  rect(frame, 5, 9, 7, 1, C.ink);
  rect(frame, 7, 9, 2, 1, C.amber);
  px(frame, 6, 10, C.pine);
  px(frame, 7, 10, C.pine);
  px(frame, 8, 10, C.pine);
  px(frame, 9, 10, C.pine);
}

function drawPose(frame, pose) {
  if (pose === 0) {
    rect(frame, 5, 11, 2, 2, C.holly);
    rect(frame, 9, 11, 2, 2, C.ribbon);
    rect(frame, 4, 13, 3, 1, C.ink);
    rect(frame, 9, 13, 3, 1, C.ink);
    px(frame, 4, 7, C.ribbon);
    px(frame, 3, 8, C.ribbon);
    px(frame, 12, 7, C.cream);
    px(frame, 13, 8, C.cream);
  } else if (pose === 1) {
    rect(frame, 6, 11, 2, 2, C.holly);
    rect(frame, 8, 11, 2, 2, C.ribbon);
    rect(frame, 5, 13, 3, 1, C.ink);
    rect(frame, 8, 13, 3, 1, C.ink);
    px(frame, 4, 8, C.ribbon);
    px(frame, 12, 8, C.cream);
    px(frame, 13, 9, C.cream);
  } else if (pose === 2) {
    rect(frame, 4, 11, 2, 2, C.ribbon);
    rect(frame, 8, 11, 2, 2, C.holly);
    rect(frame, 3, 13, 3, 1, C.ink);
    rect(frame, 8, 13, 3, 1, C.ink);
    px(frame, 4, 7, C.ribbon);
    px(frame, 3, 8, C.ribbon);
    px(frame, 12, 7, C.cream);
    px(frame, 13, 8, C.cream);
  } else {
    px(frame, 6, 11, C.holly);
    px(frame, 7, 12, C.holly);
    px(frame, 8, 11, C.ribbon);
    px(frame, 9, 12, C.ribbon);
    rect(frame, 5, 13, 3, 1, C.ink);
    rect(frame, 8, 13, 3, 1, C.ink);
    px(frame, 5, 7, C.ribbon);
    px(frame, 4, 8, C.ribbon);
    px(frame, 11, 7, C.cream);
    px(frame, 12, 8, C.cream);
  }
  rect(frame, 4, 15, 8, 1, C.midnight);
}

export function makeWalkFrame(pose, size = 16) {
  if (size !== 16) throw new RangeError('the bundled walk cycle is authored at 16x16');
  const frame = createGridFrame(16, {
    id: `walk-${pose + 1}`,
    name: `Walk ${pose + 1}`,
    durationMs: 125,
  });
  drawPose(frame, pose);
  drawBody(frame);
  drawHead(frame);
  return frame;
}

export function makeWalkCycle() {
  return [0, 1, 2, 3].map((pose) => makeWalkFrame(pose));
}
