# Widget System Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn commit `e8b56410240b094699f8124280c3e333340549b0` from a partial widget-system spike into a safe Phase 1 + checklist migration baseline.

**Architecture:** Keep the useful foundation from `src/bun/widgets.ts`, but make the renderer creation model explicit: user-facing creation kinds are `checklist`, `pomodoro`, and `reminder`, while persisted React Flow nodes use one node type, `widget`, with `data: { widgetId, kind }`. Widget content stays in `.ghostboard/widgets/<widgetId>.json`; canvas manifests only persist references.

**Tech Stack:** Bun/Electrobun RPC, React 19, React Flow, Zustand, Vitest, Paraglide messages, existing GhostBoard manifest and note stores.

---

## Current State Summary

The `e8b5641` commit contains useful pieces:

- `src/bun/widgets.ts` implements widget file creation, loading, saving, deletion, cloning, id checks, and atomic writes.
- `src/bun/widgets.test.ts` covers the basic Bun-side widget I/O path and passes.
- `src/bun/workspace.ts` creates `.ghostboard/widgets/`.
- `src/bun/index.ts` adds widget RPC handlers, returns a `widgets` map from `loadCanvas`, and strips top-level/folder-child widget node data during `saveManifest`.
- `src/mainview/store/widgetStore.ts` exists and implements create/clone/update/undo/redo/save scheduling.
- `src/mainview/components/canvas/nodes/WidgetNode.tsx` renders checklist widgets and fallback states.

The commit is not ready to continue into Phase 3:

- Existing UI tests fail because message mocks do not include `menu_checklist_widget` / `menu_new_checklist_widget`.
- `CanvasNodeKind` and creation entries are inconsistent with the spec: `checklist` still creates a `card`, and a generic `widget` creation kind was added instead.
- `loadCanvas` loads existing widget references but does not migrate legacy checklist cards.
- `duplicateSelected` and `pasteClipboard` still copy `data.widgetId` unchanged, creating shared backing files.
- Widget focused view and Cmd+Z routing are not implemented.
- Markdown export still only collects note ids, so checklist widgets will be skipped.
- Search, cleanup, library, templates, and Canvas JSON export are still old-world note/card only.

---

### Task 1: Stabilize Test Harness And Creation Taxonomy

**Files:**
- Modify: `src/mainview/lib/contentTypes.ts`
- Modify: `src/mainview/lib/canvasNodeRegistry.ts`
- Modify: `src/mainview/lib/creatableNodes.ts`
- Modify: `src/mainview/routes/index.tsx`
- Modify: `src/mainview/lib/canvasNodeRegistry.test.ts`
- Modify: `src/mainview/lib/creatableNodes.test.ts`
- Modify: `src/mainview/store/canvasStore.test.ts`
- Modify: `src/mainview/routes/index.test.tsx`
- Modify: `src/mainview/components/canvas/ViewSwitcher.test.tsx`

- [ ] **Step 1: Update tests to describe the desired taxonomy**

In `src/mainview/lib/canvasNodeRegistry.test.ts`, replace expectations that checklist is card-backed with widget-backed expectations:

```ts
it('maps widget creation kinds to the shared widget React Flow node type', () => {
  expect(CANVAS_NODE_SPECS.checklist.nodeType).toBe('widget');
  expect(CANVAS_NODE_SPECS.pomodoro.nodeType).toBe('widget');
  expect(CANVAS_NODE_SPECS.reminder.nodeType).toBe('widget');
});

it('produces widget-typed nodes with kind-specific data', () => {
  expect(buildNewNodeSpec('checklist').base).toMatchObject({
    type: 'widget',
    data: { kind: 'checklist', widgetId: '' },
  });
  expect(buildNewNodeSpec('pomodoro').base).toMatchObject({
    type: 'widget',
    data: { kind: 'pomodoro', widgetId: '' },
  });
  expect(buildNewNodeSpec('reminder').base).toMatchObject({
    type: 'widget',
    data: { kind: 'reminder', widgetId: '' },
  });
});
```

- [ ] **Step 2: Run the taxonomy tests and confirm they fail for the right reason**

Run:

