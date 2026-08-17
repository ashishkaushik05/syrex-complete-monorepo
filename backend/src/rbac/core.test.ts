import { describe, expect, it } from "bun:test";
import {
  aggregatePermissionCatalog,
  definePermissionModule,
  SUPER_ADMIN_PERMISSION,
  type PermissionModuleManifest,
} from "./core";

// rbac/core is the source of truth for every perm() check. definePermissionModule and
// aggregatePermissionCatalog enforce the naming contract (module:action) and reject
// drift — duplicate keys, mismatched modules, malformed slugs. These guards are the
// reason a typo can't silently grant or shadow a permission.

describe("SUPER_ADMIN_PERMISSION", () => {
  it("is the wildcard", () => {
    expect(SUPER_ADMIN_PERMISSION).toBe("*");
  });
});

describe("definePermissionModule", () => {
  it("builds a catalog entry per permission with defaulted risk", () => {
    const m = definePermissionModule({
      module: "widgets",
      group: "Test",
      permissions: { read: "widgets:read", write: "widgets:write" },
      entries: {
        read: { label: "Read", description: "Read widgets." },
        write: { label: "Write", description: "Write widgets.", risk: "high" },
      },
    });
    expect(m.entries).toHaveLength(2);
    const read = m.entries.find((e) => e.action === "read")!;
    expect(read.key).toBe("widgets:read");
    expect(read.risk).toBe("low"); // defaulted
    expect(m.entries.find((e) => e.action === "write")!.risk).toBe("high");
  });

  it("rejects a module key that is not a lower-case slug", () => {
    expect(() =>
      definePermissionModule({
        module: "Widgets" as never,
        group: "T",
        permissions: { read: "Widgets:read" as never },
        entries: { read: { label: "R", description: "d" } },
      }),
    ).toThrow(/Invalid module key/i);
  });

  it("rejects a permission key whose module does not match", () => {
    expect(() =>
      definePermissionModule({
        module: "widgets",
        permissions: { read: "gadgets:read" as never },
        group: "T",
        entries: { read: { label: "R", description: "d" } },
      } as never),
    ).toThrow(/does not match module/i);
  });

  it("rejects a permission key whose action does not match the field", () => {
    expect(() =>
      definePermissionModule({
        module: "widgets",
        permissions: { read: "widgets:write" as never },
        group: "T",
        entries: { read: { label: "R", description: "d" } },
      } as never),
    ).toThrow(/action must match field/i);
  });

  it("rejects missing metadata (blank label/description)", () => {
    expect(() =>
      definePermissionModule({
        module: "widgets",
        permissions: { read: "widgets:read" },
        group: "T",
        entries: { read: { label: "  ", description: "d" } },
      }),
    ).toThrow(/Missing metadata/i);
  });
});

describe("aggregatePermissionCatalog", () => {
  const mod = (module: string, action: string) =>
    definePermissionModule({
      module: module as never,
      group: "G",
      permissions: { [action]: `${module}:${action}` } as never,
      entries: { [action]: { label: "L", description: "d" } } as never,
    }) as PermissionModuleManifest;

  it("merges entries and exposes a key set", () => {
    const cat = aggregatePermissionCatalog([mod("alpha", "read"), mod("beta", "write")]);
    expect(cat.keys).toContain("alpha:read");
    expect(cat.keys).toContain("beta:write");
    expect(cat.keySet.has("alpha:read")).toBe(true);
    expect(cat.keySet.has("missing:read")).toBe(false);
  });

  it("sorts entries by group, then module, then key", () => {
    const cat = aggregatePermissionCatalog([mod("zeta", "read"), mod("alpha", "read")]);
    // same group "G" → module order alpha before zeta
    expect(cat.keys).toEqual(["alpha:read", "zeta:read"]);
  });

  it("throws on a duplicate permission key", () => {
    expect(() => aggregatePermissionCatalog([mod("alpha", "read"), mod("alpha", "read")])).toThrow(
      /Duplicate permission key/i,
    );
  });
});
