# Folder thumbnail stack design QA

- Source visual truth: `/Users/laogui/Projects/electrobun-starter-tanstack/artifacts/design-qa/folder-preview-reference.png`
- Original GhostBoard state: `/var/folders/z9/923rxv8s00v774r2w1qyxjrh0000gn/T/codex-clipboard-04513fbb-8a63-49f4-af1c-e7ad65492f19.png`
- Browser-rendered implementation, full viewport: `/Users/laogui/Projects/electrobun-starter-tanstack/artifacts/design-qa/folder-preview-after-full.png`
- Browser-rendered implementation, focused crop: `/Users/laogui/Projects/electrobun-starter-tanstack/artifacts/design-qa/folder-preview-after.png`
- Combined comparison evidence: `/Users/laogui/Projects/electrobun-starter-tanstack/artifacts/design-qa/folder-preview-comparison.png`
- Viewport: 1280 × 720 CSS pixels at device pixel ratio 2
- State: light theme, canvas fit view, closed `Bug reports` folder with five live child cards

## Comparison scope

The source belongs to a different product and shows a six-item locked folder, while the implementation is GhostBoard's five-item `Bug reports` fixture. The reliable visual target is therefore the folder-mouth treatment: broad overlapping child surfaces, shallow rotation, restrained exposed content, and the front folder shell remaining the dominant silhouette. App-specific lock/upload controls, copy, palette, and overall folder proportions are out of scope.

## Full-view comparison evidence

The implementation was captured from the running Vite renderer in the Codex in-app browser. The full canvas capture confirms that the revised stack remains correctly sandwiched between the existing SVG back and front shells and does not disturb the folder title, subtitle, item count, menu, shadow, neighboring nodes, or canvas layout.

## Focused-region comparison evidence

The combined image places the supplied target on the left and the rendered GhostBoard folder crop on the right. At the folder mouth, the implementation now uses wide, strongly overlapping child surfaces with rotations limited to ±2.4 degrees. The child UI is counter-scaled to the shallow axis, so text and imagery stay proportionate instead of stretching horizontally. A focused comparison is necessary because the card-stack detail is too small to judge reliably in the full 1280 × 720 canvas capture.

## Required fidelity surfaces

- Fonts and typography: the existing GhostBoard folder typography is unchanged. Thumbnail text now scales uniformly on both axes; it is visually subordinate and no longer creates wide, distorted headings. No new wrapping or truncation regression is visible on the folder face.
- Spacing and layout rhythm: thumbnail frames changed from narrow 32% × 52% slots with a ±9-degree fan to broad 58% × 38% slots with small horizontal offsets and a ±2.4-degree shallow stack. The folder lip remains visually dominant, and all previews stay clipped within the outer folder silhouette.
- Colors and visual tokens: the folder keeps its existing slate/white shell tokens. Preview colors remain data-driven from real child cards rather than copying the reference's neon green and orange fixture colors.
- Image quality and asset fidelity: the stack renders the real `FolderChildPreview` components. No placeholder, rasterized mock, or synthetic thumbnail asset replaces child content. The counter-scale keeps text and images from anisotropic distortion, and border, radius, and shadow remain continuous with the expanded shared element.
- Copy and content: `Bug reports`, its subtitle, and the five real child cards intentionally remain GhostBoard content. The reference's `WiFi Passwords`, `6 Items`, lock, and upload affordances are not copied because the requested change concerns only the sandwiched card thumbnails.

## Findings

No actionable P0, P1, or P2 mismatch remains within the requested thumbnail-stack scope.

- [P3] GhostBoard exposes up to five live child layers while the reference visually emphasizes about three.
  - Location: closed folder thumbnail stack.
  - Evidence: the focused comparison shows more individual white card edges in GhostBoard.
  - Impact: slightly denser than the reference at high zoom, but the broad overlap and quiet content keep the stack readable.
  - Disposition: accepted product constraint. All five previews participate in the existing one-to-one open/close shared-element transition; reducing the rendered count would make two children appear only after expansion begins.

## Comparison history

1. Initial evidence: the supplied GhostBoard screenshot showed 32% × 52% vertical thumbnails at rotations from -9 to +9 degrees. Multiple full-size `Untitled` headings dominated the folder mouth, and non-uniform scaling visibly stretched child content. Classified as P1 because the stack's silhouette and content density materially differed from the reference.
2. Fixes applied: widened and flattened the shared thumbnail slots, reduced rotation, increased overlap, added content counter-scaling, and animated that same correction between the closed and expanded states.
3. Post-fix evidence: the focused browser crop and combined comparison show a shallow horizontal stack, proportional child content, preserved clipping, and an unchanged folder face. The earlier P1 findings are resolved; only the accepted P3 layer-count difference remains.

## Verification

- `bun run test`: 124 files passed, 1,197 tests passed.
- Focused folder tests: 14 tests passed across `FolderNode.test.tsx` and `folderExpansion.test.ts`.
- Biome check on all five touched TypeScript/TSX files: passed.
- Repository-wide `bun run check`: the touched files pass; the command still reports the pre-existing unrelated `useConsistentTypeDefinitions` finding in `src/bun/index.ts:632`.
- `bun run type-check`: blocked by existing Electrobun dependency declaration errors under `node_modules/electrobun` and a missing `three` declaration; no error points to the touched folder files.

## Follow-up polish

- If a future product decision allows the closed icon to summarize rather than map every expanded child one-to-one, cap the visible closed stack at three layers for an even closer match to the reference.

final result: passed