```bash
bun run test src/mainview/lib/canvasNodeRegistry.test.ts src/mainview/lib/creatableNodes.test.ts
```

Expected: failing assertions show that `checklist` still uses `card` and `pomodoro` / `reminder` are missing.

- [ ] **Step 3: Implement the taxonomy**

In `src/mainview/lib/contentTypes.ts`, keep user-facing creation kinds explicit and remove the generic `widget` creation kind:

```ts
export type CanvasNodeKind =
  | 'card'
  | 'checklist'
  | 'pomodoro'
  | 'reminder'
  | 'sticky'
  | 'folder'
  | 'group'
  | 'image'
  | 'asset'
  | 'link'
  | 'recording';
```

In `src/mainview/lib/canvasNodeRegistry.ts`, change the existing `checklist` spec and add `pomodoro` / `reminder` specs:

```ts
checklist: {
  kind: 'checklist',
  nodeType: 'widget',
  size: { width: DEFAULT_WIDGET_W, height: DEFAULT_WIDGET_H },
  defaultData: () => ({ widgetId: '', kind: 'checklist' }),
  canEnterGroup: true,
  canEnterFolder: true,
},
pomodoro: {
  kind: 'pomodoro',
  nodeType: 'widget',
  size: { width: DEFAULT_WIDGET_W, height: DEFAULT_WIDGET_H },
  defaultData: () => ({ widgetId: '', kind: 'pomodoro' }),
  canEnterGroup: true,
  canEnterFolder: true,
},
reminder: {
  kind: 'reminder',
  nodeType: 'widget',
  size: { width: DEFAULT_WIDGET_W, height: DEFAULT_WIDGET_H },
  defaultData: () => ({ widgetId: '', kind: 'reminder' }),
  canEnterGroup: true,
  canEnterFolder: true,
},
```

In `src/mainview/lib/creatableNodes.ts`, remove `checklistWidget` and map the three user-facing actions:

```ts
const CREATABLE_KIND_BY_ACTION = {
  note: 'card',
  checklist: 'checklist',
  pomodoro: 'pomodoro',
  reminder: 'reminder',
  sticky: 'sticky',
  image: 'image',
  link: 'link',
  folder: 'folder',
  group: 'group',
  file: 'asset',
  recording: 'recording',
} as const satisfies Record<string, CreatableCanvasNodeKind>;
```

- [ ] **Step 4: Add message mocks for all tests that mock Paraglide**

In each affected test mock, add:

```ts
menu_pomodoro: () => 'Pomodoro',
menu_new_pomodoro: () => 'New pomodoro',
menu_reminder: () => 'Reminder',
menu_new_reminder: () => 'New reminder',
```

If the implementation temporarily still refers to the current spike keys while refactoring, also add:

```ts
menu_checklist_widget: () => 'Checklist widget',
menu_new_checklist_widget: () => 'New checklist widget',
```

- [ ] **Step 5: Create widget records by requested kind**

In `src/mainview/routes/index.tsx`, change the `requestCreate` branch from `kind === 'widget'` to the three widget creation kinds:

```ts
const WIDGET_CREATE_KINDS = new Set<CreatableCanvasNodeKind>([
  'checklist',
  'pomodoro',
  'reminder',
]);

if (WIDGET_CREATE_KINDS.has(kind)) {
  const widgetKind = kind as 'checklist' | 'pomodoro' | 'reminder';
  const widget = await createWidgetRecord(widgetKind);
  if (!widget) {
    toast.error(m.toast_widget_create_failed());
    return;
  }
  await onCreateNode(kind, {
    ...(request?.anchorCenter ? { anchorCenter: request.anchorCenter } : {}),
    data: { widgetId: widget.id, kind: widget.kind },
  });
  return;
}
```

Add `toast_widget_create_failed` to `messages/en.json`, `messages/zh.json`, and the relevant test mocks.

- [ ] **Step 6: Verify taxonomy and menu stability**

Run:

```bash
bun run test src/mainview/lib/canvasNodeRegistry.test.ts src/mainview/lib/creatableNodes.test.ts src/mainview/components/canvas/ViewSwitcher.test.tsx src/mainview/routes/index.test.tsx
```

