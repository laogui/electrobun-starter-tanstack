# Packaged trusted-plugin T0 probe

Run from the repository root on macOS arm64:

```sh
bun run test:plugin-t0
```

The runner builds a canary release, extracts the release archive, and launches its bundled executable with a fresh data directory. It copies the no-build fixtures outside the checkout and app bundle. It does not launch the Vite development server or execute plugin code in Bun.

A successful process exit requires real renderer checks for HTTP imports (including a relative module), host React/SDK identity, a working `useState` update, independent root cleanup, a host HTTPS request, a UTF-8 file round trip, and legacy package rejection/data preservation. Any failure blocks further SDK work.

The printed evidence directory contains `package-evidence.json`, `result.json`, the built `index.html`, and build/application logs. Tests use `build/plugin-t0-artifacts/`, which Electrobun recreates on every run. Do not store unrelated files there. Nothing is published or uploaded.

`VITE_PLUGIN_T0=1` enables the renderer-only experimental import-map SDK entries. `GHOSTBOARD_PLUGIN_T0_DIR` enables the host's experimental routes, but only in `dev` channel runs or in non-stable builds compiled with `GHOSTBOARD_ENABLE_PLUGIN_T0=1` (the runner sets it); a stable build ignores the variable. They are **T0 fixtures, not the T1 public SDK**. An ordinary build has neither the probe nor the experimental SDK entries in its renderer; an ordinary launch exposes no T0 routes. To restore an ordinary canary build without replacing the repository's default `artifacts/` directory:

```sh
GHOSTBOARD_BUILD_ARTIFACT_DIR=build/plugin-t0-regular-artifacts bun run build:canary
```

Do not run Vite/Paraglide generation concurrently with Vitest: generation recreates `src/paraglide/` while tests import it. The host needs Bun, Node, `tar`, `zstd`, and the macOS packaging tools. Linux and Windows are intentionally not claimed by this runner.

The runtime contract is `docs/tech-spec.md` §13. This runner's pass/fail output is the acceptance record; it is not checked in.
