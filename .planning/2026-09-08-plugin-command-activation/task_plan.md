# Task Plan: Stored Plugin Command Activation

## Goal
Turn safely stored command-only plugin packages into a truthful workspace-level activation path: discover their declarations, persist enablement, and expose executable commands only where the existing constrained QuickJS runtime can run them.

## Next Step
Keep the command-only desktop acceptance evidence as the current P0 baseline; the next product slice is command-context availability/discovery after the panel isolation block is resolved.

## Current Phase
Phase 6

## Phases

### Phase 1: Discovery and Boundary
- [x] Inspect dynamic command runtime feasibility, including loading saved package source and manifest declarations
- [x] Identify the existing product command/menu surfaces that can host dynamic commands without duplicating or bypassing authorization
- [x] Define activation status and clear unsupported-contribution behavior
- **Status:** complete

### Phase 2: Host Registration and Persistence
- [x] Implement workspace-scoped command plugin binding/enablement using only validated stored packages
- [x] Load declared handlers through the constrained QuickJS runtime and existing permission path
- [x] Add host tests for discovery, activation, rejection, and recovery
- **Status:** complete

### Phase 3: Product Experience
- [x] Extend Plugins settings with truthful command activation controls/status
- [x] Add a product command entry point that executes an enabled dynamic plugin command
- [x] Add localized renderer behavior tests
- **Status:** complete

### Phase 4: Verification and Delivery
- [x] Run focused tests, typing, formatting, and diff checks
- [x] Record unsupported panels/importers/canvas types and the baseline test-environment block
- **Status:** complete

### Phase 5: Restore the Full Test Gate
- [x] Replace the implicit sibling-repository dependency with a controlled fixture fallback
- [x] Preserve `GHOSTBOARD_PLUGIN_SAMPLES` as an explicit external-sample override
- [x] Run `src/bun/index.test.ts` and the entire Vitest suite; fix regressions attributable to the fixture change
- **Status:** complete

### Phase 6: Desktop Command Acceptance
- [x] In a disposable workspace, install `title-tools` through Settings and confirm the required-permission activation
- [x] Verify native `Plugins` command execution, title update, canvas Undo/Redo, disable/RPC refusal, restart persistence, and copy/move non-inheritance
- [x] Capture durable, non-sensitive evidence of each observed outcome
- **Status:** complete

### Phase 7: Evidence and Product Status
- [x] Update P0 evidence and PRD/redesign status with the verified desktop result and remaining panel-isolation block
- [x] Re-run focused quality gates and review the final diff
- **Status:** complete

## Non-Negotiable Boundaries
- Third-party panels stay disabled until a verified view container exists.
- Activation never grants permissions implicitly and never gives plugins a direct filesystem, network, native bridge, Node, Bun, or renderer-store handle.
- Stored package status remains distinct from enabled command status.
