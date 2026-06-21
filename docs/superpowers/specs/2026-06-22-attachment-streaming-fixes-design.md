# Attachment Streaming Fixes Design

## Scope

Fix the uncommitted attachment-import changes without modifying
`src/paraglide/runtime.js`. The change must prevent uploaded-byte corruption,
restore media metadata and visible import feedback, implement correct single
HTTP byte-range behavior, and leave the touched source files passing their
targeted tests and lint checks.

## Upload Persistence

`/attachment/upload` continues to accept a raw renderer `File` or `Blob` body.
The server wraps `Request.body` in a `Response`, which is the Bun-supported way
to pass a `ReadableStream` to `Bun.write`. Uploads are first written to a unique
temporary file beside the final attachment. After a successful write the file
is atomically renamed to the resolved attachment path. On any error the
temporary file is removed and the request fails without returning an attachment
reference.

The stream input type is limited to the body types the function actually
supports. It does not refer to the unavailable global `BunFile` type. Existing
data-URL and absolute-path attachment save paths remain unchanged.

## File Selection and Metadata

The bottom create menu uses the renderer file input with multiple selection,
instead of the new `pickAssetFiles` RPC. Each selected `File` follows the same
`saveAssetFile` pipeline used by drag-and-drop and the canvas context menu:

- When the desktop runtime exposes an absolute `File.path`, Bun copies the
  source directly.
- Otherwise the renderer streams the `File` through `/attachment/upload`.
- Images retain thumbnails, videos retain duration/posters, and audio retains
  duration/waveform metadata.
- Every file displays staged import feedback and creates one asset node.

The obsolete picker RPC, renderer wrapper, dead callbacks, and now-unused input
references are removed. Video poster fallback remains available through the
existing `generateVideoThumbnail` RPC.

## HTTP Range Semantics

Attachment serving supports one byte range per request:

- `bytes=start-end`
- `bytes=start-`
- `bytes=-suffixLength`

An explicit end beyond the file length is clamped to the final byte. Malformed,
multiple, empty, zero-length suffix, and otherwise unsatisfiable ranges return
`416` with `Content-Range: bytes */size`. Valid ranges return `206` with exact
`Content-Length` and `Content-Range`. Requests without `Range` retain the normal
`200` behavior. `HEAD` returns the same status and headers as `GET` without a
body.

## Error Handling

Failed upload writes must not leave temporary files or return successful JSON.
Picker failures are caught and logged without producing an unhandled promise
rejection. A failure importing one selected file does not prevent remaining
selected files from being attempted.

## Tests and Verification

Tests are added before implementation for:

- Real stream bytes persisted to a temporary workspace, including cleanup on
  failure where practical.
- Open-ended, bounded, clamped, suffix, malformed, and unsatisfiable ranges for
  both `GET` and `HEAD`.
- Clicking the create-menu file action, selecting multiple files, invoking the
  real renderer save path, and creating one node per successful import.

Verification consists of targeted Vitest runs, the full Vitest suite, targeted
Ultracite checks for all modified non-generated files, `git diff --check`, and a
type-check review that distinguishes project-source failures from existing
dependency failures.