Expected: failures related to missing mock message exports are gone. Remaining failures should be about unimplemented widget behavior, not render crashes.

---

### Task 2: Lock Manifest Reference Semantics

**Files:**
- Modify: `src/bun/index.ts`
- Modify: `src/bun/index.test.ts`
- Modify: `src/mainview/lib/canvasNodeSerialization.test.ts`
- Modify: `src/mainview/lib/canvasNodeSerialization.ts`

- [ ] **Step 1: Add failing saveManifest tests for top-level and folder-child widgets**

Add tests in `src/bun/index.test.ts` that pass widget nodes with runtime content:

```ts
await canvasHandlers.saveManifest({
  viewId: 'default',
  nodes: [
    {
      id: 'widget-node-1',
      type: 'widget',
      position: { x: 10, y: 20 },
      data: {
        widgetId: 'widget_abc',
        kind: 'checklist',
        items: [{ id: 'item_1', text: 'Leak', checked: false }],
      },
    },
    {
      id: 'folder-1',
      type: 'folder',
      position: { x: 0, y: 0 },
      data: {
        title: 'Folder',
        children: [
          {
            id: 'child-widget-1',
            type: 'widget',
            data: {
              widgetId: 'widget_child',
              kind: 'reminder',
              dueAt: '2026-07-08T10:00:00.000Z',
            },
          },
        ],
      },
    },
  ],
  edges: [],
});
```

Assert that the saved manifest contains:

```ts
expect(saved.nodes[0].data).toEqual({
  widgetId: 'widget_abc',
  kind: 'checklist',
});
expect(saved.nodes[1].data.children[0].data).toEqual({
  widgetId: 'widget_child',
  kind: 'reminder',
});
expect(noteMocks.createNote).not.toHaveBeenCalledWith(
  expect.anything(),
  expect.stringMatching(/^widget_/),
  expect.anything(),
  expect.anything()
);
```

- [ ] **Step 2: Add renderer serialization tests**

In `src/mainview/lib/canvasNodeSerialization.test.ts`, add:

```ts
it('strips widget runtime data from top-level nodes and folder children', () => {
  const result = sanitizeForPersistence(
    [
      {
        id: 'w1',
        type: 'widget',
        position: { x: 0, y: 0 },
        data: {
          widgetId: 'widget_1',
          kind: 'checklist',
          items: [{ id: 'item_1', text: 'No leak', checked: false }],
        },
      },
      {
        id: 'f1',
        type: 'folder',
        position: { x: 0, y: 0 },
        data: {
          children: [
            {
              id: 'cw1',
              type: 'widget',
              data: {
                widgetId: 'widget_2',
                kind: 'pomodoro',
                timer: { state: 'running', startedAt: 'x', durationMs: 1000 },
              },
            },
          ],
        },
      },
    ] as any,
    []
  );

  expect(result.nodes[0].data).toEqual({ widgetId: 'widget_1', kind: 'checklist' });
  expect((result.nodes[1].data as any).children[0].data).toEqual({
    widgetId: 'widget_2',
    kind: 'pomodoro',
  });
});
```

- [ ] **Step 3: Harden Bun-side widget serialization**

Keep the existing widget branch in `src/bun/index.ts`, but route both top-level and folder-child paths through a helper:

```ts
function serializeWidgetReference(data: unknown) {
  const record = (data ?? {}) as Record<string, unknown>;
  const widgetId = typeof record.widgetId === 'string' ? record.widgetId : '';
  const kind = typeof record.kind === 'string' ? record.kind : '';
  return { widgetId, kind };
}
```

Use this helper in both widget branches so all future runtime fields are stripped consistently.

- [ ] **Step 4: Verify manifest invariants**

Run:

```bash
bun run test src/bun/index.test.ts src/mainview/lib/canvasNodeSerialization.test.ts
```

Expected: widget nodes persist only `{ widgetId, kind }`, and no card note creation occurs for widget nodes.

---

### Task 3: Complete Widget Store Behavior And Tests

**Files:**
- Create: `src/mainview/store/widgetStore.test.ts`
- Modify: `src/mainview/store/widgetStore.ts`
- Modify: `src/mainview/lib/rpc.test.ts`

