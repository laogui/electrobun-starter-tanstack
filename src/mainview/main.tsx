import { ThemeProvider } from "better-themes";
import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { router } from "@/router";
import "./index.css";
import "./styles/mobile-gestures.css";

const rootElement = document.querySelector("#root");

if (rootElement == null) {
  throw new Error("Root element with id 'root' not found in index.html");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <ThemeProvider enableSystem attribute="class" defaultTheme="system">
    <RouterProvider router={router} />
  </ThemeProvider>,
);
