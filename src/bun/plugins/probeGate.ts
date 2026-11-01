import { getAppChannel } from '../appPaths';

declare const __GHOSTBOARD_ENABLE_PLUGIN_PROBES__: boolean | undefined;

export type ProbeEnv = Readonly<Record<string, string | undefined>>;

const PROBE_ENV_PREFIX = 'GHOSTBOARD_PLUGIN_T';
// T0 has its own, stricter gate (t0Host.ts `isT0HostAllowed`).
const T0_ENV_PREFIX = 'GHOSTBOARD_PLUGIN_T0_';

/** Probe plugin IDs used by the T5 harness (scripts/trusted-plugin-t5). */
const T5_EXAMPLE_IDS: readonly string[] = [
  'example.hello',
  'example.react-hello',
  'example.csv-importer',
  'example.combined',
];

/** Whether this binary was compiled with the T1–T5 probe hosts enabled. */
export function probesCompiledIn(): boolean {
  return (
    typeof __GHOSTBOARD_ENABLE_PLUGIN_PROBES__ === 'boolean' &&
    __GHOSTBOARD_ENABLE_PLUGIN_PROBES__
  );
}

/**
 * Single gate for the T1–T5 trusted-plugin probes. An environment variable
 * alone must never turn them on in a shipped app: they swap in hosts with
 * loopback installs, skip safe mode, and auto-answer consent dialogs.
 *
 * Allowed only off the stable channel, and only in `dev` channel runs or in
 * builds compiled with `GHOSTBOARD_ENABLE_PLUGIN_PROBES=1` (the harnesses).
 * A run without the define (plain `bun`, tests) counts as not compiled in.
 */
export function probesAllowed(
  channel: string = getAppChannel(),
  compiledIn: boolean = probesCompiledIn()
): boolean {
  if (channel === 'stable') {
    return false;
  }
  return compiledIn || channel === 'dev';
}

/**
 * The `GHOSTBOARD_PLUGIN_T1…T5_*` variables, or `{}` when probes are not
 * allowed. Every probe read in the Bun process goes through this.
 */
export function probeEnv(
  env: Record<string, string | undefined> = process.env,
  allowed: boolean = probesAllowed()
): ProbeEnv {
  if (!allowed) {
    return {};
  }
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(PROBE_ENV_PREFIX) && !key.startsWith(T0_ENV_PREFIX)) {
      result[key] = value;
    }
  }
  return result;
}

/** A probe host directory that disables the startup guard (safe mode). */
export function probeHostActive(env: ProbeEnv = probeEnv()): boolean {
  return [
    env.GHOSTBOARD_PLUGIN_T1_DIR,
    env.GHOSTBOARD_PLUGIN_T2_A4_DIR,
    env.GHOSTBOARD_PLUGIN_T2_CANVAS_DIR,
    env.GHOSTBOARD_PLUGIN_T2_CONTENT_DIR,
    env.GHOSTBOARD_PLUGIN_T2_HISTORY_DIR,
    env.GHOSTBOARD_PLUGIN_T2_SELECTION_DIR,
    env.GHOSTBOARD_PLUGIN_T3_DIR,
  ].some(Boolean);
}

/** Any probe run where nobody is present to answer consent dialogs. */
export function scriptedProbesActive(env: ProbeEnv = probeEnv()): boolean {
  return (
    probeHostActive(env) ||
    Boolean(env.GHOSTBOARD_PLUGIN_T4_DIR || env.GHOSTBOARD_PLUGIN_T5_DIR)
  );
}

/**
 * Whether `pluginId` is one of the probe fixtures of an active harness. Only
 * these are auto-allowed by the scripted consent gate; every other plugin
 * still gets the real native prompt.
 */
export function isScriptedProbePlugin(
  pluginId: string,
  env: ProbeEnv = probeEnv()
): boolean {
  if (env.GHOSTBOARD_PLUGIN_T1_DIR && pluginId.startsWith('t1.')) {
    return true;
  }
  const t2 =
    env.GHOSTBOARD_PLUGIN_T2_A4_DIR ||
    env.GHOSTBOARD_PLUGIN_T2_CANVAS_DIR ||
    env.GHOSTBOARD_PLUGIN_T2_CONTENT_DIR ||
    env.GHOSTBOARD_PLUGIN_T2_HISTORY_DIR ||
    env.GHOSTBOARD_PLUGIN_T2_SELECTION_DIR;
  if (t2 && pluginId.startsWith('t2.')) {
    return true;
  }
  if (env.GHOSTBOARD_PLUGIN_T3_DIR && pluginId.startsWith('t3.')) {
    return true;
  }
  if (env.GHOSTBOARD_PLUGIN_T4_DIR && pluginId === 'community.example.t4') {
    return true;
  }
  return Boolean(
    env.GHOSTBOARD_PLUGIN_T5_DIR &&
      env.GHOSTBOARD_PLUGIN_T5_PICKER !== 'manual' &&
      T5_EXAMPLE_IDS.includes(pluginId)
  );
}
