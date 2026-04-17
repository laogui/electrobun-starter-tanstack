import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from 'better-themes';
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
    <RouterProvider router={router} />
  </ThemeProvider>
);
