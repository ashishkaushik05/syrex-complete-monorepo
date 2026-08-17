import { describe, expect, it } from "bun:test";
import {
  P,
  SUPER_ADMIN_PERMISSION,
  assertPermissionCatalogIntegrity,
  isCatalogPermissionKey,
  permissionCatalog,
  permissionCatalogKeySet,
  permissionCatalogKeys,
  validatePermissionKeys,
} from "./catalog";

// catalog.ts is the assembled, app-wide permission registry. These tests pin the public
// contract every role + perm() depends on: the catalog is non-empty and unique, the `*`
// wildcard is accepted everywhere, and validatePermissionKeys cleanly separates real keys
// from typos (the exact thing that stops a role being seeded with a dead permission).

describe("permission catalog integrity", () => {
  it("is non-empty", () => {
    expect(permissionCatalog.length).toBeGreaterThan(0);
    expect(() => assertPermissionCatalogIntegrity()).not.toThrow();
  });

  it("has unique keys matching the module:action shape", () => {
    const seen = new Set<string>();
    for (const key of permissionCatalogKeys) {
      expect(key).toMatch(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(permissionCatalogKeys.length);
  });

  it("keeps the P map in sync with the catalog key set", () => {
    for (const module of Object.values(P)) {
      for (const key of Object.values(module)) {
        expect(permissionCatalogKeySet.has(key)).toBe(true);
      }
    }
  });
});

describe("isCatalogPermissionKey", () => {
  it("accepts a known key", () => {
    expect(isCatalogPermissionKey(P.orders.read)).toBe(true);
  });

  it("rejects an unknown key", () => {
    expect(isCatalogPermissionKey("orders:teleport")).toBe(false);
  });

  it("does not treat the wildcard as a catalog key", () => {
    // `*` is authority, not a catalog entry — it must not appear in the registry.
    expect(isCatalogPermissionKey(SUPER_ADMIN_PERMISSION)).toBe(false);
  });
});

describe("validatePermissionKeys", () => {
  it("passes the wildcard through as valid", () => {
    const out = validatePermissionKeys([SUPER_ADMIN_PERMISSION]);
    expect(out.invalid).toEqual([]);
    expect(out.valid).toContain("*");
  });

  it("separates real keys from typos", () => {
    const out = validatePermissionKeys([P.orders.read, "orders:teleport", P.users.write]);
    expect(out.invalid).toEqual(["orders:teleport"]);
    expect(out.valid).toContain(P.orders.read);
    expect(out.valid).toContain(P.users.write);
  });

  it("dedupes the input set", () => {
    const out = validatePermissionKeys([P.orders.read, P.orders.read]);
    expect(out.valid.filter((k) => k === P.orders.read)).toHaveLength(1);
  });

  it("reports an all-invalid set", () => {
    const out = validatePermissionKeys(["a:b", "c:d"]);
    expect(out.invalid).toEqual(["a:b", "c:d"]);
  });
});
