import { TanStackDevtools } from "@tanstack/react-devtools";
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Toaster } from "@/components/ui/Toaster";
import { getLocale, setLocale } from "../../paraglide/runtime.js";

export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootDocument,
});

function RootDocument() {
  return (
    <>
      <div className="fixed top-2 right-2 z-50">
        <select
          value={getLocale()}
          onChange={(e) => setLocale(e.target.value as "en" | "zh")}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-sm shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </div>
      <Outlet />
      <Toaster richColors />

      <TanStackDevtools
        config={{
          position: "bottom-right",
          hideUntilHover: true,
        }}
        plugins={[
          {
            name: "TanStack Query",
            render: <ReactQueryDevtoolsPanel />,
          },
          {
            name: "TanStack Router",
            render: <TanStackRouterDevtoolsPanel />,
          },
          formDevtoolsPlugin(),
        ]}
      />
    </>
  );
}
