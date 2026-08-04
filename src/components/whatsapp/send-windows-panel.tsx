import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, Moon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  listSendWindows,
  updateSendWindow,
  getSettings,
  updateSettings,
  getMyRole,
} from "@/lib/whatsapp.functions";

const DAY_LABEL = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
const TIMEZONES = ["Asia/Kuala_Lumpur", "Asia/Singapore", "Asia/Jakarta", "UTC"];

type WindowRow = {
  day_of_week: number;
  is_enabled: boolean;
  start_time: string;
  end_time: string;
};

export function SendWindowsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSendWindows);
  const updateFn = useServerFn(updateSendWindow);
  const getSettingsFn = useServerFn(getSettings);
  const updateSettingsFn = useServerFn(updateSettings);
  const getMyRoleFn = useServerFn(getMyRole);

  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyRoleFn() });
  const isAdmin = me.data?.isAdmin ?? false;

  const windows = useQuery({ queryKey: ["send-windows"], queryFn: () => listFn() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => getSettingsFn() });

  const mutation = useMutation({
    mutationFn: (payload: {
      day_of_week: number;
      is_enabled?: boolean;
      start_time?: string;
      end_time?: string;
    }) => updateFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["send-windows"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal simpan"),
  });

  const tzMutation = useMutation({
    mutationFn: (tz: string) => updateSettingsFn({ data: { send_timezone: tz } }),
    onSuccess: () => {
      toast.success("Zon waktu dikemaskini");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal simpan"),
  });

  const rows = (windows.data ?? []) as WindowRow[];
  const tz = (settings.data as any)?.send_timezone ?? "Asia/Kuala_Lumpur";

  return (
    <Card className="p-6 rounded-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-info/15 text-info flex items-center justify-center">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <div className="font-medium">Waktu Aktif & Masa Rehat</div>
            <div className="text-xs text-muted-foreground">
              Mesej hanya dihantar dalam waktu aktif setiap hari. Hari yang dimatikan = hari
              rehat (tiada mesej).
            </div>
          </div>
        </div>
        <div className="min-w-[220px]">
          <Label className="text-xs">Zon waktu</Label>
          <Select value={tz} onValueChange={(v) => tzMutation.mutate(v)} disabled={!isAdmin}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((w) => (
          <div
            key={w.day_of_week}
            className={`rounded-xl border p-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:gap-4 ${
              w.is_enabled ? "" : "bg-muted/40"
            }`}
          >
            <div className="min-w-0 sm:w-24 sm:shrink-0">
              <div className="text-sm font-medium">{DAY_LABEL[w.day_of_week]}</div>
              {w.is_enabled ? (
                <Badge
                  variant="outline"
                  className="mt-1 bg-success/15 text-success border-success/30"
                >
                  Aktif
                </Badge>
              ) : (
                <Badge variant="outline" className="mt-1 bg-muted text-muted-foreground">
                  <Moon className="w-3 h-3 mr-1" /> Rehat
                </Badge>
              )}
            </div>

            <Switch
              checked={w.is_enabled}
              disabled={!isAdmin}
              className="shrink-0 sm:order-3"
              onCheckedChange={(v) =>
                mutation.mutate({ day_of_week: w.day_of_week, is_enabled: v })
              }
            />

            <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:flex-1 sm:order-2">
              <Input
                type="time"
                value={String(w.start_time).slice(0, 5)}
                disabled={!isAdmin || !w.is_enabled}
                onChange={(e) =>
                  mutation.mutate({ day_of_week: w.day_of_week, start_time: e.target.value })
                }
                className="w-full sm:w-[120px]"
              />
              <span className="text-muted-foreground text-sm">—</span>
              <Input
                type="time"
                value={String(w.end_time).slice(0, 5)}
                disabled={!isAdmin || !w.is_enabled}
                onChange={(e) =>
                  mutation.mutate({ day_of_week: w.day_of_week, end_time: e.target.value })
                }
                className="w-full sm:w-[120px]"
              />
            </div>
          </div>
        ))}
      </div>


      <p className="text-xs text-muted-foreground">
        Followup yang jatuh luar waktu aktif tidak dibuang — ia kekal pending dan akan dihantar
        sebaik masuk waktu aktif berikutnya.
      </p>
    </Card>
  );
}
