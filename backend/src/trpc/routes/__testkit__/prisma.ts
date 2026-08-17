// Generic prisma-mock helpers. The mock returns ROWS, never identity.
//
// `matchesWhere` understands the common Prisma where shapes the routes use:
// scalar equality, { equals }, { in }, { not }, { contains }/{ startsWith } (string,
// optional insensitive), numeric { gt/gte/lt/lte }, and nested AND/OR arrays. If an
// endpoint relies on a `where` clause for SCOPING, this must actually apply it —
// otherwise the scope test is theater (plan/testing/CONVENTIONS.md §3).

type Where = Record<string, unknown> | undefined | null;

function matchScalar(value: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== "object") {
    return value === cond;
  }
  const c = cond as Record<string, unknown>;
  if ("equals" in c) return value === c.equals;
  if ("not" in c) return value !== c.not;
  if ("in" in c) return Array.isArray(c.in) && c.in.includes(value as never);
  if ("notIn" in c) return Array.isArray(c.notIn) && !c.notIn.includes(value as never);
  if ("contains" in c || "startsWith" in c || "endsWith" in c) {
    let s = String(value ?? "");
    let needle = String((c.contains ?? c.startsWith ?? c.endsWith) ?? "");
    if (c.mode === "insensitive") {
      s = s.toLowerCase();
      needle = needle.toLowerCase();
    }
    if ("contains" in c) return s.includes(needle);
    if ("startsWith" in c) return s.startsWith(needle);
    return s.endsWith(needle);
  }
  if ("gt" in c) return (value as number) > (c.gt as number);
  if ("gte" in c) return (value as number) >= (c.gte as number);
  if ("lt" in c) return (value as number) < (c.lt as number);
  if ("lte" in c) return (value as number) <= (c.lte as number);
  return false;
}

export function matchesWhere(row: Record<string, unknown>, where: Where): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === "AND") {
      const arr = (cond as Where[]) ?? [];
      if (!arr.every((sub) => matchesWhere(row, sub))) return false;
      continue;
    }
    if (key === "OR") {
      const arr = (cond as Where[]) ?? [];
      if (arr.length > 0 && !arr.some((sub) => matchesWhere(row, sub))) return false;
      continue;
    }
    if (key === "NOT") {
      if (matchesWhere(row, cond as Where)) return false;
      continue;
    }
    if (!matchScalar(row[key], cond)) return false;
  }
  return true;
}

// Builds a model-level mock (findMany/findFirst/findUnique/count) over an in-memory
// array, applying matchesWhere + skip/take. Pass intention-revealing row factories in.
export function collection<T extends Record<string, unknown>>(rows: T[]) {
  return {
    findMany: async (args: { where?: Where; skip?: number; take?: number } = {}) => {
      const filtered = rows.filter((r) => matchesWhere(r, args.where));
      const start = args.skip ?? 0;
      const end = start + (args.take ?? filtered.length);
      return filtered.slice(start, end);
    },
    findFirst: async (args: { where?: Where } = {}) =>
      rows.find((r) => matchesWhere(r, args.where)) ?? null,
    findUnique: async (args: { where?: Where } = {}) =>
      rows.find((r) => matchesWhere(r, args.where)) ?? null,
    count: async (args: { where?: Where } = {}) =>
      rows.filter((r) => matchesWhere(r, args.where)).length,
  };
}
