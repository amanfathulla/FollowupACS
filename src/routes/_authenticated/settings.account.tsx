import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, KeyRound, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getMyRole } from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/settings/account")({
  component: AccountSettingsPage,
  head: () => ({
    meta: [
      { title: "Setting Akaun · ACS CRM" },
      {
        name: "description",
        content: "Kemaskini emel dan kata laluan akaun admin ACS CRM.",
      },
      { property: "og:title", content: "Setting Akaun · ACS CRM" },
      {
        property: "og:description",
        content: "Kemaskini emel dan kata laluan akaun admin ACS CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AccountSettingsPage() {
  const getMyRoleFn = useServerFn(getMyRole);
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyRoleFn() });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"email" | "password" | null>(null);

  async function changeEmail() {
    if (!email.trim()) return;
    setBusy("email");
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Emel pengesahan dihantar ke alamat baharu. Klik pautan untuk sahkan.");
    setEmail("");
  }

  async function changePassword() {
    if (password.length < 8) return toast.error("Kata laluan minimum 8 aksara");
    if (password !== confirm) return toast.error("Kata laluan tidak sama");
    setBusy("password");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Kata laluan dikemaskini");
    setPassword("");
    setConfirm("");
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Setting Akaun</h1>
        <p className="text-sm text-muted-foreground">
          Tukar emel dan kata laluan akaun anda.
        </p>
      </div>

      <Card className="p-6 rounded-2xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="font-medium">{me.data?.email ?? "—"}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              Peranan:
              {(me.data?.roles ?? []).length === 0 ? (
                <Badge variant="outline">tiada</Badge>
              ) : (
                (me.data?.roles ?? []).map((r: string) => (
                  <Badge key={r} variant="outline">
                    {r}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-2 font-medium">
          <Mail className="w-4 h-4" /> Tukar emel
        </div>
        <div>
          <Label htmlFor="email">Emel baharu</Label>
          <Input
            id="email"
            type="email"
            placeholder="admin@syarikat.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Emel pengesahan akan dihantar ke alamat baharu sebelum ia bertukar.
          </p>
        </div>
        <Button onClick={changeEmail} disabled={!email || busy === "email"}>
          Simpan emel
        </Button>
      </Card>

      <Card className="p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-2 font-medium">
          <KeyRound className="w-4 h-4" /> Tukar kata laluan
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="pw">Kata laluan baharu</Label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pw2">Ulang kata laluan</Label>
            <Input
              id="pw2"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        <Button
          onClick={changePassword}
          disabled={!password || !confirm || busy === "password"}
        >
          Kemaskini kata laluan
        </Button>
      </Card>
    </div>
  );
}
