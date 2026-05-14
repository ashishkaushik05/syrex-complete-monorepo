import { aggregatePermissionCatalog, SUPER_ADMIN_PERMISSION } from "./core";
import { ATTACHMENTS_P, attachmentsManifest } from "./modules/attachments";
import { CATALOG_P, catalogManifest } from "./modules/catalog";
import { DISPATCHES_P, dispatchesManifest } from "./modules/dispatches";
import { FIELD_P, fieldManifest } from "./modules/field";
import { INVENTORY_P, inventoryManifest } from "./modules/inventory";
import { INVOICES_P, invoicesManifest } from "./modules/invoices";
import { ORDERS_P, ordersManifest } from "./modules/orders";
import { OUTLETS_P, outletsManifest } from "./modules/outlets";
import { PAYMENTS_P, paymentsManifest } from "./modules/payments";
import { ROLES_P, rolesManifest } from "./modules/roles";
import { USERS_P, usersManifest } from "./modules/users";
import { WAREHOUSES_P, warehousesManifest } from "./modules/warehouses";

const manifests = [
  attachmentsManifest,
  catalogManifest,
  dispatchesManifest,
  fieldManifest,
  inventoryManifest,
  invoicesManifest,
  ordersManifest,
  outletsManifest,
  paymentsManifest,
  rolesManifest,
  usersManifest,
  warehousesManifest,
] as const;

const catalog = aggregatePermissionCatalog([...manifests]);

export const permissionCatalog = catalog.entries;
export const permissionCatalogKeys = catalog.keys;
export const permissionCatalogKeySet = catalog.keySet;

export const P = {
  attachments: ATTACHMENTS_P,
  catalog: CATALOG_P,
  dispatches: DISPATCHES_P,
  field: FIELD_P,
  inventory: INVENTORY_P,
  invoices: INVOICES_P,
  orders: ORDERS_P,
  outlets: OUTLETS_P,
  payments: PAYMENTS_P,
  roles: ROLES_P,
  users: USERS_P,
  warehouses: WAREHOUSES_P,
} as const;

export type CatalogPermission = {
  [M in keyof typeof P]: (typeof P)[M][keyof (typeof P)[M]];
}[keyof typeof P];

export function assertPermissionCatalogIntegrity() {
  // Accessing compiled constants guarantees manifest aggregation runs at startup/import time.
  if (permissionCatalog.length === 0) {
    throw new Error("[RBAC] Permission catalog is empty.");
  }
}

export function isCatalogPermissionKey(key: string): key is CatalogPermission {
  return permissionCatalogKeySet.has(key);
}

export function validatePermissionKeys(keys: string[]): { valid: string[]; invalid: string[] } {
  const invalid: string[] = [];
  const valid = Array.from(new Set(keys));

  for (const key of valid) {
    if (key === SUPER_ADMIN_PERMISSION) {
      continue;
    }
    if (!permissionCatalogKeySet.has(key)) {
      invalid.push(key);
    }
  }

  return { valid, invalid };
}

export { SUPER_ADMIN_PERMISSION };
