# Sticky Pushpin Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sticky note's decorative pushpin emoji with the supplied transparent PNG.

**Architecture:** Store the PNG in the renderer asset tree and import it as a Vite-managed module from `StickyNode.tsx`. Render it as a decorative image inside the existing top-center overlay without changing sticky behavior or other sticky-type icons.

**Tech Stack:** React, TypeScript, Vite static asset imports, Vitest, Testing Library

---

### Task 1: Render the PNG pushpin decoration

**Files:**
- Create: `src/mainview/assets/red-pushpin.png`
- Modify: `src/mainview/components/canvas/nodes/StickyNode.tsx:1-160`
- Test: `src/mainview/components/canvas/nodes/StickyNode.test.tsx`

- [ ] **Step 1: Write the failing rendering test**

Add a test that renders a sticky, finds the decorative image, verifies its bundled PNG source, exact 20 px height, 4 px top inset, and verifies the old emoji is absent:

```tsx
it('renders the PNG pushpin decoration instead of the pushpin emoji', () => {
  const { container } = render(
    <StickyNode
      data={{ color: '#ffee88', content: 'Pinned note' }}
      id="sticky-pushpin"
    />
  );

  const pushpin = container.querySelector<HTMLImageElement>(
    'img[data-sticky-pushpin]'
  );

  expect(pushpin).not.toBeNull();
  expect(pushpin).toHaveAttribute('src', expect.stringContaining('red-pushpin'));
  expect(pushpin).toHaveClass('h-5', 'w-auto');
  expect(pushpin.parentElement).toHaveClass('top-1');
  expect(pushpin.parentElement).not.toHaveClass('-translate-y-1/2');
  expect(container).not.toHaveTextContent('📌');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `bun run test src/mainview/components/canvas/nodes/StickyNode.test.tsx`.

Expected: FAIL because the current image uses `h-7`, `top-0`, and `-translate-y-1/2`.

- [ ] **Step 3: Copy the supplied asset into the renderer**

Copy `/Users/laogui/Downloads/Red Pushpin PNG.png` without transforming it to `src/mainview/assets/red-pushpin.png`, then verify the copy remains an 800 × 611 RGBA PNG.

- [ ] **Step 4: Replace the emoji with the imported PNG**

Preserve the horizontal centering and existing shadow, move the overlay fully inside the sticky with `top-1`, remove the negative vertical translation, and render the image with:

```tsx
<img
  alt=""
  aria-hidden
  className="h-5 w-auto select-none"
  data-sticky-pushpin
  draggable={false}
  src={redPushpinUrl}
/>
```

- [ ] **Step 5: Run focused verification and verify GREEN**

Run `bun run test src/mainview/components/canvas/nodes/StickyNode.test.tsx`.

Expected: all tests in `StickyNode.test.tsx` pass with no failures.

- [ ] **Step 6: Run static verification**

Run `bun run type-check`.

Expected: exit code 0 with no TypeScript errors, including the PNG module import.

- [ ] **Step 7: Review the final diff without committing**

Run `git diff --check`, inspect the source and test diff, and run `git status --short src/mainview/assets/red-pushpin.png`.

Expected: no whitespace errors; the source diff contains only the pushpin replacement plus its test; the PNG is listed as untracked. Do not create a commit.
