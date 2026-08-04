import { useEffect, useState } from "react";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  MessageCircle,
  Settings,
  LogOut,
  Users,
  MessageSquareText,
  MessagesSquare,
  Bot,
  UserCog,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});

const NAV = [
  { to: "/leads", label: "Lead Management", icon: Users },
  { to: "/livechat", label: "Live Chat", icon: MessagesSquare },
  { to: "/settings/whatsapp", label: "WhatsApp Automation", icon: Settings },
  { to: "/settings/messages", label: "Borang Mesej Harian", icon: MessageSquareText },
  { to: "/settings/chatbot", label: "AI Chatbot", icon: Bot },
  { to: "/settings/account", label: "Setting Akaun", icon: UserCog },
] as const;

function SidebarBody({
  email,
  pathname,
  onNavigate,
  onSignOut,
}: {
  email: string | undefined;
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        <div className="truncate font-semibold tracking-tight">ACS CRM</div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <div className="mb-2 truncate px-3 py-2 text-xs text-sidebar-foreground/60">{email}</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log keluar
        </Button>
      </div>
    </div>
  );
}

function AppShell() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const activeLabel = NAV.find((n) => n.to === pathname)?.label ?? "WhatsApp Followup Automation";

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 left-0 w-64">
          <SidebarBody email={user.email} pathname={pathname} onSignOut={signOut} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[17rem] border-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarBody
            email={user.email}
            pathname={pathname}
            onNavigate={() => setOpen(false)}
            onSignOut={signOut}
          />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 grid h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Buka menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <MessageCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">{activeLabel}</span>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
