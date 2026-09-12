# Task Plan: T3 exit verification

## Goal
Complete the T3 exit slice by proving command, panel, CSV importer, and canvas type as independent installable final-user packages built with the public author toolchain, exercising the real packaged application, and recording truthful public HTTPS, native-picker, and platform boundaries.

## Next Step
Begin T4 fault handling, safe mode, signing, TOFU update, and rollback contract discovery from the completed T3 boundary.

## Current Phase
Complete

## Phases

### Phase 1: Requirements & Discovery
- [x] Recover the completed author-toolchain slice and recorded next task
- [x] Map the T3 combined fixture and packaged-app acceptance harness
- [x] Map exact T3 exit requirements and public HTTPS/platform constraints
- [x] Record discoveries in findings.md
- **Status:** complete

### Phase 2: Contract Freeze
- [x] Define four independent package identities and contribution scopes
- [x] Define packaged-app install/enable/run/isolation/restart assertions
- [x] Decide the strongest safe public HTTPS and native-picker evidence possible without publishing external state
- **Status:** complete

### Phase 3: Implementation
- [x] Add independent fixtures and package them exclusively through the public packer
- [x] Extend the packaged-app probe for all four final-user packages
- [x] Update author/acceptance scripts and focused tests
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Run deterministic fixture/package validation
- [x] Run the real packaged application acceptance path, including restart and contribution isolation
- [x] Run type-check, static checks, and proportional/full regression
- [x] Record exact evidence and remaining cross-platform boundaries
- **Status:** complete

### Phase 5: Delivery
- [x] Review diff, security-sensitive paths, and working-tree state
- [x] Update T3/platform/development planning documents
- [x] Commit the completed slice with a conventional subject
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Treat this as a new isolated planning session | The author-toolchain slice is complete and committed; T3 exit has separate fixtures, real-app evidence, and boundary decisions. |
| Do not claim T3 exit until the four contribution classes are independently packaged and exercised | The existing combined fixture proves breadth but not package-level isolation or independent final-user installation. |
| Use IDs `t3.exit.command`, `t3.exit.panel`, `t3.exit.canvas`, and `t3.exit.importer`, with exactly one matching contribution in each package | Exact identities make package boundaries and disable isolation machine-checkable. |
| Install all four locally, exercise their real UI/runtime behavior, disable each independently, then verify all four after a same-workspace restart | This directly tests the exit condition and lifecycle isolation without replacing prior deep combined-importer coverage. |
| Preserve the combined package and loopback-download phase as regression evidence, but rebuild it through the public packer | T3's detailed importer/recovery scenarios remain valuable and the real runner must match the public author path. |
| Do not upload a package merely to manufacture public HTTPS evidence | The repository has only credentialed R2 release upload plumbing and no existing public plugin artifact; external publication is not implied by “continue.” |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Initial recovery command treated `.planning/.active_plan` as a repository-relative path instead of a name under `.planning/`. | Re-read the completed session from `.planning/2026-09-12-t3-author-toolchain/` and initialized this isolated session. |
| First discovery invocation contained malformed JavaScript wrapper syntax before any shell command ran. | Corrected the wrapper and kept the intended read-only search unchanged. |
| Second discovery wrapper also failed parsing because an invalid placeholder was left in the object literal. | Removed the placeholder and simplified the next invocation. |
| A later discovery call was accidentally submitted with prose in place of JavaScript. | Reissued only a valid read-only command wrapper; no shell command ran. |
| A combined phase-transition patch incorrectly targeted a findings section inside `progress.md` and was rejected atomically. | Split the plan, progress, and findings updates by file using exact current context. |
