import { definePermissionModule } from "../core";

export const CATALOG_P = {
  read: "catalog:read",
  write: "catalog:write",
  delete: "catalog:delete",
} as const;

export const catalogManifest = definePermissionModule({
  module: "catalog",
  group: "Catalog",
  permissions: CATALOG_P,
  entries: {
    read: { label: "Read Catalog", description: "View brands, categories, products, and images.", risk: "low" },
    write: { label: "Manage Catalog", description: "Create and update catalog entities and media.", risk: "medium" },
    delete: { label: "Delete Catalog Entries", description: "Remove images and catalog records permanently.", risk: "high" },
  },
});
