# Sticky Pushpin Image Replacement

## Goal

Replace the emoji pushpin decoration rendered at the top of sticky notes with the user-provided transparent PNG, while preserving the sticky note's current layout and behavior.

## Scope

- Copy `/Users/laogui/Downloads/Red Pushpin PNG.png` into the renderer's managed asset directory as `src/mainview/assets/red-pushpin.png`.
- Import the PNG from `StickyNode.tsx` so Vite and Electrobun include it in renderer builds.
- Replace only the `📌` decoration in `StickyContent`; do not change sticky icons in menus, search results, or other type selectors.
- Render the image fully inside the sticky, horizontally centered, 4 px below the top edge, and 20 px high. Preserve its aspect ratio and the current drop shadow.
- Keep the image decorative and hidden from assistive technology.
- Preserve all unrelated, uncommitted changes currently present in `StickyNode.tsx` and elsewhere in the worktree.

## Verification

- Add or update a `StickyNode` rendering test to verify that the pushpin PNG is rendered and that the emoji is absent.
- Verify the image uses the exact `top-1`, `h-5`, and `w-auto` layout classes and does not use a negative vertical translation.
- Run the focused `StickyNode` test suite.
- Run the project type check to verify the static asset import and component markup.

## Non-goals

- Replacing the sticky-note type icon used by creation menus or search results.
- Editing, recoloring, or otherwise transforming the supplied PNG.
- Changing sticky-note dimensions, content editing, colors, selection, or drag behavior.
