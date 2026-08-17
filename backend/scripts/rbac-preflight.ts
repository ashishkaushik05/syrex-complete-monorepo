import {
  assertPermissionCatalogIntegrity,
  permissionCatalog,
  permissionCatalogKeys,
  validatePermissionKeys,
} from "../src/rbac/catalog";
import {
  DEV_SALES_PERMISSIONS,
  DEV_WAREHOUSE_PERMISSIONS,
  DISTRIBUTION_HEAD_PERMISSIONS,
  OUTLET_PERMISSIONS,
  PHASE1_SALES_PERMISSIONS,
  SERVICE_ASI_PERMISSIONS,
  SERVICE_SE_PERMISSIONS,
  SERVICE_RSM_PERMISSIONS,
  SERVICE_HAPPY_CALLING_PERMISSIONS,
  SERVICE_HEAD_PERMISSIONS,
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

  const seededRoles = {
    sales: DEV_SALES_PERMISSIONS,
    warehouse: DEV_WAREHOUSE_PERMISSIONS,
    distributionHead: DISTRIBUTION_HEAD_PERMISSIONS,
    outlet: OUTLET_PERMISSIONS,
    asi: SERVICE_ASI_PERMISSIONS,
    serviceEngineer: SERVICE_SE_PERMISSIONS,
    rsm: SERVICE_RSM_PERMISSIONS,
    customerExecutive: SERVICE_HAPPY_CALLING_PERMISSIONS,
    serviceHead: SERVICE_HEAD_PERMISSIONS,
    phase1Sales: PHASE1_SALES_PERMISSIONS,
  } as const;

  for (const [label, permissions] of Object.entries(seededRoles)) {
    assertValidSeedPermissions(label, permissions);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        catalogSize: permissionCatalog.length,
        validatedSeedRoles: Object.keys(seededRoles),
        catalogKeys: permissionCatalogKeys,
      },
      null,
      2,
    ),
  );
}

main();
