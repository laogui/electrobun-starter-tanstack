# License Check Cold-Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove license RPC cold-start latency from ordinary node creation while preserving the 100-card free limit through the renderer's single RPC transport and a session cache.

**Architecture:** Add license request functions to the existing shared `src/mainview/lib/rpc.ts` transport. Convert `rpc-license.ts` into a transport-independent cache with one in-flight refresh, then make `canvasStore.createNode` consult it only when a card/sticky creation would exceed the free limit. Prefetch the cache non-blockingly from the root route and refresh it after successful activation.

**Tech Stack:** TypeScript, Bun, Electrobun RPC, React, Zustand, Vitest, Testing Library.

---

### Task 1: Limit license gating to the actual boundary

**Files:**
- Modify: `src/mainview/store/canvasStore.test.ts`
- Modify: `src/mainview/store/canvasStore.ts`

- [ ] **Step 1: Write failing canvas-store tests**

Add tests asserting that card creation below 100 and non-card creation at 100 do not call `rpcCheckLicense`, that an explicit unlicensed result blocks the 101st card/sticky, that an activated result permits it, and that a rejected request preserves fail-open behavior.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `bun run test src/mainview/store/canvasStore.test.ts`

Expected: the no-RPC assertions fail because every creation currently awaits `rpcCheckLicense`, and non-card creation at the boundary is currently blocked.

- [ ] **Step 3: Implement the minimal boundary gate**

Change `createNode` so the license check runs only when `type` is `card` or `sticky` and the current card/sticky count is at least 100. Preserve the current catch-and-continue behavior.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `bun run test src/mainview/store/canvasStore.test.ts`

Expected: all canvas-store tests pass.

### Task 2: Put license requests on the shared RPC transport

**Files:**
- Modify: `src/mainview/lib/rpc.test.ts`
- Modify: `src/mainview/lib/rpc.ts`

- [ ] **Step 1: Write failing shared-RPC tests**

Extend the mocked request map with `checkLicense` and `activateLicense`. Assert that the public functions return null-like fallbacks outside Electrobun, forward the correct payloads in Electrobun, and reuse the one existing `Electroview` instance across settings and license calls.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test src/mainview/lib/rpc.test.ts`

Expected: tests fail because `rpcCheckLicense` and `rpcActivateLicense` are not exported by `rpc.ts`.

- [ ] **Step 3: Implement the shared license RPC functions**

Define the renderer-facing `LicenseInfo` type in `rpc.ts`. Add `rpcCheckLicense()` and `rpcActivateLicense(key)` using the module's existing `getElectrobun()` instance.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test src/mainview/lib/rpc.test.ts`

Expected: all shared RPC tests pass and `ElectroviewCtor` remains called once.

### Task 3: Replace the duplicate client with a session cache

**Files:**
- Create: `src/mainview/lib/rpc-license.test.ts`
- Modify: `src/mainview/lib/rpc-license.ts`
- Modify: `src/mainview/store/canvasStore.test.ts`
- Modify: `src/mainview/store/canvasStore.ts`

- [ ] **Step 1: Write failing cache tests**

Mock `@/lib/rpc` and assert that `refreshLicense()` caches a successful result, concurrent refreshes share one transport request, rejected refreshes resolve to null without destroying the last cached result, and successful `rpcActivateLicense()` refreshes the cache.

- [ ] **Step 2: Run the focused cache test and verify RED**

Run: `bun run test src/mainview/lib/rpc-license.test.ts`

Expected: tests fail because the cache API does not exist and `rpc-license.ts` still constructs its own `Electroview`.

- [ ] **Step 3: Implement the cache**

Keep `LicenseInfo` as a type re-export from `rpc.ts`. Add synchronous `getCachedLicense()`, deduplicated `refreshLicense()`, and activation that delegates to shared RPC and refreshes after success. Export a test-only cache reset helper only if module reset is insufficient for deterministic tests.

- [ ] **Step 4: Make the canvas gate cache-aware**

At the 100-card boundary, allow immediately for a cached activated license. Otherwise refresh once; reject only an explicit unactivated result and allow on `null`/failure.

- [ ] **Step 5: Run cache and canvas tests and verify GREEN**

Run: `bun run test src/mainview/lib/rpc-license.test.ts src/mainview/store/canvasStore.test.ts`

Expected: both suites pass.

### Task 4: Prefetch without blocking application startup

**Files:**
- Modify: `src/mainview/routes/__root.test.tsx`
- Modify: `src/mainview/routes/__root.tsx`
- Modify: `src/mainview/components/LicenseStatusCard.tsx`

- [ ] **Step 1: Write a failing root-route prefetch test**

Mock `refreshLicense` and assert it is called once on root mount independently from settings loading.

- [ ] **Step 2: Run the root-route test and verify RED**

Run: `bun run test src/mainview/routes/__root.test.tsx`

Expected: test fails because the root route does not prefetch the license.

- [ ] **Step 3: Add non-blocking prefetch and cache consumers**

Call `void refreshLicense()` in a mount effect. Update license status components to use the cache-backed refresh function so they share startup work instead of issuing independent transport requests.

- [ ] **Step 4: Run the root-route test and verify GREEN**

Run: `bun run test src/mainview/routes/__root.test.tsx`

Expected: all root-route tests pass.

### Task 5: Full verification

**Files:**
- Review all changed files.

- [ ] **Step 1: Run focused license and node tests**

Run: `bun run test src/mainview/lib/rpc.test.ts src/mainview/lib/rpc-license.test.ts src/mainview/store/canvasStore.test.ts src/mainview/routes/__root.test.tsx`

Expected: all focused suites pass.

- [ ] **Step 2: Run the full test suite**

Run: `bun run test`

Expected: all Vitest suites pass.

- [ ] **Step 3: Run type checking and repository checks**

Run: `bun run type-check`

Run: `bun run check`

Expected: both commands exit successfully. Any unrelated pre-existing failure is reported separately with its file and diagnostic.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check`

Run: `git diff -- src/mainview/lib/rpc.ts src/mainview/lib/rpc-license.ts src/mainview/store/canvasStore.ts src/mainview/routes/__root.tsx`

Expected: no whitespace errors; the license module contains no `electrobun/view` import or `Electroview` construction; ordinary creation has no awaited license dependency.
