# Findings
- Desktop has existing uncommitted AI/editor changes in index.ts, settingsClient/rpc, settings UI and both locale JSON files. Preserve those changes.
- Backend starts clean and uses Hono, Drizzle/Postgres, staffProcedure, and Paraglide en/zh. Existing /api/v1 license REST routes provide desktop API convention.
- Desktop app-level data root is ~/.ghostboard/{channel}, overridable with GHOSTBOARD_DATA_DIR. Settings otherwise belong to the workspace.
- No persistent application logger or crash reporting is present.
- Existing root planning files concern a completed plugin task; isolated planning directory created for this request.

- Electrobun 1.18 has before-quit lifecycle but no webview/native crash notification or dump API. Persistent session marker detects abnormal termination on restart and explicitly distinguishes it from proven crashes.
- Endpoint configured through GHOSTBOARD_SUPPORT_API_URL at build/runtime; dev fallback localhost:3001/api/v1, release requires configured HTTPS.
- Backend generated migration 0004_desktop_reports; public feedback/crash endpoints use 256 KiB body limit, 128 KiB logs, report UUID dedup and 60/hour/IP-hash quota under a transaction lock. Staff-only tRPC list/detail/status with management UI under /admin/logs.

- Backend .env declares PORT=8787, so dev support fallback corrected to localhost:8787/api/v1 (legacy license default 3001 is unrelated).
- Per-process session marker and live PID check prevent reporting another running app instance as an abnormal exit.

- Body budget is 512 KiB so escaped JSONL logs plus fields fit; diagnostics remain 128 KiB UTF-8.
- Server has no automatic retention job; docs explicitly distinguish persistent database reports from the local 14-day queue.
- Existing backend logs.tsx has one pre-existing array-index-key lint warning; modified/new backend files have no lint errors.
