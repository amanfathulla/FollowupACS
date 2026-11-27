import { choose } from "spintax";

export const MAX_IMAGE_VARIATIONS = 5;

export function validateImageSelection(existing: number, incoming: number) {
  if (existing + incoming > MAX_IMAGE_VARIATIONS) {
    throw new Error("Maksimum 5 gambar bagi setiap mesej.");
  }
}

export function selectMessageMedia(step: { media_type: string | null; media_url: string | null; media_urls?: string[] }, random = Math.random): string | null {
  const paths = step.media_type === "image" && step.media_urls?.length ? step.media_urls : [];
  return paths.length ? paths[Math.min(paths.length - 1, Math.floor(random() * paths.length))] ?? null : step.media_url;
}

// Resolve only choice groups; placeholders and literal braces stay intact.
// Innermost-first also supports nested choices without enumerating combinations.
export function renderMessageVariation(template: string, enabled: boolean, vars: Record<string, string | null | undefined>, random = Math.random): string {
  const placeholders: string[] = [];
  let text = template.replace(/\{\{\s*\w+\s*\}\}/g, (token) => {
    placeholders.push(token);
    return `\uE000${placeholders.length - 1}\uE001`;
  });
  if (enabled) {
    let previous;
    do {
      previous = text;
      text = text.replace(/\{([^{}]*\|[^{}]*)\}/g, (group: string, options: string) => {
        const size = options.split("|").length;
        return choose(group)(Math.min(size - 1, Math.floor(random() * size)));
      });
    } while (text !== previous);
  }
  text = text.replace(/\uE000(\d+)\uE001/g, (_, index: string) => placeholders[Number(index)] ?? "");
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}