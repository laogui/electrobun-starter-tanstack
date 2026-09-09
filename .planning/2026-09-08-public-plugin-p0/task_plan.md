# Task Plan: Continue Public Plugin P0

## Goal
Advance the remaining P0 acceptance work from the PRD with a production-quality, verified implementation or a documented, evidence-backed platform boundary where the chosen container cannot meet it.

## Next Step
Do not integrate the macOS helper or open public panel installation: the direct WebRTC/STUN canary rejected it. A later P0 slice needs a different, independently verifiable view container or a verified WebRTC-disable/proxy design.

## Current Phase
Phase 4

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify the P0 delivery/exit criteria in PRD §7.1 and plugin redesign §19
- [x] Record inherited P0 implementation state and remaining validation gaps
- [x] Map source, tests, experiment artifacts, and recent commits to a concrete next slice
- **Status:** complete

### Phase 2: P0 Container Evidence
- [x] Map the OS WKWebView helper's current coverage against the §11.1 bypass/resource requirements
- [x] Add the highest-value missing canaries without weakening isolation
- [x] Rerun the macOS probe and record an evidence-backed result
- **Status:** complete

### Phase 3: Implementation
- [x] Execute the probe-only implementation
- [x] Keep the helper host-owned and unable to serve filesystem URLs or a script bridge
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Run focused checks and inspect the final evidence/documentation diff
- [x] Document the verified P0 boundary and remaining block
- [x] Rerun the type-check gate after making its generated i18n prerequisite reproducible
- [x] Run a direct WebRTC/STUN loopback canary and update the network verdict from observed traffic
- **Status:** complete

### Phase 5: Delivery
- [x] Review outputs
- [x] Deliver the evidence-backed P0 boundary to user
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Continue the public-plugin P0 track, not the historical P0 list | PRD §7.1 explicitly distinguishes plugin P0–P5 from retired historical priority numbers. |
| Start from acceptance gaps rather than adding new P1/P2 scope | The redesign records working QuickJS logic and installer prototypes; P0 still requires a safe view-container conclusion and full evidence. |
| Advance container validation before attempting product integration | The previous P0 plan explicitly kept public activation closed because no product-ready view container had passed a sufficiently broad canary. The native helper is the only candidate with bridge/network recovery evidence, but its direct-network bypass coverage is incomplete. |
| Test package resources and non-URL network exposure in the helper before integration | P0 §11.1 requires both relative-module/resource viability and proof that network exits cannot bypass policy; the current `about:blank` probe cannot establish either. |
| Generate Paraglide declarations inside the documented TypeScript gate | `src/paraglide` is ignored generated output; new messages otherwise make a clean dependency install fail before TypeScript can evaluate product code. |
| Use a loopback UDP STUN sink to distinguish WebRTC uncertainty from a demonstrated bypass | `RTCPeerConnection` and a local ICE candidate show capability exposure but not egress. An unauthenticated, response-free local STUN endpoint records only whether the page sent a packet. |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| The first planning-file update patch did not match the template's malformed table layout | Read the active plan and will replace the whole table section with explicit header/separator ordering. |