- [ ] **Step 1: Add widgetStore tests for hydrate, update, undo, redo, and save**

Create `src/mainview/store/widgetStore.test.ts` with mocked RPC:

```ts
vi.mock('@/lib/rpc', () => ({
  rpcCreateWidget: vi.fn(),
  rpcCloneWidget: vi.fn(),
  rpcSaveWidget: vi.fn(),
}));

const checklistRecord = {
  schema: 'ghostboard-widget/v1',
  id: 'widget_1',
  kind: 'checklist',
  title: 'List',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
  data: { items: [] },
} satisfies WidgetRecord;
```

Cover these assertions:

```ts
expect(useWidgetStore.getState().records.widget_1).toEqual(checklistRecord);
expect(useWidgetStore.getState().history.widget_1.past).toHaveLength(1);
expect(rpcSaveWidget).not.toHaveBeenCalled();
vi.advanceTimersByTime(400);
expect(rpcSaveWidget).toHaveBeenCalledWith(expect.objectContaining({ id: 'widget_1' }));
```

- [ ] **Step 2: Add history depth and history reset tests**

Add tests that call `updateWidget` 51 times and assert:

```ts
expect(useWidgetStore.getState().history.widget_1.past).toHaveLength(50);
```

Then call `hydrate({ widget_1: checklistRecord })` after updates and assert:

```ts
expect(useWidgetStore.getState().history.widget_1).toBeUndefined();
```

- [ ] **Step 3: Fix hydrate history reset**

Current `hydrate` preserves `history`. Change it to reset history for all hydrated ids:

```ts
hydrate: (records) => {
  set((s) => {
    const nextHistory = { ...s.history };
    for (const id of Object.keys(records)) {
      delete nextHistory[id];
    }
    return {
      records: { ...s.records, ...records },
      history: nextHistory,
    };
  });
},
```

- [ ] **Step 4: Add rpc wrapper tests**

In `src/mainview/lib/rpc.test.ts`, add coverage for:

```ts
await rpc.rpcCreateWidget('checklist');
expect(request.createWidget).toHaveBeenCalledWith({ kind: 'checklist', title: undefined });

await rpc.rpcCloneWidget('widget_1');
expect(request.cloneWidget).toHaveBeenCalledWith({ widgetId: 'widget_1' });

await rpc.rpcSaveWidget(checklistRecord);
expect(request.saveWidget).toHaveBeenCalledWith({ widget: checklistRecord });
```

- [ ] **Step 5: Verify store behavior**

Run:

```bash
bun run test src/mainview/store/widgetStore.test.ts src/mainview/lib/rpc.test.ts
```

Expected: widget store tests pass with fake timers and no canvas-store mutations.

---

### Task 4: Clone Widgets On Duplicate And Paste

**Files:**
- Modify: `src/mainview/store/canvasStore.ts`
- Modify: `src/mainview/store/canvasStore.test.ts`
- Modify: `src/mainview/hooks/useCanvasKeyboard.ts`
- Modify: `src/mainview/hooks/useContextMenu.ts`

- [ ] **Step 1: Add failing duplicate and paste tests**

In `src/mainview/store/canvasStore.test.ts`, mock `useWidgetStore.getState().cloneWidget` to return a new record:

```ts
const cloneWidgetMock = vi.fn(async (widgetId: string) => ({
  schema: 'ghostboard-widget/v1',
  id: `${widgetId}_clone`,
  kind: 'checklist',
  title: 'List clone',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
  data: { items: [] },
}));
```

Assert for duplicate:

```ts
await useCanvasStore.getState().duplicateSelected();
const widgetNodes = useCanvasStore.getState().nodes.filter((n) => n.type === 'widget');
expect(widgetNodes.map((n) => (n.data as any).widgetId)).toEqual([
  'widget_source',
  'widget_source_clone',
]);
```

Assert for paste:

```ts
useCanvasStore.setState({ clipboard: [sourceWidgetNode], clipboardEdges: [] });
await useCanvasStore.getState().pasteClipboard();
expect(cloneWidgetMock).toHaveBeenCalledWith('widget_source');
```

- [ ] **Step 2: Make paste and duplicate async**

Change the store interface:

