import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function ImageVariations({ paths, selected, onSelect, onRemove, disabled }: { paths: string[]; selected: string | null; onSelect: (path: string) => void; onRemove: (path: string) => void; disabled: boolean }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let current = true;
    void Promise.all(paths.map(async (path) => {
      if (/^https?:\/\//i.test(path)) return [path, path] as const;
      const [bucket, ...rest] = path.split("/");
      if (!bucket) return [path, ""] as const;
      const { data } = await supabase.storage.from(bucket).createSignedUrl(rest.join("/"), 3600);
      return [path, data?.signedUrl ?? ""] as const;
    })).then((entries) => { if (current) setUrls(Object.fromEntries(entries)); });
    return () => { current = false; };
  }, [paths]);
  return <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{paths.map((path, index) => <div key={path} className="relative min-w-0">
    <Button variant="outline" aria-label={`Pratonton gambar ${index + 1}`} aria-pressed={selected === path} onClick={() => onSelect(path)} className={`aspect-square h-auto w-full overflow-hidden p-1 ${selected === path ? "border-primary ring-2 ring-primary/30" : ""}`}>
      {urls[path] ? <img src={urls[path]} alt={`Variasi gambar ${index + 1}`} className="h-full w-full rounded-sm object-cover" /> : <span>{index + 1}</span>}
    </Button>
    <Button variant="secondary" size="icon" aria-label={`Buang gambar ${index + 1}`} disabled={disabled} onClick={() => onRemove(path)} className="absolute right-1 top-1 h-6 w-6"><X className="h-3 w-3" /></Button>
  </div>)}</div>;
}