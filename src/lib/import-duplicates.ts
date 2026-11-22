export function normalizeImportPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits || digits.startsWith("60")) return digits;
  return `60${digits.startsWith("0") ? digits.slice(1) : digits}`;
}

export function removeImportRow<T>(rows: T[], index: number): T[] {
  return rows.filter((_, rowIndex) => rowIndex !== index);
}

export function findImportDuplicates(rows: { name: string; phone: string }[]) {
  const groups = new Map<string, { phone: string; originals: string[]; names: string[]; count: number }>();
  for (const row of rows) {
    const phone = normalizeImportPhone(row.phone);
    if (!phone) continue;
    const group = groups.get(phone) ?? { phone, originals: [], names: [], count: 0 };
    group.count += 1;
    if (!group.originals.includes(row.phone)) group.originals.push(row.phone);
    group.names.push(row.name);
    groups.set(phone, group);
  }
  return [...groups.values()].filter((group) => group.count > 1);
}