```ts
pasteClipboard: (offset?: number) => Promise<void>;
duplicateSelected: (offset?: number) => Promise<void>;
```

Add a helper in `canvasStore.ts`:

```ts
async function cloneWidgetReferences(nodes: Node[]): Promise<Node[]> {
  const { useWidgetStore } = await import('@/store/widgetStore');
  const cloneWidget = useWidgetStore.getState().cloneWidget;
  const cloned: Node[] = [];
  for (const node of nodes) {
    if (node.type !== 'widget') {
      cloned.push(node);
      continue;
    }
    const widgetId = (node.data as Record<string, unknown>).widgetId;
    if (typeof widgetId !== 'string') {
      cloned.push(node);
      continue;
    }
    const record = await cloneWidget(widgetId);
    cloned.push({
      ...node,
      data: {
        ...node.data,
        widgetId: record?.id ?? widgetId,
        kind: record?.kind ?? (node.data as Record<string, unknown>).kind,
      },
    });
  }
  return cloned;
}
```

Use the helper after `buildPastedClipboard` and before `set`.

- [ ] **Step 3: Update callers to handle promises**

In `src/mainview/hooks/useCanvasKeyboard.ts` and `src/mainview/hooks/useContextMenu.ts`, call async methods with `void` and catch logging:

```ts
void duplicateSelected().catch((error) => {
  console.error('[canvas] Failed to duplicate selection:', error);
});
```

Use the same pattern for `pasteClipboard`.

- [ ] **Step 4: Verify clone semantics**

Run:

```bash
bun run test src/mainview/store/canvasStore.test.ts src/mainview/hooks/useCanvasKeyboard.test.tsx src/mainview/hooks/useContextMenu.test.tsx
```

Expected: duplicate and paste create new node ids and new `widgetId` values for widget nodes.

---

### Task 5: Implement Focused Checklist Widget Editing And Cmd+Z Routing

**Files:**
- Modify: `src/mainview/lib/canvasNodePredicates.ts`
- Modify: `src/mainview/components/canvas/FocusedView.tsx`
- Modify: `src/mainview/components/canvas/ChecklistFocusedView.tsx`
- Modify: `src/mainview/hooks/useCanvasKeyboard.ts`
- Modify: `src/mainview/components/canvas/FocusedView.test.tsx` if present; otherwise add focused widget tests to `src/mainview/routes/index.test.tsx`

- [ ] **Step 1: Make widgets focusable**

In `src/mainview/lib/canvasNodePredicates.ts`, add `widget`:

```ts
const FOCUSABLE_NODE_TYPES = new Set<string>([
  'card',
  'image',
  'asset',
  'link',
  'widget',
]);
```

- [ ] **Step 2: Add focused view tests for checklist widget**

Render a focused widget with a hydrated widget record and assert editing calls `widgetStore.updateWidget`, not `commitNodeData`:

```ts
expect(updateWidgetMock).toHaveBeenCalledWith(
  'widget_1',
  expect.any(Function)
);
expect(commitNodeDataMock).not.toHaveBeenCalled();
expect(commitFolderChildDataMock).not.toHaveBeenCalled();
```

- [ ] **Step 3: Route FocusedView by node type and widget kind**

In `FocusedView.tsx`, read `node.type === 'widget'`, get `widgetId` and record from `useWidgetStore`, and render checklist focused editing only when:

```ts
node.type === 'widget' &&
record &&
!isWidgetLoadError(record) &&
record.kind === 'checklist'
```

The commit handler must update only widget store:

```ts
updateWidget(widgetId, (current) => ({
  ...current,
  data: {
    ...current.data,
    items: nextItems,
  },
  updatedAt: new Date().toISOString(),
}));
```

- [ ] **Step 4: Add keyboard routing tests**

In `src/mainview/hooks/useCanvasKeyboard.test.tsx`, set state so the focused node is a widget and press Cmd+Z:

```ts
fireEvent.keyDown(document, { key: 'z', metaKey: true });
expect(undoWidgetMock).toHaveBeenCalledWith('widget_1');
expect(canvasUndoMock).not.toHaveBeenCalled();
```

Add Shift+Cmd+Z for redo:

