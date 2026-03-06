import { createFileRoute } from "@tanstack/react-router";
import { Loader } from "@/components/layout/Loader";

export const Route = createFileRoute("/")({
  component: HomeComponent,
  pendingComponent: Loader,
});

function HomeComponent() {
  return <div className="relative size-full">Hello world!!</div>;
}
