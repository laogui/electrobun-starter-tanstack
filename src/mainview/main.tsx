import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from 'better-themes';
import { domAnimation, LazyMotion } from 'motion/react';
import ReactDOM from 'react-dom/client';

import { registerBuiltinCanvasTypes } from '@/extensions/registerBuiltins';
import { connectExtensionTaskDispatcher } from '@/extensions/taskDispatcher';
import {
  reportRendererError,
  startRendererDiagnostics,
} from '@/lib/diagnostics';
import { startPerfMarks } from '@/lib/perfMarks';
import { router } from '@/router';
import { PluginWorkbench, startPluginRuntime } from './plugins/runtime';
import { connectPluginHostEvents } from './plugins/runtime/hostEvents';
import { pluginRuntime } from './plugins/runtime/PluginRuntime';

import '@xyflow/react/dist/style.css';
import 'overlayscrollbars/overlayscrollbars.css';
import './index.css';

startPerfMarks();

const stopDiagnostics = startRendererDiagnostics();
import.meta.hot?.dispose(stopDiagnostics);

registerBuiltinCanvasTypes();

// Trusted-plugin verification probes (scripts/trusted-plugin-t*/run.ts) are
// compiled in only when a harness sets a VITE_PLUGIN_T* flag or in the dev
// server; see vite.config.ts. Release `vite build` folds the constant to
// false so neither the loader nor any probe chunk ships.
if (__GHOSTBOARD_PLUGIN_PROBES__) {
  import('./plugins/probes')
    .then(({ startPluginProbes }) => startPluginProbes())
    .catch(console.error);
}

const rootElement = document.querySelector('#root');

if (rootElement == null) {
  throw new Error("Root element with id 'root' not found in index.html");
}

const root = ReactDOM.createRoot(rootElement, {
  onCaughtError: (error, info) =>
    reportRendererError(error, info.componentStack),
  onUncaughtError: (error, info) => {
    console.error(error);
    reportRendererError(error, info.componentStack);
  },
});
root.render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    {/* Components import `motion/react-m` (lightweight `m.*`); LazyMotion must
        provide the animation features or they stay frozen at `initial`. */}
    <LazyMotion features={domAnimation}>
      <RouterProvider router={router} />
      {import.meta.env.VITE_PLUGIN_T0 !== '1' ? <PluginWorkbench /> : null}
    </LazyMotion>
  </ThemeProvider>
);

if (import.meta.env.VITE_PLUGIN_T0 !== '1') {
  const disconnectEvents = connectPluginHostEvents(pluginRuntime);
  const disconnectTasks = connectExtensionTaskDispatcher();
  const stopPlugins = startPluginRuntime();
  import.meta.hot?.dispose(() => {
    disconnectEvents();
    disconnectTasks();
    stopPlugins();
  });
}