```ts
fireEvent.keyDown(document, { key: 'Z', metaKey: true, shiftKey: true });
expect(redoWidgetMock).toHaveBeenCalledWith('widget_1');
```

- [ ] **Step 5: Implement keyboard routing**

In `useCanvasKeyboard.ts`, before canvas undo/redo, check the focused widget:

```ts
const focused = useCanvasStore.getState().focusedNode;
if (focused?.type === 'widget') {
  const widgetId = typeof focused.data.widgetId === 'string' ? focused.data.widgetId : '';
  if (widgetId) {
    const widgetStore = useWidgetStore.getState();
    if (event.shiftKey) {
      widgetStore.redoWidget(widgetId);
    } else {
      widgetStore.undoWidget(widgetId);
    }
    event.preventDefault();
    return;
  }
}
```

- [ ] **Step 6: Verify focused editing**

Run:

```bash
bun run test src/mainview/hooks/useCanvasKeyboard.test.tsx src/mainview/routes/index.test.tsx
```

Expected: widget focused editing never writes `items` to canvas node data, and Cmd+Z routes to `widgetStore`.

---

### Task 6: Implement Legacy Checklist Lazy Migration

**Files:**
- Modify: `src/bun/index.ts`
- Modify: `src/bun/index.test.ts`
- Modify: `src/bun/nodeMetadata.ts` if an exported key-rewrite helper is needed
- Modify: `src/mainview/components/canvas/nodes/CardNode.tsx`
- Modify: `src/mainview/components/canvas/nodes/CardNode.test.tsx`

- [ ] **Step 1: Add loadCanvas migration tests**

In `src/bun/index.test.ts`, add tests for:

- top-level legacy checklist card becomes `type: 'widget'`
- folder-child legacy checklist card becomes `type: 'widget'`
- deterministic id is `widget_${noteId.replace(/^note_/, '')}`
- widget record contains item ids
- migration failure returns the original card node

Core assertion:

```ts
expect(result?.nodes[0]).toMatchObject({
  id: 'checklist-card-1',
  type: 'widget',
  data: { widgetId: 'widget_abc123', kind: 'checklist' },
});
expect(result?.widgets?.widget_abc123).toMatchObject({
  id: 'widget_abc123',
  kind: 'checklist',
  data: {
    items: [
      expect.objectContaining({
        id: expect.stringMatching(/^item_/),
        text: 'First migrated item',
        checked: false,
      }),
    ],
  },
});
```

- [ ] **Step 2: Implement migration helper**

Add a helper near `hydrateCardNoteData` in `src/bun/index.ts`:

```ts
function widgetIdForChecklistNote(noteId: string): string {
  return `widget_${noteId.replace(/^note_/, '')}`;
}

function checklistRecordFromCard(
  noteId: string,
  cardData: Record<string, unknown>
): WidgetRecord {
  const now = new Date().toISOString();
  const items = Array.isArray(cardData.items) ? cardData.items : [];
  return {
    schema: 'ghostboard-widget/v1',
    id: widgetIdForChecklistNote(noteId),
    kind: 'checklist',
    title: typeof cardData.title === 'string' ? cardData.title : '',
    createdAt: now,
    updatedAt: now,
    data: {
      items: items.map((item) => {
        const raw = (item ?? {}) as Record<string, unknown>;
        return {
          id: `item_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`,
          text: typeof raw.text === 'string' ? raw.text : '',
          checked: raw.checked === true,
        };
      }),
    },
  };
}
```

If a stable id generator already exists in the repo, use it instead of duplicating UUID slicing.

- [ ] **Step 3: Apply migration in both hydrate paths**

After hydrating card data, if:

```ts
hydrated.type === 'checklist'
```

then create or load the deterministic widget record. Return:

```ts
{
  ...node,
  type: 'widget',
  data: { widgetId, kind: 'checklist' },
}
```

Add the same logic for folder children.

- [ ] **Step 4: Preserve legacy CardNode until migration is complete**

Do not delete the `CardNode` checklist renderer in this task. Keep it as the fallback for migration failure and old manifests that fail to write widgets.

- [ ] **Step 5: Verify migration**

Run:

```bash
bun run test src/bun/index.test.ts src/bun/widgets.test.ts
```

