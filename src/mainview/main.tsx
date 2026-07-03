import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from 'better-themes';
import { domAnimation, LazyMotion } from 'motion/react';
import ReactDOM from 'react-dom/client';

import { router } from '@/router';

import './index.css';

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
    </LazyMotion>
  </ThemeProvider>
);
