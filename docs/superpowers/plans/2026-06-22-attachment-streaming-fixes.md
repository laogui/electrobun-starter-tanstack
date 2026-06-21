# Attachment Streaming Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make attachment uploads byte-correct and failure-safe, restore consistent media import behavior, and serve standards-compliant single byte ranges.

**Architecture:** Keep the renderer `File` pipeline as the single import path so metadata and progress behavior stay consistent. Stream bodies through Bun's documented `Response` wrapper into a same-directory temporary file before rename, and isolate HTTP range parsing as a pure function exercised through server responses.

**Tech Stack:** Bun 1.3, TypeScript, Electrobun RPC, React, Vitest, Testing Library, Ultracite/Biome.

---

### Task 1: Make streamed attachment writes byte-correct and atomic

**Files:**
- Modify: `src/bun/attachments.ts`
- Test: `src/bun/attachments.test.ts`

- [ ] **Step 1: Write failing stream persistence tests**

Add tests that create a temporary workspace, pass `new Blob(['actual bytes']).stream()` to `saveAttachmentStream`, read the returned attachment, and expect `actual bytes` rather than `[object ReadableStream]`. Add a second test whose stream errors and assert that no upload temporary file remains.

```ts
const saved = await saveAttachmentStream(wsPath, {
  body: new Blob(['actual bytes']).stream(),
  mimeType: 'text/plain',
  suggestedName: 'sample.txt',
});
expect(await Bun.file(join(wsPath, saved.filePath)).text()).toBe('actual bytes');
```

- [ ] **Step 2: Run tests and confirm the byte assertion fails**

Run: `bun run test -- src/bun/attachments.test.ts`

Expected: the saved file contains `[object ReadableStream]` or the stream input fails before the implementation is changed.

- [ ] **Step 3: Implement atomic Response-backed stream writing**

Restrict `SaveAttachmentStreamInput.body` to `ReadableStream<Uint8Array> | Blob | ArrayBuffer | Uint8Array`. Resolve the final target, create a unique sibling temporary path, and use:

```ts
const writeBody =
  input.body instanceof ReadableStream ? new Response(input.body) : input.body;
try {
  await Bun.write(tempPath, writeBody);
  await rename(tempPath, fullPath);
} catch (error) {
  await rm(tempPath, { force: true });
  throw error;
}
```

Use a structural stream check if `instanceof ReadableStream` is not reliable in the runtime. Do not change legacy data-URL or absolute-source-path writes.

- [ ] **Step 4: Run attachment tests**

Run: `bun run test -- src/bun/attachments.test.ts`

Expected: all attachment tests pass and persisted bytes match exactly.

### Task 2: Implement complete single-range responses

**Files:**
- Modify: `src/bun/localHttpServer.ts`
- Test: `src/bun/ai.test.ts`

- [ ] **Step 1: Add failing HTTP range tests**

Mock a five-byte Bun file with a `slice` implementation and test bounded, open-ended, suffix, clamped, unsatisfiable, malformed, multiple, and HEAD ranges.

```ts
expect(await requestRange('bytes=1-3')).toMatchObject({
  status: 206,
  contentRange: 'bytes 1-3/5',
  contentLength: '3',
});
expect((await requestRange('bytes=2-')).contentRange).toBe('bytes 2-4/5');
expect((await requestRange('bytes=-2')).contentRange).toBe('bytes 3-4/5');
expect((await requestRange('bytes=0-99')).contentRange).toBe('bytes 0-4/5');
expect((await requestRange('bytes=9-')).status).toBe(416);
```

- [ ] **Step 2: Run the local HTTP tests and confirm failures**

Run: `bun run test -- src/bun/ai.test.ts`

Expected: suffix, clamped-end, and 416 assertions fail against the current implementation.

- [ ] **Step 3: Add a pure range parser and response handling**

Define a top-level regular expression and a parser returning either a normalized `{ start, end }` or an unsatisfiable result. Clamp explicit ends, compute suffix starts, reject zero-size and multiple ranges, and return:

```ts
new Response(null, {
  status: 416,
  headers: {
    ...baseHeaders,
    'Content-Range': `bytes */${size}`,
  },
});
```