Expected: legacy checklist cards migrate to widget nodes at load time, and a failed widget write leaves the original checklist card visible.

---

### Task 7: Export Checklist Widgets To Markdown

**Files:**
- Modify: `src/bun/index.ts`
- Modify: `src/bun/index.test.ts`
- Reuse: `src/bun/notes.ts`
- Reuse: `src/bun/markdownExport.ts`

- [ ] **Step 1: Add an export test for checklist widget**

In `src/bun/index.test.ts`, create a view manifest with a checklist widget and mock `loadWidgets` or write a widget file. Assert the exported notes directory contains a Markdown file with GFM checklist rows:

```md
- [ ] First task
- [x] Done task
```

- [ ] **Step 2: Collect widget references beside note references**

Replace `collectViewNoteIds` with a collector that returns both:

```ts
interface ViewExportRefs {
  noteIds: string[];
  widgetIds: string[];
}
```

For top-level widget nodes and folder-child widgets, collect `data.widgetId`.

- [ ] **Step 3: Build exported Markdown for checklist widgets**

Use `loadWidgets(wsPath, widgetIds)` and `serializeChecklistItems` from `src/bun/notes.ts`:

```ts
const body = serializeChecklistItems(record.data.items);
const markdown = includeFrontmatter
  ? `---\ntitle: ${JSON.stringify(record.title)}\n---\n\n${body}\n`
  : `# ${record.title || record.id}\n\n${body}\n`;
```

Push it into the same `exportedNotes` list shape used by `buildIndexMarkdown`.

- [ ] **Step 4: Verify export**

Run:

```bash
bun run test src/bun/index.test.ts
```

Expected: view-scoped Markdown export includes checklist widget content and still exports regular notes.

---

### Task 8: Defer Or Gate Phase 3 And Phase 4 Work

**Files:**
- Modify only when implementing the specific deferred feature:
  `src/bun/search.ts`, `src/bun/cleanup.ts`, `src/bun/templates.ts`, `src/mainview/components/library/LibraryCard.tsx`, `src/mainview/data/initialNodes.ts`, Canvas JSON import/export code.

- [ ] **Step 1: Keep Pomodoro and Reminder visible only after they are functional**

If Phase 3 is not implemented in the same branch, hide `pomodoro` and `reminder` menu items by leaving them out of `getCreatableMenuItems` while preserving Bun-side default record support.

- [ ] **Step 2: Add explicit tests before exposing each deferred area**

Before marking the system complete, add tests from the spec for:

```text
search: widget title/item/note/dueAt matching
cleanup: unreferenced widget deletion and trash-view protection
library: checklist widget excerpt generation
templates: legacy checklist migration or widget seed install path
Canvas JSON export: widget records included or UI warning shown
```

- [ ] **Step 3: Use separate commits**

Commit boundaries:

```bash
git add src/mainview/lib src/mainview/routes src/mainview/components src/mainview/store src/mainview/hooks messages
git commit -m "feat: complete widget phase one renderer flow"

git add src/bun/index.ts src/bun/index.test.ts src/bun/widgets.ts src/bun/widgets.test.ts
git commit -m "feat: migrate checklist cards to widgets"

git add src/bun/index.ts src/bun/index.test.ts src/bun/markdownExport.ts
git commit -m "feat: export checklist widgets to markdown"
```

---

## Verification Commands

Run these before considering this recovery complete:

```bash
bun run test src/bun/widgets.test.ts
bun run test src/bun/index.test.ts
bun run test src/mainview/store/widgetStore.test.ts
bun run test src/mainview/lib/canvasNodeRegistry.test.ts src/mainview/lib/creatableNodes.test.ts src/mainview/lib/canvasNodeSerialization.test.ts
bun run test src/mainview/store/canvasStore.test.ts src/mainview/hooks/useCanvasKeyboard.test.tsx src/mainview/hooks/useContextMenu.test.tsx
bun run test src/mainview/routes/index.test.tsx src/mainview/components/canvas/ViewSwitcher.test.tsx
```

`bun run type-check` currently fails in `node_modules/electrobun` in this workspace before project errors are surfaced. Track that separately from widget recovery unless it is newly introduced by this branch.
