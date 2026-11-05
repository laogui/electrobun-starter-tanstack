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
import { connectNoteChangeSync } from '@/lib/noteChangeSync';
import { startPerfMarks } from '@/lib/perfMarks';
import { router } from '@/router';

import '@xyflow/react/dist/style.css';
import 'overlayscrollbars/overlayscrollbars.css';
import './index.css';

startPerfMarks();

const stopDiagnostics = startRendererDiagnostics();
import.meta.hot?.dispose(stopDiagnostics);

registerBuiltinCanvasTypes();

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
    </LazyMotion>
  </ThemeProvider>
);

const disconnectNoteSync = connectNoteChangeSync();
const disconnectTasks = connectExtensionTaskDispatcher();
import.meta.hot?.dispose(() => {
  disconnectNoteSync();
  disconnectTasks();
});
