/**
 * Loader for the trusted-plugin verification probes under plugins/t0…t5.
 *
 * These probes back the integration harnesses in scripts/trusted-plugin-t*
 * (each harness runs `vite build` with its VITE_PLUGIN_T* flag set and drives
 * the packaged app). They are test code, not product code: main.tsx imports
 * this module only behind the `__GHOSTBOARD_PLUGIN_PROBES__` build constant,
 * which is false for release builds, so this file and every probe chunk are
 * dropped from the production bundle. Each flag check stays a literal
 * `import.meta.env.VITE_PLUGIN_*` comparison so Vite can also fold the
 * individual branches and only emit the probe that was requested.
 */
export function startPluginProbes(): void {
  if (import.meta.env.VITE_PLUGIN_T0 === '1') {
    import('./t0/run')
      .then(({ runT0Probe }) => runT0Probe())
      .catch(console.error);
  }
  if (import.meta.env.VITE_PLUGIN_T2_SELECTION === '1') {
    import('./t2-selection/run')
      .then(({ runT2SelectionProbe }) => runT2SelectionProbe())
      .catch(console.error);
  }
  if (import.meta.env.VITE_PLUGIN_T2_CANVAS === '1') {
    import('./t2-canvas/run')
      .then(({ runT2CanvasProbe }) => runT2CanvasProbe())
      .catch(console.error);
  }
  if (import.meta.env.VITE_PLUGIN_T2_HISTORY === '1') {
    import('./t2-history/run')
      .then(({ runT2HistoryProbe }) => runT2HistoryProbe())
      .catch(console.error);
  }
  if (import.meta.env.VITE_PLUGIN_T2_CONTENT === '1') {
    import('./t2-content/run')
      .then(({ runT2ContentProbe }) => runT2ContentProbe())
      .catch(console.error);
  }
  if (import.meta.env.VITE_PLUGIN_T2_A4 === '1') {
    import('./t2-a4/run')
      .then(({ runT2A4Probe }) => runT2A4Probe())
      .catch(console.error);
  }
  if (import.meta.env.VITE_PLUGIN_T3 === '1') {
    import('./t3/run')
      .then(({ runT3Probe }) => runT3Probe())
      .catch(console.error);
  }
  if (import.meta.env.VITE_PLUGIN_T4 === '1') {
    import('./t4/run')
      .then(({ runT4Probe }) => runT4Probe())
      .catch(console.error);
  }
  if (import.meta.env.VITE_PLUGIN_T5 === '1') {
    import('./t5/run')
      .then(({ runT5Probe }) => runT5Probe())
      .catch(console.error);
  }
  if (import.meta.env.VITE_PLUGIN_T1 === '1') {
    import('./t1/run')
      .then(({ runT1Probe }) => runT1Probe())
      .catch(console.error);
  }
}
