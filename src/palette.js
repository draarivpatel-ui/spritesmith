export const TRANSPARENT_INDEX = 0;

export const PALETTE = Object.freeze([
  Object.freeze({ index: 0, name: 'Transparent', hex: '#000000', alpha: 0 }),
  Object.freeze({ index: 1, name: 'Ink', hex: '#101423', alpha: 255 }),
  Object.freeze({ index: 2, name: 'Midnight', hex: '#26334D', alpha: 255 }),
  Object.freeze({ index: 3, name: 'Pine', hex: '#0F5E4A', alpha: 255 }),
  Object.freeze({ index: 4, name: 'Holly', hex: '#22A06B', alpha: 255 }),
  Object.freeze({ index: 5, name: 'Mint', hex: '#8EE6A1', alpha: 255 }),
  Object.freeze({ index: 6, name: 'Cranberry', hex: '#B91C3C', alpha: 255 }),
  Object.freeze({ index: 7, name: 'Ribbon', hex: '#F04452', alpha: 255 }),
  Object.freeze({ index: 8, name: 'Coral', hex: '#FF8A5C', alpha: 255 }),
  Object.freeze({ index: 9, name: 'Amber', hex: '#FFC53D', alpha: 255 }),
  Object.freeze({ index: 10, name: 'Cream', hex: '#FFF2B8', alpha: 255 }),
  Object.freeze({ index: 11, name: 'Frost', hex: '#9EE7FF', alpha: 255 }),
  Object.freeze({ index: 12, name: 'Ice', hex: '#38BDF8', alpha: 255 }),
  Object.freeze({ index: 13, name: 'Indigo', hex: '#4F46E5', alpha: 255 }),
  Object.freeze({ index: 14, name: 'Violet', hex: '#A855F7', alpha: 255 }),
  Object.freeze({ index: 15, name: 'Snow', hex: '#F8FAFC', alpha: 255 }),
]);

export function isValidPaletteIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < PALETTE.length;
}

export function assertValidPaletteIndex(index) {
  if (!isValidPaletteIndex(index)) {
    throw new RangeError(`palette index must be an integer from 0 to ${PALETTE.length - 1}`);
  }
  return index;
}

export function paletteColor(index) {
  assertValidPaletteIndex(index);
  return PALETTE[index];
}

export function hexToRgb(hex) {
  const clean = String(hex).replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new TypeError('hex color must use six digits');
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

export function paletteRgbTriples() {
  return PALETTE.map((entry) => hexToRgb(entry.hex));
}

export function paletteAlphaValues() {
  return PALETTE.map((entry) => entry.alpha);
}
