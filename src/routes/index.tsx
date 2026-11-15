import { createFileRoute } from "@tanstack/react-router";
import { App } from "@/components/life/app";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <App />;
}