For valid `HEAD` ranges, retain status `206` and the same headers as `GET` while setting the body to `null`.

- [ ] **Step 4: Run local HTTP tests**

Run: `bun run test -- src/bun/ai.test.ts`

Expected: all local HTTP tests pass.

### Task 3: Restore one renderer File import pipeline

**Files:**
- Modify: `src/mainview/components/canvas/ViewSwitcher.tsx`
- Modify: `src/mainview/components/canvas/ViewSwitcher.test.tsx`
- Modify: `src/mainview/lib/assetImportProgress.tsx`
- Modify: `src/mainview/lib/assetFiles.ts`
- Modify: `src/mainview/lib/rpc.ts`
- Modify: `src/bun/index.ts`

- [ ] **Step 1: Replace the obsolete test with a failing menu-driven multi-file test**

Click the `File` menu item, spy on the hidden input's `click`, then dispatch two selected files. Mock two saved asset payloads and expect two calls in order. Assert that the input has the `multiple` attribute and that a failed first import does not block the second.

```ts
expect(saveAssetFileWithProgressToastMock).toHaveBeenNthCalledWith(1, firstFile);
expect(saveAssetFileWithProgressToastMock).toHaveBeenNthCalledWith(2, secondFile);
expect(onCreateNode).toHaveBeenCalledTimes(2);
```

- [ ] **Step 2: Run the ViewSwitcher test and confirm failure**

Run: `bun run test -- src/mainview/components/canvas/ViewSwitcher.test.tsx`

Expected: the menu calls the native RPC instead of the input and only the old direct-change test can pass.

- [ ] **Step 3: Restore the renderer input flow**

Make the input multiple and process a stable copy of `event.target.files`:

```ts
const files = Array.from(event.target.files ?? []);
event.target.value = '';
for (const file of files) {
  try {
    const data = await saveAssetFileWithProgressToast(file);
    await onCreateNode('asset', { data: { ...data } });
  } catch (error) {
    console.error('[ViewSwitcher] Failed to import selected file:', error);
  }
}
```

Point both create-menu asset actions back to `assetFileInputRef.current?.click()`. Remove `handlePickAssetFiles`, `rpcPickAssetFiles`, `saveAssetFromPathWithProgressToast`, and the `pickAssetFiles` RPC contract/handler/wrapper. Keep path-based saving and video poster fallback because they are still used by `saveAssetFile` and `ensureVideoThumbnail`.

- [ ] **Step 4: Run renderer import tests**

Run: `bun run test -- src/mainview/components/canvas/ViewSwitcher.test.tsx src/mainview/lib/assetFiles.test.ts`

Expected: both suites pass, with multi-file creation and media metadata tests intact.

### Task 4: Clean the touched code and verify the full change

**Files:**
- Modify as formatter requires: all changed non-generated source and test files
- Do not modify: `src/paraglide/runtime.js`

- [ ] **Step 1: Run targeted Ultracite fixes**

Run `bunx ultracite fix` only for the changed non-generated files. Remove the unused `baseName` and unnecessary `suggestedName` parameter from `generateVideoPosterFile`, type the picker result removal cleanly, move regular expressions to module scope, and avoid unhandled promises without `void` lint violations.

- [ ] **Step 2: Run targeted tests**

Run: `bun run test -- src/bun/attachments.test.ts src/bun/ai.test.ts src/mainview/components/canvas/ViewSwitcher.test.tsx src/mainview/lib/assetFiles.test.ts src/mainview/components/canvas/nodes/AssetNode.test.tsx`

Expected: all targeted tests pass.

- [ ] **Step 3: Run full tests and quality checks**

Run:

```text
bun run test
bun run type-check
bunx ultracite check <all changed non-generated files> --max-diagnostics=200
git diff --check
```

Expected: tests and targeted Ultracite checks pass. Type-check output contains no project-source error; any remaining failure must be limited to previously existing dependency diagnostics. `git diff --check` produces no output.

- [ ] **Step 4: Inspect final scope**

Run: `git status --short` and `git diff --stat`

Expected: only the requested attachment/import changes and approved design/plan documents are present; `src/paraglide/runtime.js` remains exactly as it was at the start of implementation.
