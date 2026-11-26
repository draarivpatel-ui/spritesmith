# SpriteSmith design system

## Intent

A compact dark workshop for constrained pixel art. The interface should read as a precise maker tool rather than a decorative landing page. The editor canvas is the visual center, the fixed palette is always visible, and export state is inspectable before download.

## Layout

- One desktop workbench with three columns: tools and palette, canvas and timeline, constraints and forge output.
- The title stands alone in the top bar. No eyebrow, kicker, tagline, or helper line.
- The first viewport contains the complete editing and forging loop at 1440 by 900.
- Below 1100 pixels the columns stack in a single readable flow.
- Panels use one-pixel borders, small radii, and internal scrolling only where the content is naturally unbounded.

## Color

- Background: near-black navy `#070b14` and panel navy `#0d1424`.
- Surface borders: muted blue gray `#26334d`.
- Primary action: amber `#ffc53d` with dark text.
- Accent: mint green `#22a06b` for valid state.
- Danger: cranberry red `#f04452`.
- Text: snow `#f8fafc`; secondary text: cool gray `#9aa8bf`.
- The editor palette is the product palette shown in README.md. It is content, not merely decoration.

## Typography

System sans-serif throughout. Weight and size create hierarchy. Buttons and labels are compact, direct sentence case. Monospace is reserved for coordinates, sheet dimensions, atlas JSON, and pixel status.

## Motion and interaction

Motion is restrained. Buttons use short hover and active transitions. The playback canvas is the only continuous motion. The video cursor glides are capture artifacts, not product animation.

## Accessibility and honesty

Interactive controls are real buttons, inputs, selects, and labels. Focus uses a visible amber outline. Reduced-motion users receive near-instant transitions. The UI explicitly says PNG plus JSON only, GIF export is intentionally not included, and there is no Photoshop integration.
