import {
  assertPermissionCatalogIntegrity,
  permissionCatalog,
  permissionCatalogKeys,
  validatePermissionKeys,
} from "../src/rbac/catalog";
import {
  DEV_SALES_PERMISSIONS,
  DEV_WAREHOUSE_PERMISSIONS,
  PHASE1_SALES_PERMISSIONS,
} from "./seed-permissions";

function assertValidSeedPermissions(label: string, permissions: readonly string[]) {
  const { invalid } = validatePermissionKeys([...permissions]);
  if (invalid.length > 0) {
    throw new Error(`[RBAC preflight] ${label} contains invalid permission keys: ${invalid.join(", ")}`);
  }
}

function main() {
  assertPermissionCatalogIntegrity();

  const uniqueCatalogKeys = new Set(permissionCatalogKeys);
  if (uniqueCatalogKeys.size !== permissionCatalogKeys.length) {
    throw new Error("[RBAC preflight] Duplicate permission keys found in aggregated catalog.");
  }

  assertValidSeedPermissions("dev.sales", DEV_SALES_PERMISSIONS);
  assertValidSeedPermissions("dev.warehouse", DEV_WAREHOUSE_PERMISSIONS);
  assertValidSeedPermissions("phase1.sales", PHASE1_SALES_PERMISSIONS);

  console.log(
    JSON.stringify(
      {
        ok: true,
        catalogSize: permissionCatalog.length,
        catalogKeys: permissionCatalogKeys,
      },
      null,
      2,
    ),
  );
}

main();
