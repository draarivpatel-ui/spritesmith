# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: static HTML, CSS, and JavaScript with Node built-in tests. Inferred from the explicit brief requiring an offline, zero-dependency browser-native tool.

## Users

Pixel-art beginners, game-jam participants, and judges evaluating a small creative tool. Inferred from the hackathon brief because this is a subagent run with no live interview round.

## Product Purpose

SpriteSmith lets a user draw constrained indexed-color sprite frames, preview them as animation, check constraint violations, and forge exact sprite-sheet PNG plus JSON atlas output without accounts or network access.

## Positioning

The product is a constraint-first sprite forge rather than a general painting app. Its fixed 16-slot indexed palette, grid sizes, onion skin, timeline math, exact sheet packing, and visible violation hints are the mechanism.

## Operating Context

The app must run offline as a static page. It ships with a sample four-frame walk cycle and must export only PNG plus JSON, not GIF. It is evaluated through a working demo, real screenshots, tests, and a narrated local video capture.

## Capabilities and Constraints

- Grid sizes are constrained to 8, 16, and 32 pixels.
- The palette is fixed at 16 indexed slots, with slot 0 transparent and no free color picker.
- Frames support onion skin, duplication, playback at a chosen fps, and undo/redo.
- Sheet forging supports horizontal and grid layouts with exact integer pixel math.
- Constraint checks cover palette violations, off-grid subpixel metadata, empty frames, and sheet overflow with fix hints.
- PNG and JSON export only. GIF export is intentionally absent.
- No Photoshop integration, account, dependency, network service, or tracking.

## Evidence on Hand

The sample walk cycle is authored in code inside the repository. Screenshots and the demo video are generated locally during the build. No user testimonials, external assets, or Photoshop files exist.

## Product Principles

1. Constraints should be visible and explainable, not hidden.
2. Exact integer output matters more than feature count.
3. The editor must be useful offline in the first minute.
4. Honest limits are part of the product surface.
