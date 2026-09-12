# Task Plan: T3 author toolchain

## Goal
Deliver the remaining independently reviewable T3 author-toolchain slice: a deterministic installable-package build command, standalone importer and combined-plugin templates, and a single-file AI reference, with author-facing tests, documentation, and proportional packaged evidence.

## Next Step
Begin the T3 exit slice: use the public toolchain to verify command, panel, CSV importer, and canvas type as independent final-user packages, with honest public HTTPS and platform boundaries.

## Current Phase
Complete

## Phases

### Phase 1: Requirements & Discovery
- [x] Recover the completed generic importer configuration slice and recorded next task
- [x] Map current plugin creation, template, fixture and package-validation paths
- [x] Identify deterministic packaging and AI-reference constraints
- [x] Record discoveries in findings.md
- **Status:** complete

### Phase 2: Contract Freeze
- [x] Freeze CLI inputs, outputs, archive layout and failure behavior
- [x] Freeze standalone importer and combined template contents
- [x] Freeze the single-file AI reference and verification scope
- **Status:** complete

### Phase 3: Implementation
- [x] Implement package build command and deterministic installer validation
- [x] Add or update author templates and verification
- [x] Add the single-file AI reference and author documentation
- [x] Migrate the T3 packaged fixture from the system `zip` tool to the public packer
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Run focused CLI/template tests
- [x] Run type-check and scoped/full static checks
- [x] Run proportional packaged or installer verification
- [x] Document exact results and remaining T3 exit work
- **Status:** complete

### Phase 5: Delivery
- [x] Review diff and working-tree state
- [x] Update T3/development planning documents
- [x] Commit the completed slice with a conventional subject
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Implement the author toolchain before T3 exit verification | The current T3 plan explicitly records this as the remaining capability slice; the exit run should consume the public toolchain rather than bespoke fixture assembly. |
| Expose `--importer` and `--combined` while preserving the default and `--react` create modes | The missing author paths become explicit without breaking the existing scaffold command. |
| Ship the deterministic packer inside `@ghostboard/sdk` and invoke it from generated `bun run package` scripts | Generated external projects keep a self-contained toolchain and final packages do not depend on the host repository or a platform `zip` binary. |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Combined AI-reference/README patch missed the React README's exact wrapped sentence. | Split file additions from README edits and re-read the exact README context before retrying. |
| First full static check reported 20 deterministic formatter/import-order diagnostics plus intentional CRC bitwise operations. | Added scoped CRC suppressions and a top-level output regex, then will apply the repository formatter to the affected files. |
| A combined evidence/platform patch used the wrong shortened React hash as its anchor. | Re-read the exact evidence line, corrected the full 64-character hash separately, then updated the platform plan. |
| A combined evidence/progress patch assumed a progress sentence that had already been expanded. | Updated the evidence independently and re-read the planning files before the final phase transition. |
