/**
 * Build-time switches that compile the trusted-plugin probes (T0–T5) into a
 * build. Exact names only: unrelated variables such as `VITE_PLUGIN_THEME`
 * must never turn the probes on.
 *
 * Run directly (`bun scripts/plugin-probe-flags.ts`) to fail when any of them
 * is set; `build:stable` does this before building.
 */
export const RENDERER_PROBE_FLAGS = [
  'VITE_PLUGIN_T0',
  'VITE_PLUGIN_T1',
  'VITE_PLUGIN_T2_A4',
  'VITE_PLUGIN_T2_CANVAS',
  'VITE_PLUGIN_T2_CONTENT',
  'VITE_PLUGIN_T2_HISTORY',
  'VITE_PLUGIN_T2_SELECTION',
  'VITE_PLUGIN_T3',
  'VITE_PLUGIN_T4',
  'VITE_PLUGIN_T5',
] as const;

export const HOST_PROBE_FLAGS = [
  'GHOSTBOARD_ENABLE_PLUGIN_T0',
  'GHOSTBOARD_ENABLE_PLUGIN_PROBES',
] as const;

/** Probe build flags set to `1` in `env`. */
export function enabledProbeFlags(
  env: Record<string, string | undefined>
): string[] {
  return [...RENDERER_PROBE_FLAGS, ...HOST_PROBE_FLAGS].filter(
    (name) => env[name] === '1'
  );
}

if (import.meta.main) {
  const enabled = enabledProbeFlags(process.env);
  if (enabled.length > 0) {
    console.error(
      `Refusing a stable build with plugin probe flags set: ${enabled.join(', ')}. Unset them and rebuild.`
    );
    process.exit(1);
  }
}
