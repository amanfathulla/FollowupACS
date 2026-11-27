import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Dashboard Utama — ACS CRM" },
    { name: "description", content: "Urus lead dan susulan WhatsApp ACS CRM." },
    { property: "og:title", content: "Dashboard Utama — ACS CRM" },
    { property: "og:description", content: "Urus lead dan susulan WhatsApp ACS CRM." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/leads" });
  },
});
