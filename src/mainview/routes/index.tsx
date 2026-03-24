import { createFileRoute } from "@tanstack/react-router";
import { Loader } from "@/components/layout/Loader";
import * as m from "../../paraglide/messages.js";

export const Route = createFileRoute("/")({
  component: HomeComponent,
  pendingComponent: Loader,
});

function HomeComponent() {
  return (
    <div className="relative flex size-full flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">{m.home_title()}</h1>
      <p className="text-lg text-gray-600">{m.home_description()}</p>
      <p>{m.example_message({ username: "Laogui" })}</p>
    </div>
  );
}
