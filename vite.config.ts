import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(async () => {
  const { devtools } = await import("@tanstack/devtools-vite");

  return {
    plugins: [
      devtools(),
      tsconfigPaths({
        projects: ["../../tsconfig.json"],
      }),
      tailwindcss(),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routesDirectory: "./routes",
        generatedRouteTree: "./routeTree.gen.ts",
      }),
      viteReact(),
    ],
    root: "src/mainview",
    build: {
      outDir: "../../dist",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
