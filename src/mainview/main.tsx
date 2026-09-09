import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from 'better-themes';
import { domAnimation, LazyMotion } from 'motion/react';
import ReactDOM from 'react-dom/client';

import { registerBuiltinCanvasTypes } from '@/extensions/registerBuiltins';
import { router } from '@/router';
import { PluginWorkbench, startPluginRuntime } from './plugins/runtime';
import { connectPluginHostEvents } from './plugins/runtime/hostEvents';
import { pluginRuntime } from './plugins/runtime/PluginRuntime';

import '@xyflow/react/dist/style.css';
import 'overlayscrollbars/overlayscrollbars.css';
import './index.css';

registerBuiltinCanvasTypes();

if (import.meta.env.VITE_PLUGIN_T0 === '1') {
  import('./plugins/t0/run')
    .then(({ runT0Probe }) => runT0Probe())
    .catch(console.error);
}

const rootElement = document.querySelector('#root');

if (rootElement == null) {
  throw new Error("Root element with id 'root' not found in index.html");
}

const root = ReactDOM.createRoot(rootElement);
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
  const stopPlugins = startPluginRuntime();
  import.meta.hot?.dispose(() => {
    disconnectEvents();
    stopPlugins();
  });
}
if (import.meta.env.VITE_PLUGIN_T2_SELECTION === '1') {
  import('./plugins/t2-selection/run')
    .then(({ runT2SelectionProbe }) => runT2SelectionProbe())
    .catch(console.error);
}
if (import.meta.env.VITE_PLUGIN_T2_CONTENT === '1') {
  import('./plugins/t2-content/run')
    .then(({ runT2ContentProbe }) => runT2ContentProbe())
    .catch(console.error);
}
if (import.meta.env.VITE_PLUGIN_T2_A4 === '1') {
  import('./plugins/t2-a4/run')
    .then(({ runT2A4Probe }) => runT2A4Probe())
    .catch(console.error);
}
if (import.meta.env.VITE_PLUGIN_T1 === '1') {
  import('./plugins/t1/run')
    .then(({ runT1Probe }) => runT1Probe())
    .catch(console.error);
}
